import 'server-only'
import { promises as dns } from 'node:dns'
import { extractContacts } from '@/lib/contact-extraction/extract'
import { findContactPages } from '@/lib/scrape/inline-enrich'
import { verifyEmail, type EmailCheck } from './email-verify'
import { dohQuery, normalizeHost, safeFetchPage, withTimeout } from './safe-fetch'

// ------------------------------------------------------------ domain search --

export type DomainContacts = {
  domain: string
  ok: boolean
  error: string | null
  pagesRead: string[]
  emails: EmailCheck[]
  phones: string[]
  socials: Array<{ platform: string; url: string }>
  contactPage: string | null
  forms: number
}

/** Emails, phones, socials and the contact page a site publishes: its home
 *  page plus up to three contact / about / advertise pages. */
export async function searchDomain(raw: string): Promise<DomainContacts> {
  const domain = normalizeHost(raw)
  const empty = { pagesRead: [], emails: [], phones: [], socials: [], contactPage: null, forms: 0 }
  if (!domain) return { domain: String(raw).slice(0, 80), ok: false, error: 'Not a website address', ...empty }

  const home = await safeFetchPage(`https://${domain}/`)
  if (!home.html) return { domain, ok: false, error: home.error ?? 'Could not open the site', ...empty }

  const pages = [home, ...(await Promise.all(findContactPages(home.html, home.url, 3).map(u => safeFetchPage(u, 7000))))]
  const emails = new Set<string>()
  const phones = new Set<string>()
  const socials = new Map<string, { platform: string; url: string }>()
  let contactPage: string | null = null
  let forms = 0
  const read: string[] = []
  for (const p of pages) {
    if (!p.html) continue
    read.push(p.url)
    const c = extractContacts(p.html, p.url)
    c.emails.forEach(e => emails.add(e.toLowerCase()))
    c.phones.forEach(ph => phones.add(ph))
    c.socials.forEach(s => socials.set(s.url, { platform: s.platform, url: s.url }))
    forms += c.contactForms.length
    contactPage ??= c.contactPageUrl
  }
  const checked = await Promise.all([...emails].slice(0, 25).map(verifyEmail))
  return {
    domain,
    ok: true,
    error: null,
    pagesRead: read,
    emails: checked.sort((a, b) => Number(a.role) - Number(b.role)),
    phones: [...phones].slice(0, 10),
    socials: [...socials.values()].slice(0, 12),
    contactPage,
    forms,
  }
}

// ---------------------------------------------------------- pattern finder --

export type PatternGuess = { email: string; pattern: string; likely: boolean }

const PATTERNS: Array<[string, (f: string, l: string) => string]> = [
  ['first', (f) => f],
  ['first.last', (f, l) => `${f}.${l}`],
  ['firstlast', (f, l) => `${f}${l}`],
  ['f.last', (f, l) => `${f[0]}.${l}`],
  ['flast', (f, l) => `${f[0]}${l}`],
  ['first_last', (f, l) => `${f}_${l}`],
  ['first-last', (f, l) => `${f}-${l}`],
  ['last', (_f, l) => l],
  ['last.first', (f, l) => `${l}.${f}`],
  ['firstl', (f, l) => `${f}${l[0]}`],
]

const clean = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

/**
 * Likely addresses for a person at a company. Ranked by how common each
 * pattern is; when the site publishes named addresses we detect their
 * pattern and put it first. These are guesses until someone replies.
 */
