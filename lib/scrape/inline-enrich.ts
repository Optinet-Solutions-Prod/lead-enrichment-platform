import 'server-only'
import type { createServiceClient } from '@/lib/supabase/service'
import { shouldSkipDomain } from '@/lib/affiliate-detection/scorer'
import { nicheKeywordsFrom, runAffiliateStage, runContactStage } from '@/lib/enrichment/score-stage'

/**
 * The in-app enrichment worker.
 *
 * In the prod repo, VM workers claim `enrichment_fetch_queue` rows, open each
 * page in a real browser, write the HTML to `fetched_html_cache` and post to
 * /api/enrichment/score-row. Here the same queue is drained inside the app:
 * plain HTTP fetch of the homepage (plus contact pages for the contact
 * stage), the same cache row, the same scoring code. Stages that need a
 * browser (s-tag redirect following, screenshots) are not run here.
 */

type Svc = ReturnType<typeof createServiceClient>

const INLINE_WORKER = 'inline'
const SUPPORTED_STAGES = new Set(['affiliate', 'contact'])
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const MAX_HTML_BYTES = 1_500_000

type QueueRow = {
  id: string
  lead_id: number
  url: string
  process_stages: unknown
}

type Lead = {
  id: number
  url: string | null
  domain: string | null
  country_code: string | null
  keyword: string | null
  is_contact_overridden_at: string | null
}

export type FetchedPage = { url: string; html: string | null; error: string | null }

export async function fetchPageHtml(url: string, timeoutMs = 8000): Promise<FetchedPage> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en-GB,en;q=0.8',
      },
    })
    if (!res.ok) return { url, html: null, error: `HTTP ${res.status}` }
    const type = res.headers.get('content-type') ?? ''
    if (type && !/html|xml|text\/plain/i.test(type)) return { url, html: null, error: `Not HTML (${type.split(';')[0]})` }
    const text = await res.text()
    return { url: res.url || url, html: text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text, error: null }
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'TimeoutError' ? 'Timed out' : e.message) : String(e)
    return { url, html: null, error: msg.slice(0, 200) }
  }
}

const CONTACT_HREF_RE =
  /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi
const CONTACT_WORDS =
  /contact|kontakt|contatt|contacto|impressum|imprint|about|über-uns|ueber-uns|chi-siamo|quienes-somos|a-propos|advertis|partner|media-kit|write-for-us/i

/** Up to `max` same-site pages that look like contact / about / advertise pages. */
export function findContactPages(html: string, baseUrl: string, max = 2): string[] {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return []
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(CONTACT_HREF_RE)) {
    const href = m[1] ?? ''
    const text = (m[2] ?? '').replace(/<[^>]+>/g, ' ')
    if (!CONTACT_WORDS.test(href) && !CONTACT_WORDS.test(text)) continue
    let abs: URL
    try {
      abs = new URL(href, base)
    } catch {
      continue
    }
    if (abs.host !== base.host) continue
    if (!/^https?:$/.test(abs.protocol)) continue
    abs.hash = ''
    const key = abs.toString()
    if (seen.has(key) || key === base.toString()) continue
    seen.add(key)
    out.push(key)
    if (out.length >= max) break
  }
  return out
}

function joinPages(pages: FetchedPage[]): string {
  return pages
    .filter(p => p.html)
    .map(p => `<!-- PAGE: ${p.url} -->\n${p.html}`)
    .join('\n')
}

