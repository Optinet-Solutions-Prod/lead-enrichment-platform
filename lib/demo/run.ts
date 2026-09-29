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

/**
 * The landing-page demo: one real Google page for a keyword in a country,
 * the top results opened, classified and mined for contacts — for a visitor
 * with no account. Lives in `demo_runs`, never in the org tables.
 *
 * State machine, advanced one step per poll from the browser:
 *   searching  → Apify run in flight; when it succeeds the results are stored
 *   enriching  → a few leads per poll are fetched, scored and mined
 *   done | failed
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

/** How many of the results get opened. The rest are shown from the SERP only. */
export const DEMO_ENRICH_LIMIT = 8
const ENRICH_BATCH = 3
const LEAD_DEADLINE_MS = 14_000
const SEARCH_STALE_MS = 5 * 60 * 1000

export type DemoVerdict = 'affiliate' | 'not_affiliate' | 'unclear' | 'unknown'

export type DemoContacts = {
  emails: string[]
  phones: string[]
  socials: Array<{ platform: string; url: string }>
  contactPage: string | null
  forms: number
}

export type DemoLead = {
  id: number
  domain: string
  url: string
  title: string
  snippet: string | null
  type: 'Organic' | 'PPC'
  position: number
  /** Opened and scored (true), or left as a SERP-only row. */
  enriched: boolean
  /** Known platform / non-business host — never opened. */
  skipped: boolean
  fetchError: string | null
  verdict: DemoVerdict
  confidence: string | null
  score: number | null
  indicators: string[]
  contacts: DemoContacts | null
}

export type DemoRun = {
  id: string
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

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Hosts that are never a partner to contact — search engines' own
 *  properties, marketplaces, encyclopedias. Shown, not opened. */
const PLATFORM_HOSTS = /(^|\.)(google|youtube|reddit|wikipedia|amazon|apple|microsoft|facebook|instagram|twitter|x|tiktok|linkedin|pinterest|quora|ebay|booking|airbnb|tripadvisor)\.[a-z.]+$/i

function toLeads(items: unknown[], keyword: string, runId: string): DemoLead[] {
  const { results } = mapItemsToResults(items, { keyword, view_mode: 'desktop' }, { runId })
  return results.slice(0, 12).map((r, i) => {
    const domain = hostOf(r.url)
    const skipped = shouldSkipDomain(domain) || PLATFORM_HOSTS.test(domain)
    return {
      id: i + 1,
      domain,
      url: r.url,
      title: r.title || domain,
      snippet: r.description,
      type: r.resultType,
      position: r.overall_position,
      enriched: false,
      skipped,
      fetchError: null,
      verdict: 'unknown',
      confidence: null,
      score: null,
      indicators: [],
      contacts: null,
    }
  })
}

function verdictOf(classification: string, confidence: string): DemoVerdict {
  if (confidence === 'ERROR') return 'unknown'
  const strong = confidence === 'HIGH' || confidence === 'VERY_HIGH'
  if (classification === 'AFFILIATE') return strong ? 'affiliate' : 'unclear'
  return strong ? 'not_affiliate' : 'unclear'
}

async function enrichLead(lead: DemoLead, keyword: string, country: string): Promise<DemoLead> {
  const home = await fetchPageHtml(lead.url, 7000)
  if (!home.html) {
    return { ...lead, enriched: true, fetchError: home.error ?? 'Could not open the site', verdict: 'unknown' }
  }
  const extra = findContactPages(home.html, home.url, 1)
  const more = await Promise.all(extra.map(u => fetchPageHtml(u, 5000)))
  const pages = [home, ...more].filter(p => p.html)
  const joined = pages.map(p => `<!-- PAGE: ${p.url} -->\n${p.html}`).join('\n')

  const score = scoreAffiliate(home.html, lead.url, { nicheKeywords: nicheKeywordsFrom(keyword) })
  const contacts = extractContacts(joined, lead.url)
  const phones = validatePhones(contacts.phones, country)
  return {
    ...lead,
    enriched: true,
    fetchError: null,
    verdict: verdictOf(score.classification, score.confidence),
    confidence: score.confidence,
    score: score.affiliateScore,
    indicators: score.indicators.slice(0, 3),
    contacts: {
      emails: contacts.emails.slice(0, 3),
      phones: phones.slice(0, 2),
      socials: contacts.socials.slice(0, 4).map(s => ({ platform: s.platform, url: s.url })),
      contactPage: contacts.contactPageUrl,
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
      const enrichable = leads.filter(l => !l.skipped).length
      const next = enrichable === 0 ? 'done' : 'enriching'
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
    .update({ lock_until: new Date(Date.now() + 25_000).toISOString() })
    .eq('id', id)
    .eq('status', 'enriching')
    .or(`lock_until.is.null,lock_until.lt.${nowIso}`)
    .select(FULL_COLS)
    .maybeSingle()
  if (!locked) return publicView(row)
  const fresh = locked as unknown as Row
  const leads = Array.isArray(fresh.results) ? [...(fresh.results as DemoLead[])] : []

  const enrichable = leads.filter(l => !l.skipped).slice(0, DEMO_ENRICH_LIMIT)
  const todo = enrichable.filter(l => !l.enriched).slice(0, ENRICH_BATCH)
  if (todo.length > 0) {
    const done = await Promise.all(
      todo.map(l =>
        withDeadline(enrichLead(l, fresh.keyword, fresh.country_code), LEAD_DEADLINE_MS, {
          ...l,
          enriched: true,
          fetchError: 'Timed out',
          verdict: 'unknown' as DemoVerdict,
        }),
      ),
    )
    for (const d of done) {
      const idx = leads.findIndex(l => l.id === d.id)
      if (idx >= 0) leads[idx] = d
    }
  }
  const remaining = leads.filter(l => !l.skipped).slice(0, DEMO_ENRICH_LIMIT).filter(l => !l.enriched).length
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