export async function guessEmails(first: string, last: string, rawDomain: string): Promise<{
  domain: string | null
  acceptsMail: boolean
  detectedPattern: string | null
  guesses: PatternGuess[]
  error: string | null
}> {
  const domain = normalizeHost(rawDomain)
  const f = clean(first)
  const l = clean(last)
  if (!domain) return { domain: null, acceptsMail: false, detectedPattern: null, guesses: [], error: 'Not a website address' }
  if (!f || !l) return { domain, acceptsMail: false, detectedPattern: null, guesses: [], error: 'Type a first and a last name' }

  const [mx, site] = await Promise.all([verifyEmail(`check@${domain}`), searchDomain(domain).catch(() => null)])

  // Named addresses on the site reveal the house pattern.
  let detected: string | null = null
  for (const e of site?.emails ?? []) {
    if (e.role || e.domain !== domain) continue
    const local = e.email.split('@')[0]!
    for (const [name] of PATTERNS) {
      if (name === 'first' || name === 'last') continue
      const shape = name === 'first.last' ? /^[a-z]+\.[a-z]+$/ : name === 'f.last' ? /^[a-z]\.[a-z]+$/ : name === 'first_last' ? /^[a-z]+_[a-z]+$/ : name === 'first-last' ? /^[a-z]+-[a-z]+$/ : null
      if (shape?.test(local)) {
        detected = name
        break
      }
    }
    if (detected) break
  }

  const ordered = detected ? [...PATTERNS.filter(p => p[0] === detected), ...PATTERNS.filter(p => p[0] !== detected)] : PATTERNS
  return {
    domain,
    acceptsMail: mx.mx.length > 0,
    detectedPattern: detected,
    guesses: ordered.map(([pattern, fn], i) => ({ email: `${fn(f, l)}@${domain}`, pattern, likely: i < 3 })),
    error: null,
  }
}

// ---------------------------------------------------- email authentication --

export type AuthCheck = { name: string; status: 'pass' | 'warn' | 'missing'; record: string | null; advice: string }

async function txt(name: string): Promise<string[]> {
  try {
    const native = (await withTimeout(dns.resolveTxt(name), 3500, [] as string[][])).map(parts => parts.join(''))
    return native.length ? native : await dohQuery(name, 'TXT')
  } catch {
    return []
  }
}

const DKIM_SELECTORS = ['google', 'default', 'selector1', 'selector2', 'k1', 's1', 's2', 'mail', 'dkim', 'smtp', 'mandrill', 'resend', 'sendgrid', 'zoho']

/** MX, SPF, DMARC and DKIM (common selectors) for a sending domain. */
export async function checkEmailAuth(rawDomain: string): Promise<{ domain: string | null; checks: AuthCheck[]; error: string | null }> {
  const domain = normalizeHost(rawDomain)
  if (!domain) return { domain: null, checks: [], error: 'Not a domain' }

  const [mxRes, root, dmarc, dkimHits] = await Promise.all([
    withTimeout(dns.resolveMx(domain), 3500, []).then(async r =>
      r.length
        ? r
        : (await dohQuery(domain, 'MX')).map(d => {
            const [p, h] = d.split(/\s+/)
            return { priority: Number(p) || 0, exchange: (h ?? '').replace(/\.$/, '') }
          }),
    ),
    txt(domain),
    txt(`_dmarc.${domain}`),
    Promise.all(DKIM_SELECTORS.map(async s => ((await txt(`${s}._domainkey.${domain}`)).some(r => /v=DKIM1|k=rsa|p=/i.test(r)) ? s : null))),
  ])

  const checks: AuthCheck[] = []
  checks.push(
    mxRes.length
      ? { name: 'MX', status: 'pass', record: mxRes.sort((a, b) => a.priority - b.priority).map(r => r.exchange).join(', '), advice: 'The domain can receive replies.' }
      : { name: 'MX', status: 'missing', record: null, advice: 'No mail server: replies to this domain bounce. Add MX records at your DNS host.' },
  )
  const spf = root.find(r => /^v=spf1/i.test(r)) ?? null
  checks.push(
    !spf
      ? { name: 'SPF', status: 'missing', record: null, advice: 'Add a TXT record starting with v=spf1 that lists every service sending as this domain.' }
      : /\+all\b/.test(spf)
        ? { name: 'SPF', status: 'warn', record: spf, advice: '+all lets anyone send as you. End the record with ~all or -all.' }
        : root.filter(r => /^v=spf1/i.test(r)).length > 1
          ? { name: 'SPF', status: 'warn', record: spf, advice: 'More than one SPF record — merge them into one, or receivers ignore both.' }
          : { name: 'SPF', status: 'pass', record: spf, advice: 'Sending servers are declared.' },
  )
  const dm = dmarc.find(r => /^v=DMARC1/i.test(r)) ?? null
  const policy = dm?.match(/;\s*p=(\w+)/i)?.[1]?.toLowerCase() ?? null
  checks.push(
    !dm
      ? { name: 'DMARC', status: 'missing', record: null, advice: 'Add a TXT record at _dmarc with v=DMARC1; p=none; rua=mailto:… to start, then tighten.' }
      : policy === 'none'
        ? { name: 'DMARC', status: 'warn', record: dm, advice: 'Policy is p=none (monitor only). Move to quarantine once reports look clean.' }
        : { name: 'DMARC', status: 'pass', record: dm, advice: `Policy p=${policy}.` },
  )
  const found = dkimHits.filter((s): s is string => Boolean(s))
  checks.push(
    found.length
      ? { name: 'DKIM', status: 'pass', record: `selectors: ${found.join(', ')}`, advice: 'Messages can be signed.' }
      : { name: 'DKIM', status: 'warn', record: null, advice: `No key at the common selectors (${DKIM_SELECTORS.slice(0, 6).join(', ')}…). Your provider may use another one — check its setup page.` },
  )
  return { domain, checks, error: null }
}

