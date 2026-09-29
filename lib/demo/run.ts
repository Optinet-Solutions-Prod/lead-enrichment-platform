import 'server-only'
import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getDatasetItems,
  getRun,
  mapItemsToResults,
  resolvePlatformApify,
  startRun,
} from '@/lib/scrape/apify-google'
import { fetchPageHtml, findContactPages } from '@/lib/scrape/inline-enrich'
import { scoreAffiliate, shouldSkipDomain } from '@/lib/affiliate-detection/scorer'
import { extractContacts } from '@/lib/contact-extraction/extract'
import { validatePhones } from '@/lib/contact-extraction/phone-validate'
import { nicheKeywordsFrom } from '@/lib/enrichment/score-stage'
import {
  audit,
  auditInstructions,
  brandFromLabel,
  ctaCandidates,
  extractLinks,
  hostOf,
  htmlToText,
  isOutboundCta,
  siteLabel,
  unmask,
  type PageLink,
} from '@/lib/ai-analysis/core'
import { judgeRelevance } from '@/lib/ai-analysis/relevance'
import { readKey } from '@/lib/ai-analysis/run'

/**
 * The landing-page demo, end to end, for a visitor with no account:
 *
 *   1. Search    one real Google page for the keyword in the country (Apify)
 *   2. Relevance every result is judged against the keyword; off-topic ones
 *                are shown but never opened
 *   3. Crawl     the relevant sites are fetched (homepage + a contact page)
 *   4. Classify  affiliate · operator (a brand's own site) · publisher
 *   5. Brands    for affiliates, the brands they endorse and the CTA links
 *                behind them (tracking redirects followed to the destination)
 *   6. Contacts  emails, phones, socials, contact page
 *
 * Steps 2 and 4 use the same OpenAI judges as the workspace (lib/ai-analysis)
 * when an API key is configured, and fall back to heuristics when it is not
 * or when a call fails. Lives in `demo_runs`, never in the org tables.
 */

export const DEMO_COUNTRIES: ReadonlyArray<{ code: string; name: string; lang: string }> = [
  { code: 'GB', name: 'United Kingdom', lang: 'en' },
  { code: 'US', name: 'United States', lang: 'en' },
  { code: 'DE', name: 'Germany', lang: 'de' },
  { code: 'FR', name: 'France', lang: 'fr' },
  { code: 'ES', name: 'Spain', lang: 'es' },
  { code: 'IT', name: 'Italy', lang: 'it' },
  { code: 'NL', name: 'Netherlands', lang: 'nl' },
  { code: 'MT', name: 'Malta', lang: 'en' },
  { code: 'SE', name: 'Sweden', lang: 'sv' },
  { code: 'PL', name: 'Poland', lang: 'pl' },
  { code: 'AU', name: 'Australia', lang: 'en' },
  { code: 'CA', name: 'Canada', lang: 'en' },
]

/** How many relevant results get opened. The rest are shown from the SERP only. */
export const DEMO_ENRICH_LIMIT = 8
const ENRICH_BATCH = 2
const LEAD_DEADLINE_MS = 42_000
const SEARCH_STALE_MS = 5 * 60 * 1000
const MAX_CTA_UNMASK = 6
const AI_AUDIT_TIMEOUT_MS = 32_000

export type DemoVerdict = 'affiliate' | 'not_affiliate' | 'unclear' | 'unknown'
export type DemoRelevance = 'relevant' | 'off_topic' | 'unknown'
export type DemoKind = 'affiliate' | 'operator' | 'publisher' | 'unknown'

export type DemoContacts = {
  emails: string[]
  phones: string[]
  socials: Array<{ platform: string; url: string }>
  contactPage: string | null
  forms: number
}

export type DemoBrand = { name: string; host: string; links: number }

export type DemoLead = {
  id: number
  domain: string
  url: string
  title: string
  snippet: string | null
  type: 'Organic' | 'PPC'
  position: number
  /** Judged against the keyword before anything is opened. */
  relevance: DemoRelevance
  relevanceReason: string | null
  /** What the site is, in a dozen words (from the relevance judge). */
  siteDescription: string | null
  /** The market the audit placed the site in ("VPN services"). */
  market: string | null
  /** Opened and scored (true), or left as a SERP-only row. */
  enriched: boolean
  /** Known platform / non-business host — never opened. */
  skipped: boolean
  fetchError: string | null
  /** What the site is once opened. */
  kind: DemoKind
  verdict: DemoVerdict
  confidence: string | null
  score: number | null
  indicators: string[]
  /** Brands the site sends visitors to, by CTA count. */
  brands: DemoBrand[]
  ctaLinks: number
  contacts: DemoContacts | null
}