async function processOne(svc: Svc, row: QueueRow): Promise<'completed' | 'failed'> {
  const stages = Array.isArray(row.process_stages)
    ? (row.process_stages as unknown[]).filter((s): s is string => typeof s === 'string')
    : []
  const supported = stages.filter(s => SUPPORTED_STAGES.has(s))
  const unsupported = stages.filter(s => !SUPPORTED_STAGES.has(s))
  const finish = async (status: 'completed' | 'failed', error?: string) => {
    await svc
      .from('enrichment_fetch_queue')
      .update({
        status,
        completed_at: new Date().toISOString(),
        error_message: error ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    return status
  }

  if (supported.length === 0) {
    return finish('failed', `Stage ${unsupported.join(', ') || '?'} needs the browser fleet, which is not connected here.`)
  }

  const { data: leadRow } = await svc
    .from('google_lead_gen_table')
    .select('id, url, domain, country_code, keyword, is_contact_overridden_at')
    .eq('id', row.lead_id)
    .maybeSingle()
  const lead = leadRow as Lead | null
  if (!lead) return finish('failed', 'Lead no longer exists.')

  const url = row.url || lead.url || ''
  if (!url.startsWith('http')) return finish('failed', 'Lead has no fetchable URL.')

  let pages: FetchedPage[] = []
  let fetchError: string | null = null
  if (shouldSkipDomain(lead.domain)) {
    fetchError = null
  } else {
    const home = await fetchPageHtml(url)
    pages = [home]
    if (home.html && supported.includes('contact')) {
      const extra = findContactPages(home.html, home.url)
      const fetched = await Promise.all(extra.map(u => fetchPageHtml(u, 6000)))
      pages.push(...fetched)
    }
    fetchError = home.html ? null : home.error ?? 'Empty response'
  }
  const html = joinPages(pages)

  await svc.from('fetched_html_cache').upsert(
    {
      lead_id: lead.id,
      url,
      html: html || null,
      fetched_at: new Date().toISOString(),
      fetch_error: fetchError,
      source: INLINE_WORKER,
      html_length: html.length,
    },
    { onConflict: 'lead_id' },
  )

  const ctx = {
    leadId: lead.id,
    url,
    domain: lead.domain,
    countryCode: lead.country_code,
    html,
    fetchError,
    contactOverridden: lead.is_contact_overridden_at !== null,
    nicheKeywords: nicheKeywordsFrom(lead.keyword),
  }
  const errors: string[] = []
  for (const stage of supported) {
    try {
      if (stage === 'affiliate') await runAffiliateStage(svc, ctx)
      else if (stage === 'contact') await runContactStage(svc, ctx)
    } catch (e) {
      errors.push(`${stage}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (unsupported.length > 0) errors.push(`${unsupported.join(', ')} skipped — needs the browser fleet`)
  return finish(errors.length > 0 && errors.length === supported.length ? 'failed' : 'completed', errors.join(' | ') || undefined)
}

function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(fallback) })
  })
}

export type InlineEnrichReport = { claimed: number; completed: number; failed: number; timedOut: number }

/** Claim up to `maxRows` pending fetch rows and process them concurrently
 *  within `deadlineMs`. Rows that overrun stay 'running' and are reclaimed
 *  by the stale sweep on a later tick. */
export async function processEnrichmentQueueInline(
  svc: Svc,
  opts: { maxRows: number; deadlineMs: number },
): Promise<InlineEnrichReport> {
  const report: InlineEnrichReport = { claimed: 0, completed: 0, failed: 0, timedOut: 0 }
  const nowIso = new Date().toISOString()

  // Stale sweep: a row left 'running' by an earlier tick that hit its
  // deadline goes back to pending (once) so nothing is stuck forever.
  const staleBefore = new Date(Date.now() - 3 * 60 * 1000).toISOString()
  await svc
    .from('enrichment_fetch_queue')
    .update({ status: 'pending', claimed_by: null, updated_at: nowIso })
    .eq('status', 'running')
    .eq('claimed_by', INLINE_WORKER)
    .lt('started_at', staleBefore)
    .lt('attempts', 2)

  const { data } = await svc
    .from('enrichment_fetch_queue')
    .select('id, lead_id, url, process_stages, attempts')
    .eq('status', 'pending')
    .or('cancel_requested.is.null,cancel_requested.eq.false')
    .order('created_at', { ascending: true })
    .limit(opts.maxRows)
  const candidates = (data ?? []) as Array<QueueRow & { attempts: number | null }>
  if (candidates.length === 0) return report

  const claimed: QueueRow[] = []
  for (const row of candidates) {
    const { data: won } = await svc
      .from('enrichment_fetch_queue')
      .update({
        status: 'running',
        claimed_by: INLINE_WORKER,
        started_at: nowIso,
        attempts: (row.attempts ?? 0) + 1,
        updated_at: nowIso,
      })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
    if (won && won.length > 0) claimed.push(row)
  }
  report.claimed = claimed.length

  const outcomes = await Promise.all(
    claimed.map(row => withDeadline(processOne(svc, row), opts.deadlineMs, 'timeout' as const)),
  )
  for (const o of outcomes) {
    if (o === 'completed') report.completed++
    else if (o === 'failed') report.failed++
    else report.timedOut++
  }
  return report
}

/** Move enrichment chains forward for completed jobs that asked for it. */
export async function advanceEnrichmentChains(svc: Svc, limit = 25): Promise<number> {
  const { data } = await svc
    .from('scrape_queue')
    .select('id')
    .eq('with_enrichment', true)
    .eq('status', 'completed')
    .or('enrichment_status.is.null,enrichment_status.in.(pending,affiliate_running,rooster_running,all_running,contact_running)')
    .order('completed_at', { ascending: true })
    .limit(limit)
  const ids = ((data ?? []) as Array<{ id: string }>).map(r => r.id)
  await Promise.all(ids.map(id => svc.rpc('advance_enrichment_chain', { p_job_id: id })))
  return ids.length
}

/** Jobs queued with the contact stage: enqueue contact fetches once the
 *  scrape (and the affiliate chain, when asked for) is done. */
export async function autoEnqueueContactStage(svc: Svc, limit = 5): Promise<number> {
  const { data } = await svc
    .from('scrape_queue')
    .select('id, with_enrichment, enrichment_status')
    .eq('status', 'completed')
    // jsonb containment: pass the JSON literal, not a JS array (that would be
    // sent as a Postgres array literal and match nothing on a jsonb column).
    .contains('auto_stages', '["contact"]')
    .is('auto_contact_enqueued_at', null)
    .order('completed_at', { ascending: true })
    .limit(limit)
  const jobs = (data ?? []) as Array<{ id: string; with_enrichment: boolean | null; enrichment_status: string | null }>
  let enqueuedJobs = 0
  for (const job of jobs) {
    if (job.with_enrichment && job.enrichment_status !== 'complete') continue
    const nowIso = new Date().toISOString()
    const { data: won } = await svc
      .from('scrape_queue')
      .update({ auto_contact_enqueued_at: nowIso })
      .eq('id', job.id)
      .is('auto_contact_enqueued_at', null)
      .select('id')
    if (!won || won.length === 0) continue

    const { data: leads } = await svc
      .from('google_lead_gen_table')
      .select('id, url, domain, country_code')
      .eq('scrape_job_id', job.id)
      .is('is_contact_overridden_at', null)
      .is('contact_checked_at', null)
      .eq('is_not_relevant', false)
      .is('system_flag', null)
    const rows = ((leads ?? []) as Array<{ id: number; url: string | null; domain: string | null; country_code: string | null }>)
      .filter(l => l.url && l.url.startsWith('http') && l.country_code && !shouldSkipDomain(l.domain))
      .map(l => ({
        lead_id: l.id,
        country_code: l.country_code as string,
        url: l.url as string,
        want_html: true,
        want_screenshot: false,
        process_stages: ['contact'],
      }))
    if (rows.length > 0) await svc.from('enrichment_fetch_queue').insert(rows)
    enqueuedJobs++
  }
  return enqueuedJobs
}