// --------------------------------------------- technology & affiliate lookup --

export type TechHit = { category: string; name: string; evidence: string }

const SIGNATURES: Array<{ category: string; name: string; re: RegExp }> = [
  // Affiliate networks and tracking — the reason this lookup exists.
  { category: 'Affiliate network', name: 'Impact', re: /(\.sjv\.io|\.pxf\.io|\.ojrq\.net|\.evyy\.net|\.7eer\.net|\.r2ba\.net|impact\.com\/campaign|impactradius)/i },
  { category: 'Affiliate network', name: 'CJ (Commission Junction)', re: /(anrdoezrs\.net|dpbolvw\.net|jdoqocy\.com|kqzyfj\.com|tkqlhce\.com|emjcd\.com|qksrv\.net)/i },
  { category: 'Affiliate network', name: 'Awin', re: /(awin1\.com|zenaps\.com|awin\.com\/cread)/i },
  { category: 'Affiliate network', name: 'Rakuten Advertising', re: /(linksynergy\.com|click\.linksynergy)/i },
  { category: 'Affiliate network', name: 'ShareASale', re: /shareasale\.com\/r\.cfm|shareasale-analytics/i },
  { category: 'Affiliate network', name: 'PartnerStack', re: /(partnerstack\.com|grsm\.io)/i },
  { category: 'Affiliate network', name: 'Amazon Associates', re: /(amzn\.to\/|amazon\.[a-z.]+\/[^"']*[?&]tag=|amazon-adsystem)/i },
  { category: 'Affiliate network', name: 'Skimlinks', re: /(skimresources\.com|skimlinks\.com|go\.skimresources)/i },
  { category: 'Affiliate network', name: 'Sovrn Commerce (VigLink)', re: /(viglink\.com|sovrn\.co|redirect\.viglink)/i },
  { category: 'Affiliate network', name: 'Admitad', re: /(ad\.admitad\.com|admitad\.com\/g\/)/i },
  { category: 'Affiliate network', name: 'TradeDoubler', re: /(clk\.tradedoubler\.com|tradedoubler\.com)/i },
  { category: 'Affiliate network', name: 'TradeTracker', re: /tc\.tradetracker\.net/i },
  { category: 'Affiliate network', name: 'FlexOffers', re: /(track\.flexlinkspro\.com|flexoffers\.com)/i },
  { category: 'Affiliate network', name: 'Everflow', re: /(everflow\.io|\.eflow\.)/i },
  { category: 'Affiliate network', name: 'Refersion', re: /refersion\.com/i },
  { category: 'Affiliate network', name: 'Tapfiliate', re: /tapfiliate\.com/i },
  { category: 'Affiliate network', name: 'Post Affiliate Pro', re: /(postaffiliatepro\.com|pap\.js)/i },
  { category: 'Affiliate network', name: 'Digistore24', re: /digistore24\.com\/redir/i },
  { category: 'Affiliate network', name: 'ClickBank', re: /(hop\.clickbank\.net|clickbank\.net)/i },
  { category: 'Affiliate tracking', name: 'Cloaked links (/go/, /out/, /recommends/)', re: /href=["'][^"']*\/(go|out|recommends|visit|refer|aff|link)\/[a-z0-9-]+/i },
  // Ads and monetisation
  { category: 'Ads', name: 'Google AdSense', re: /(pagead2\.googlesyndication\.com|adsbygoogle)/i },
  { category: 'Ads', name: 'Mediavine', re: /mediavine\.com/i },
  { category: 'Ads', name: 'Raptive (AdThrive)', re: /(adthrive\.com|raptive)/i },
  { category: 'Ads', name: 'Ezoic', re: /ezoic/i },
  // CMS and shop
  { category: 'CMS', name: 'WordPress', re: /(\/wp-content\/|\/wp-includes\/|wp-json)/i },
  { category: 'CMS', name: 'Shopify', re: /(cdn\.shopify\.com|myshopify\.com)/i },
  { category: 'CMS', name: 'Webflow', re: /(webflow\.com|wf-page)/i },
  { category: 'CMS', name: 'Wix', re: /(wixstatic\.com|_wixCIDX|wix\.com)/i },
  { category: 'CMS', name: 'Squarespace', re: /squarespace/i },
  { category: 'CMS', name: 'Ghost', re: /ghost-(sdk|portal)|content="Ghost/i },
  { category: 'CMS', name: 'Drupal', re: /drupal/i },
  { category: 'CMS', name: 'Next.js', re: /\/_next\/static\//i },
  // Analytics and pixels
  { category: 'Analytics', name: 'Google Analytics 4', re: /(gtag\/js\?id=G-|googletagmanager\.com\/gtag)/i },
  { category: 'Analytics', name: 'Google Tag Manager', re: /googletagmanager\.com\/gtm\.js/i },
  { category: 'Analytics', name: 'Meta Pixel', re: /(connect\.facebook\.net\/[^"']*fbevents|fbq\()/i },
  { category: 'Analytics', name: 'TikTok Pixel', re: /analytics\.tiktok\.com/i },
  { category: 'Analytics', name: 'Hotjar', re: /hotjar/i },
  { category: 'Analytics', name: 'Plausible', re: /plausible\.io/i },
  // Email capture
  { category: 'Newsletter', name: 'Mailchimp', re: /(list-manage\.com|mailchimp)/i },
  { category: 'Newsletter', name: 'Kit (ConvertKit)', re: /(convertkit|ck\.page|kit\.com\/)/i },
  { category: 'Newsletter', name: 'beehiiv', re: /beehiiv/i },
  { category: 'Newsletter', name: 'Substack', re: /substack\.com/i },
  { category: 'Newsletter', name: 'Klaviyo', re: /klaviyo/i },
]

/** What a site is built and monetised with, with the evidence for each hit. */
export async function lookupTech(raw: string): Promise<{ domain: string | null; hits: TechHit[]; error: string | null; server: string | null }> {
  const domain = normalizeHost(raw)
  if (!domain) return { domain: null, hits: [], error: 'Not a website address', server: null }
  const page = await safeFetchPage(`https://${domain}/`)
  if (!page.html) return { domain, hits: [], error: page.error ?? 'Could not open the site', server: null }
  const hits: TechHit[] = []
  for (const s of SIGNATURES) {
    const m = page.html.match(s.re)
    if (m) hits.push({ category: s.category, name: s.name, evidence: m[0].slice(0, 80) })
  }
  const server = page.headers['server'] ?? page.headers['x-powered-by'] ?? null
  if (page.headers['cf-ray']) hits.push({ category: 'Hosting', name: 'Cloudflare', evidence: 'cf-ray header' })
  if (page.headers['x-vercel-id']) hits.push({ category: 'Hosting', name: 'Vercel', evidence: 'x-vercel-id header' })
  return { domain, hits, error: null, server }
}

// ------------------------------------------------------------ site summary --

/** Title and description of a site's home page, for the email writer. */
export async function siteSummary(raw: string): Promise<{ domain: string | null; title: string | null; description: string | null }> {
  const domain = normalizeHost(raw)
  if (!domain) return { domain: null, title: null, description: null }
  const page = await safeFetchPage(`https://${domain}/`, 7000)
  const html = page.html ?? ''
  const title = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? null
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})["']/i)?.[1]?.trim() ??
    html.match(/<meta[^>]+content=["']([^"']{1,400})["'][^>]+name=["']description["']/i)?.[1]?.trim() ??
    null
  return { domain, title, description }
}