export type DemoRun = {
  id: string
  /** True when the OpenAI judges are on for this deployment. */
  ai: boolean
  status: 'searching' | 'enriching' | 'done' | 'failed'
  keyword: string
  country_code: string
  language: string
  results: DemoLead[]
  total: number
  enriched: number
  error: string | null
  created_at: string
}

type Svc = ReturnType<typeof createServiceClient>

const RUN_COLS = 'id, status, keyword, country_code, language, results, total, enriched, error, created_at'
const FULL_COLS = `${RUN_COLS}, apify_run_id, dataset_id, lock_until`

type Row = DemoRun & { apify_run_id: string | null; dataset_id: string | null; lock_until: string | null }

export function hashIp(ip: string | null | undefined): string {
  const salt = process.env.CRON_SECRET ?? 'demo'
  return createHash('sha256').update(`${salt}:${ip ?? 'unknown'}`).digest('hex').slice(0, 32)
}

async function setting(svc: Svc, key: string): Promise<unknown> {
  const { data } = await svc.rpc('get_system_setting', { p_key: key })
  return data
}

function asInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

export function cleanKeyword(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const k = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (k.length < 2 || k.length > 80) return null
  return k
}

export async function startDemoRun(input: {
  keyword: unknown
  country: unknown
  ipHash: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
  const keyword = cleanKeyword(input.keyword)
  if (!keyword) return { ok: false, error: 'Enter a keyword between 2 and 80 characters.', status: 400 }
  const country = DEMO_COUNTRIES.find(c => c.code === String(input.country ?? '').toUpperCase())
  if (!country) return { ok: false, error: 'Pick one of the listed countries.', status: 400 }

  const svc = createServiceClient()
  if ((await setting(svc, 'demo_enabled')) === false) {
    return { ok: false, error: 'The live demo is paused right now — create a free account to run a scrape.', status: 503 }
  }

  // Abuse limits: per visitor per hour, and for everyone per day.
  const perIp = asInt(await setting(svc, 'demo_per_ip_per_hour'), 3)
  const perDay = asInt(await setting(svc, 'demo_per_day'), 120)
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [{ count: ipCount }, { count: dayCount }] = await Promise.all([
    svc.from('demo_runs').select('id', { count: 'exact', head: true }).eq('ip_hash', input.ipHash).gte('created_at', hourAgo),
    svc.from('demo_runs').select('id', { count: 'exact', head: true }).gte('created_at', dayAgo),
  ])
  if ((ipCount ?? 0) >= perIp) {
    return { ok: false, error: `That is ${perIp} demo scrapes in an hour from your connection — create a free account to keep going.`, status: 429 }
  }
  if ((dayCount ?? 0) >= perDay) {
    return { ok: false, error: 'The public demo has hit its daily limit. Create a free account to run your own scrape.', status: 429 }
  }

  const apify = await resolvePlatformApify(svc)
  if (!apify) return { ok: false, error: 'The demo is not configured on this deployment.', status: 503 }

  const { data: inserted, error: insErr } = await svc
    .from('demo_runs')
    .insert({ ip_hash: input.ipHash, keyword, country_code: country.code, language: country.lang, status: 'searching' })
    .select('id')
    .single()
  if (insErr || !inserted) return { ok: false, error: 'Could not start the demo. Try again in a moment.', status: 500 }
  const id = (inserted as { id: string }).id

  try {
    const run = await startRun(apify.token, {
      queries: keyword,
      countryCode: country.code.toLowerCase(),
      languageCode: country.lang,
      maxPagesPerQuery: 1,
      resultsPerPage: 10,
      mobileResults: false,
      includeUnfilteredResults: false,
      saveHtml: false,
      saveHtmlToKeyValueStore: false,
    })
    await svc.from('demo_runs').update({ apify_run_id: run.runId, dataset_id: run.datasetId, updated_at: new Date().toISOString() }).eq('id', id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await svc.from('demo_runs').update({ status: 'failed', error: `Google search could not start: ${msg}`.slice(0, 300) }).eq('id', id)
    return { ok: false, error: 'Google search could not start. Try again in a moment.', status: 502 }
  }
  return { ok: true, id }
}

function publicView(row: Row): DemoRun {
  return {
    id: row.id,
    ai: Boolean((process.env.OPENAI_API_KEY ?? '').trim()),
    status: row.status,
    keyword: row.keyword,
    country_code: row.country_code,
    language: row.language,
    results: Array.isArray(row.results) ? (row.results as DemoLead[]) : [],
    total: row.total,
    enriched: row.enriched,
    error: row.error,
    created_at: row.created_at,
  }
}

async function loadRow(svc: Svc, id: string): Promise<Row | null> {
  const { data } = await svc.from('demo_runs').select(FULL_COLS).eq('id', id).maybeSingle()
  return (data as unknown as Row | null) ?? null
}

/** Hosts that are never a partner to contact — search engines' own
 *  properties, marketplaces, encyclopedias. Shown, not opened. */
const PLATFORM_HOSTS = /(^|\.)(google|youtube|reddit|wikipedia|amazon|apple|microsoft|facebook|instagram|twitter|x|tiktok|linkedin|pinterest|quora|ebay|booking|airbnb|tripadvisor)\.[a-z.]+$/i

// ---------------------------------------------------------------- relevance ----

const RELEVANCE_STOP = new Set(['best', 'top', 'the', 'for', 'and', 'with', 'from', 'your', 'you', 'are', 'how', 'what', 'which', 'why', 'in', 'of', 'to', 'on', 'at', 'by', 'a', 'an', 'is', 'vs'])

/** Does this result talk about the keyword? Niche words (the nouns that name
 *  the market) weigh most; the rest of the keyword's words back them up. A
 *  result with none of them in its title, snippet or URL is off-topic and is
 *  never opened — that is where the OpenAI judge plugs in later. */
export function judgeRelevanceHeuristic(keyword: string, lead: Pick<DemoLead, 'title' | 'snippet' | 'url' | 'domain'>): DemoRelevance {
  const hay = `${lead.title} ${lead.snippet ?? ''} ${lead.url} ${lead.domain}`.toLowerCase()
  const niche = nicheKeywordsFrom(keyword)
  const words = keyword
    .toLowerCase()
    .split(/[^a-z0-9äöüßéèàùìòáíóúñç]+/i)
    .filter(w => w.length >= 3 && !RELEVANCE_STOP.has(w) && !/^\d+$/.test(w))
  if (niche.some(n => hay.includes(n))) return 'relevant'
  if (words.length === 0) return 'unknown'
  const hits = words.filter(w => hay.includes(w)).length
  return hits >= Math.max(1, Math.ceil(words.length / 2)) ? 'relevant' : 'off_topic'
}

function toLeads(items: unknown[], keyword: string, runId: string): DemoLead[] {
  const { results } = mapItemsToResults(items, { keyword, view_mode: 'desktop' }, { runId })
  return results.slice(0, 12).map((r, i) => {
    const domain = hostOf(r.url) || r.url
    const skipped = shouldSkipDomain(domain) || PLATFORM_HOSTS.test(domain)
    const base = { title: r.title || domain, snippet: r.description, url: r.url, domain }
    return {
      id: i + 1,
      domain,
      url: r.url,
      title: r.title || domain,
      snippet: r.description,
      type: r.resultType,
      position: r.overall_position,
      relevance: judgeRelevanceHeuristic(keyword, base),
      relevanceReason: null,
      siteDescription: null,
      market: null,
      enriched: false,
      skipped,
      fetchError: null,
      kind: 'unknown',
      verdict: 'unknown',
      confidence: null,
      score: null,
      indicators: [],
      brands: [],
      ctaLinks: 0,
      contacts: null,
    }
  })
}

// ---------------------------------------------------------------- brands + CTAs ----

const TRACKING_HINT = /\/(go|out|visit|click|track|redirect|aff|ref|link|offer|bonus|promo|recommends?)\/|[?&](ref|aff|affiliate|utm_|campaign|clickid|subid|tag)=/i

/** Share buttons and read-later services — page furniture, never a brand. */
const SHARE_HOST = /(flipboard|sharethis|addthis|getpocket|pocket\.co|mix\.com|digg\.com|news\.ycombinator|mastodon|bsky\.app|threads\.net|medium\.com)/i

/** cnetfrance.fr and zdnet.com next to cnet.com, casinoble.ro next to
 *  casinoble.com: the site's own family, not somebody it endorses. */
function isSibling(host: string, selfHost: string): boolean {
  const a = siteLabel(host)
  const b = siteLabel(selfHost)
  if (!a || !b) return false
  return a === b || (b.length >= 4 && a.startsWith(b)) || (a.length >= 4 && b.startsWith(a))
}

function prettyBrand(host: string, labels: string[]): string {
  const stem = /^https?:\/\//.test(host) && hostOf(host) ? '' : siteLabel(host)
  for (const l of labels) {
    const b = brandFromLabel(l)
    if (b && stem && b.toLowerCase().replace(/[^a-z0-9]/g, '').includes(stem.slice(0, 4))) return b
  }
  // A review-page slug ("nordvpn", "express-vpn") or the host's own label.
  const raw = stem || (labels.find(l => /^[a-z0-9-]+$/.test(l)) ?? hostOf(host) ?? host)
  const word = raw.replace(/-/g, '')
  const cased = word.replace(/vpn$/i, 'VPN').replace(/^vpn/i, 'VPN')
  return cased.charAt(0).toUpperCase() + cased.slice(1)
}

/** The brands a page sends its visitors to, counted by CTA. Direct external
 *  links resolve by hostname; cloaked or tracking links are followed (a few,
 *  briefly) to the destination. */
async function extractBrands(html: string, pageUrl: string, ownDomain: string): Promise<{ brands: DemoBrand[]; ctaLinks: number }> {
  const links: PageLink[] = extractLinks(html, pageUrl)
  const candidates = ctaCandidates({ status: 'ok', finalUrl: pageUrl, text: '', links })
  const selfHost = hostOf(pageUrl) || ownDomain

  const seen = new Set<string>()
  const direct: Array<{ host: string; label: string }> = []
  const cloaked: PageLink[] = []
  for (const l of candidates) {
    let abs: string
    try {
      abs = new URL(l.href, pageUrl).toString()
    } catch {
      continue
    }
    if (seen.has(abs)) continue
    seen.add(abs)
    const h = hostOf(abs)
    if (h && h !== selfHost && !isSibling(h, selfHost) && !SHARE_HOST.test(h) && !TRACKING_HINT.test(abs)) {
      direct.push({ host: h, label: l.label })
    } else if (h && (h === selfHost || TRACKING_HINT.test(abs)) && cloaked.length < MAX_CTA_UNMASK) {
      cloaked.push({ href: abs, label: l.label })
    }
  }

  const resolved = await Promise.all(
    cloaked.map(async l => {
      const u = await unmask(l.href, pageUrl, 5, 3500)
      return { u, label: l.label }
    }),
  )
  for (const { u, label } of resolved) {
    if (!u.host || !isOutboundCta(u, selfHost) || isSibling(u.host, selfHost) || SHARE_HOST.test(u.host)) continue
    direct.push({ host: u.host, label })
  }

  const byLabel = new Map<string, { host: string; links: number; labels: string[] }>()
  for (const d of direct) {
    const key = siteLabel(d.host)
    if (!key) continue
    const cur = byLabel.get(key) ?? { host: d.host, links: 0, labels: [] }
    cur.links += 1
    if (d.label) cur.labels.push(d.label)
    byLabel.set(key, cur)
  }

  // Comparison sites rarely link straight to a brand from the listing page;
  // they link to their own review of it (/vpn/nordvpn — "9.4 Review"). Those
  // review links name the brands the site endorses just as well.
  for (const l of links) {
    let abs: URL
    try {
      abs = new URL(l.href, pageUrl)
    } catch {
      continue
    }
    if (hostOf(abs.toString()) !== selfHost) continue
    const segs = abs.pathname.split('/').filter(Boolean)
    if (segs.length === 0 || segs.length > 3) continue
    const slug = (segs[segs.length - 1] ?? '').toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{2,24}$/.test(slug) || GENERIC_SLUG.has(slug) || /-vs-|^(best|top|how|what|why)-/.test(slug)) continue
    if (!REVIEW_LABEL.test(l.label)) continue
    const key = slug.replace(/-/g, '')
    const cur = byLabel.get(key) ?? { host: abs.toString(), links: 0, labels: [] }
    cur.links += 1
    cur.labels.push(slug)
    byLabel.set(key, cur)
  }

  const brands = [...byLabel.values()]
    .sort((a, b) => b.links - a.links)
    .slice(0, 6)
    .map(b => ({ name: prettyBrand(b.host, b.labels), host: b.host, links: b.links }))
  return { brands, ctaLinks: direct.length }
}

/** Anchor text that marks a link as an endorsement of the thing it names. */
const REVIEW_LABEL = /review|rating|\b\d\.\d\b|\b\d{1,2}\/10\b|\bvisit\b|get deal|claim|\btry\b|official|go to|sign ?up|read more/i

/** Same-host slugs that are sections, not brands. */
const GENERIC_SLUG = new Set([
  'free', 'best', 'usa', 'uk', 'us', 'speedtest', 'speed', 'review', 'reviews', 'compare', 'comparison', 'guide', 'guides',
  'deals', 'coupons', 'coupon', 'streaming', 'netflix', 'gaming', 'torrenting', 'privacy', 'security', 'business', 'pricing',
  'faq', 'about', 'about-us', 'contact', 'contact-us', 'blog', 'news', 'login', 'signup', 'register', 'privacy-policy', 'terms',
  'vpn', 'vpns', 'casino', 'casinos', 'hosting', 'crm', 'software', 'tools', 'apps', 'services', 'products', 'category',
  'tag', 'tags', 'author', 'page', 'search', 'sitemap', 'home', 'index', 'en', 'de', 'fr', 'es', 'it', 'nl', 'download',
  'android', 'ios', 'windows', 'mac', 'linux', 'firestick', 'router', 'test', 'tests', 'ranking', 'rankings', 'methodology',
])

// ---------------------------------------------------------------- enrichment ----

function verdictOf(classification: string, confidence: string): DemoVerdict {
  if (confidence === 'ERROR') return 'unknown'
  const strong = confidence === 'HIGH' || confidence === 'VERY_HIGH'
  if (classification === 'AFFILIATE') return strong ? 'affiliate' : 'unclear'
  return strong ? 'not_affiliate' : 'unclear'
}

/** Affiliate: sells traffic on to brands. Operator: a brand's own site (its
 *  name is the niche word, and it points nowhere else). Publisher: writes
 *  about the topic without a partner funnel. */
function kindOf(verdict: DemoVerdict, brands: DemoBrand[], ctaLinks: number, domain: string, niche: string[]): DemoKind {
  if (verdict === 'affiliate' || brands.length >= 2 || (verdict === 'unclear' && ctaLinks >= 3)) return 'affiliate'
  const label = siteLabel(domain)
  if (niche.some(n => label.includes(n)) && brands.length <= 1) return 'operator'
  return 'publisher'
}

type AiConfig = { key: string; triageModel: string; auditModel: string }

async function aiConfig(svc: Svc): Promise<AiConfig | null> {
  const key = await readKey(svc)
  if (!key) return null
  const t = await setting(svc, 'ai_triage_model')
  const a = await setting(svc, 'ai_crawl_model')
  return {
    key,
    triageModel: typeof t === 'string' && t ? t : 'gpt-5-mini',
    auditModel: typeof a === 'string' && a ? a : 'gpt-5-mini',
  }
}

/** The same relevance judge the workspace uses, over the SERP rows. Any
 *  failure leaves the heuristic verdicts in place. */
async function judgeRelevanceWithAi(svc: Svc, keyword: string, leads: DemoLead[]): Promise<void> {
  const ai = await aiConfig(svc)
  if (!ai || leads.length === 0) return
  try {
    const { verdicts } = await judgeRelevance(
      ai.key,
      ai.triageModel,
      leads.map(l => ({
        lead_id: l.id,
        profile_id: null,
        keyword,
        serp_title: l.title,
        serp_description: l.snippet,
        domain: l.domain,
      })),
    )
    for (const v of verdicts) {
      const lead = leads.find(l => l.id === v.lead_id)
      if (!lead) continue
      lead.relevance = v.relevant ? 'relevant' : 'off_topic'
      lead.relevanceReason = v.reason || null
      lead.siteDescription = v.description || null
    }
  } catch {
    /* heuristics stand */
  }
}

const AI_KIND: Record<string, DemoKind> = { affiliate: 'affiliate', operator: 'operator', publisher: 'publisher', other: 'unknown' }

async function enrichLead(lead: DemoLead, keyword: string, country: string, ai: AiConfig | null): Promise<DemoLead> {
  const home = await fetchPageHtml(lead.url, 7000)
  if (!home.html) {
    return { ...lead, enriched: true, fetchError: home.error ?? 'Could not open the site', kind: 'unknown', verdict: 'unknown' }
  }
  const niche = nicheKeywordsFrom(keyword)
  const [extraPages, brandsOut] = await Promise.all([
    (async () => {
      const extra = findContactPages(home.html!, home.url, 1)
      return Promise.all(extra.map(u => fetchPageHtml(u, 5000)))
    })(),
    extractBrands(home.html, home.url, lead.domain),
  ])
  const pages = [home, ...extraPages].filter(p => p.html)
  const joined = pages.map(p => `<!-- PAGE: ${p.url} -->\n${p.html}`).join('\n')

  const score = scoreAffiliate(home.html, lead.url, { nicheKeywords: niche })
  const verdict = verdictOf(score.classification, score.confidence)
  const contacts = extractContacts(joined, lead.url)
  let phones = validatePhones(contacts.phones, country)
  let emails = contacts.emails.slice(0, 3)
  let kind = kindOf(verdict, brandsOut.brands, brandsOut.ctaLinks, lead.domain, niche)
  let brands = brandsOut.brands
  let market: string | null = null
  let contactPage = contacts.contactPageUrl
  let indicators = score.indicators.slice(0, 3)

  // The workspace's audit judge, on the text we already fetched: what the
  // site is, which brands it endorses, the owner's contact details.
  if (ai) {
    try {
      const text = pages.map(p => ({ url: p.url, text: htmlToText(p.html!).slice(0, 12_000) }))
      const links = extractLinks(home.html, home.url).slice(0, 150)
      const { verdict: v } = await audit(ai.key, ai.auditModel, auditInstructions([]), text, links, AI_AUDIT_TIMEOUT_MS)
      if (v) {
        kind = AI_KIND[v.site_kind] ?? kind
        market = v.market?.trim() || null
        if (v.affiliate_reasoning) indicators = [v.affiliate_reasoning.slice(0, 160), ...indicators].slice(0, 3)
        // Model brand names first (they read well), link counts attached where
        // a name matches a resolved host; then the link-derived rest.
        const named: DemoBrand[] = []
        for (const name of v.brands.slice(0, 8)) {
          const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '')
          const hit = brandsOut.brands.find(b => slug.includes(siteLabel(b.host).slice(0, 5)) || b.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(slug.slice(0, 5)))
          named.push({ name, host: hit?.host ?? name, links: hit?.links ?? 0 })
        }
        const rest = brandsOut.brands.filter(b => !named.some(n => n.host === b.host))
        brands = [...named, ...rest].slice(0, 8)
        const cleanEmails = v.emails.filter(e => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) && !/email protected/i.test(e))
        emails = [...new Set([...emails, ...cleanEmails])].slice(0, 3)
        phones = [...new Set([...phones, ...validatePhones(v.phones, country)])].slice(0, 2)
        if (!contactPage && v.contact_page_url) contactPage = v.contact_page_url
      }
    } catch {
      /* heuristics stand */
    }
  }

  return {
    ...lead,
    enriched: true,
    fetchError: null,
    kind,
    verdict,
    confidence: score.confidence,
    score: score.affiliateScore,
    indicators,
    market,
    brands: kind === 'affiliate' ? brands : brands.slice(0, 3),
    ctaLinks: brandsOut.ctaLinks,
    contacts: {
      emails,
      phones,
      socials: contacts.socials.slice(0, 4).map(s => ({ platform: s.platform, url: s.url })),
      contactPage,
      forms: contacts.contactForms.length,
    },
  }
}

function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(fallback) })
  })
}

/** Only relevant, non-platform results are opened. */
function crawlable(leads: DemoLead[]): DemoLead[] {
  return leads.filter(l => !l.skipped && l.relevance !== 'off_topic').slice(0, DEMO_ENRICH_LIMIT)
}

/** Move a run one step forward and return its public state. */
export async function advanceDemoRun(id: string): Promise<DemoRun | null> {
  const svc = createServiceClient()
  const row = await loadRow(svc, id)
  if (!row) return null
  if (row.status === 'done' || row.status === 'failed') return publicView(row)

  if (row.status === 'searching') {
    if (!row.apify_run_id) {
      await svc.from('demo_runs').update({ status: 'failed', error: 'Search never started.' }).eq('id', id)
      return publicView({ ...row, status: 'failed', error: 'Search never started.' })
    }
    const apify = await resolvePlatformApify(svc)
    if (!apify) return publicView(row)
    let run: Awaited<ReturnType<typeof getRun>>
    try {
      run = await getRun(apify.token, row.apify_run_id)
    } catch {
      return publicView(row)
    }
    if (run.status === 'SUCCEEDED') {
      const datasetId = row.dataset_id ?? run.datasetId
      const items = datasetId ? await getDatasetItems(apify.token, datasetId).catch(() => []) : []
      const leads = toLeads(items, row.keyword, row.apify_run_id)
      await judgeRelevanceWithAi(svc, row.keyword, leads)
      const next = crawlable(leads).length === 0 ? 'done' : 'enriching'
      const { data: updated } = await svc
        .from('demo_runs')
        .update({ status: next, results: leads, total: leads.length, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'searching')
        .select(FULL_COLS)
        .maybeSingle()
      return publicView((updated as unknown as Row | null) ?? { ...row, status: next, results: leads, total: leads.length })
    }
    if (run.status === 'RUNNING' || run.status === 'READY') {
      if (Date.now() - Date.parse(row.created_at) > SEARCH_STALE_MS) {
        await svc.from('demo_runs').update({ status: 'failed', error: 'Google took too long to answer. Please try again.' }).eq('id', id)
        return publicView({ ...row, status: 'failed', error: 'Google took too long to answer. Please try again.' })
      }
      return publicView(row)
    }
    const msg = `Google search ${run.status.toLowerCase()}${run.statusMessage ? `: ${run.statusMessage}` : ''}`.slice(0, 300)
    await svc.from('demo_runs').update({ status: 'failed', error: msg }).eq('id', id)
    return publicView({ ...row, status: 'failed', error: msg })
  }

  // enriching — one caller at a time.
  const nowIso = new Date().toISOString()
  const { data: locked } = await svc
    .from('demo_runs')
    .update({ lock_until: new Date(Date.now() + 55_000).toISOString() })
    .eq('id', id)
    .eq('status', 'enriching')
    .or(`lock_until.is.null,lock_until.lt.${nowIso}`)
    .select(FULL_COLS)
    .maybeSingle()
  if (!locked) return publicView(row)
  const fresh = locked as unknown as Row
  const leads = Array.isArray(fresh.results) ? [...(fresh.results as DemoLead[])] : []

  const todo = crawlable(leads).filter(l => !l.enriched).slice(0, ENRICH_BATCH)
  if (todo.length > 0) {
    const ai = await aiConfig(svc)
    const done = await Promise.all(
      todo.map(l =>
        withDeadline(enrichLead(l, fresh.keyword, fresh.country_code, ai), LEAD_DEADLINE_MS, {
          ...l,
          enriched: true,
          fetchError: 'Timed out',
          kind: 'unknown' as DemoKind,
          verdict: 'unknown' as DemoVerdict,
        }),
      ),
    )
    for (const d of done) {
      const idx = leads.findIndex(l => l.id === d.id)
      if (idx >= 0) leads[idx] = d
    }
  }
  const remaining = crawlable(leads).filter(l => !l.enriched).length
  const status: DemoRun['status'] = remaining === 0 ? 'done' : 'enriching'
  const enriched = leads.filter(l => l.enriched).length
  await svc
    .from('demo_runs')
    .update({ results: leads, enriched, status, lock_until: null, updated_at: new Date().toISOString() })
    .eq('id', id)
  return publicView({ ...fresh, results: leads, enriched, status })
}

export async function loadDemoRun(id: string): Promise<DemoRun | null> {
  const svc = createServiceClient()
  const row = await loadRow(svc, id)
  return row ? publicView(row) : null
}
