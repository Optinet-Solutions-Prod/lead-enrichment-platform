import 'server-only'
import { createHash } from 'node:crypto'
import type { createServiceClient } from '@/lib/supabase/service'

/**
 * Google search jobs, run on Apify's `google-search-scraper` actor.
 *
 * The prod repo runs Google through a fleet of GoLogin browsers on VMs
 * (scraper.py). This deployment has no fleet, so a pending Google job is
 * started as an Apify actor run from the app, and its dataset is folded into
 * the same `complete_scrape_job` RPC the VM worker would have called. The
 * result rows therefore look exactly like a worker scrape to everything
 * downstream (website profiles, dedupe, enrichment chain).
 *
 * Lifecycle
 *   pending ──kickoff──▶ running (claimed_by = 'apify-google', runner_run_id)
 *   running ──sync────▶ completed | pending (retry) | failed
 *
 * `sync` is driven by the Apify webhook (production) and by the page's
 * auto-refresh tick (always), so a run is ingested even when the webhook
 * cannot reach the app (local dev).
 */

const APIFY_BASE = 'https://api.apify.com'
const ACTOR = 'apify~google-search-scraper'
/** Seconds Apify may spend on one run before it is timed out on their side. */
const RUN_TIMEOUT_SECS = 600
/** A run still "running" this long after we started it is given up on. */
const STALE_RUN_MS = 20 * 60 * 1000

export const RUNNER = 'apify-google'

type Svc = ReturnType<typeof createServiceClient>

export type RunnerJob = {
  id: string
  keyword: string
  country_code: string
  language: string | null
  pages: number | null
  view_mode: 'desktop' | 'mobile' | 'both' | null
  result_type_filter: 'PPC' | 'Organic' | null
  runner_run_id: string | null
  runner_dataset_id: string | null
  started_at: string | null
  attempts: number | null
  max_attempts: number | null
}

export const RUNNER_JOB_COLS =
  'id, keyword, country_code, language, pages, view_mode, result_type_filter, runner_run_id, runner_dataset_id, started_at, attempts, max_attempts'

/** The platform Apify token: the env var when set, else the service-role-only
 *  `platform_secrets` row. Null means Google jobs cannot run here. */
export async function resolvePlatformApify(
  svc: Svc,
): Promise<{ token: string; source: 'env' | 'platform_secrets' } | null> {
  const env = process.env.APIFY_TOKEN?.trim()
  if (env) return { token: env, source: 'env' }
  const { data } = await svc.from('platform_secrets').select('value').eq('key', 'apify_token').maybeSingle()
  const value = (data as { value: string } | null)?.value?.trim()
  return value ? { token: value, source: 'platform_secrets' } : null
}

/** Shared secret in the webhook URL, derived from CRON_SECRET so the raw
 *  secret never leaves the app. */
export function apifyWebhookKey(): string | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return null
  return createHash('sha256').update(`${secret}:apify-webhook`).digest('hex').slice(0, 40)
}

function webhookUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '')
  const key = apifyWebhookKey()
  if (!base || !key) return null
  // Apify cannot call a laptop; the auto-refresh tick covers local runs.
  if (/localhost|127\.0\.0\.1/.test(base)) return null
  return `${base}/api/scrape/apify-webhook?key=${key}`
}

async function readMaxPages(svc: Svc): Promise<number> {
  const { data } = await svc.rpc('get_system_setting', { p_key: 'apify_google_max_pages' })
  const n = typeof data === 'number' ? data : typeof data === 'string' ? Number(data) : NaN
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 10) : 2
}

export function buildActorInput(job: RunnerJob, pagesCap: number): Record<string, unknown> {
  const pages = Math.max(1, Math.min(job.pages ?? 1, pagesCap))
  return {
    queries: job.keyword,
    countryCode: job.country_code.toLowerCase(),
    languageCode: (job.language ?? 'en').toLowerCase(),
    maxPagesPerQuery: pages,
    resultsPerPage: 10,
    mobileResults: job.view_mode === 'mobile',
    includeUnfilteredResults: false,
    saveHtml: false,
    saveHtmlToKeyValueStore: false,
  }
}

async function apifyJson<T>(url: string, init?: RequestInit): Promise<T> {
  // One retry on a network-level failure ("fetch failed": DNS, TLS, reset).
  // Apify's API itself is reliable; the first call after a cold start is not.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) })
      if (!res.ok) {
        const text = (await res.text().catch(() => '')).slice(0, 300)
        throw new Error(`Apify HTTP ${res.status}: ${text || res.statusText}`)
      }
      return (await res.json()) as T
    } catch (e) {
      const network = e instanceof TypeError || (e instanceof Error && /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(e.message))
      if (attempt >= 1 || !network) throw e
      await new Promise(r => setTimeout(r, 800))
    }
  }
}

export async function startRun(
  token: string,
  input: Record<string, unknown>,
): Promise<{ runId: string; datasetId: string | null }> {
  const params = new URLSearchParams({ token, timeout: String(RUN_TIMEOUT_SECS) })
  const hook = webhookUrl()
  if (hook) {
    const webhooks = [
      {
        eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.ABORTED', 'ACTOR.RUN.TIMED_OUT'],
        requestUrl: hook,
      },
    ]
    params.set('webhooks', Buffer.from(JSON.stringify(webhooks)).toString('base64'))
  }
  const body = await apifyJson<{ data?: { id?: string; defaultDatasetId?: string } }>(
    `${APIFY_BASE}/v2/acts/${ACTOR}/runs?${params.toString()}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
  )
  if (!body.data?.id) throw new Error('Apify did not return a run id')
  return { runId: body.data.id, datasetId: body.data.defaultDatasetId ?? null }
}

export async function getRun(
  token: string,
  runId: string,
): Promise<{ status: string; datasetId: string | null; statusMessage: string | null }> {
  const body = await apifyJson<{
    data?: { status?: string; defaultDatasetId?: string; statusMessage?: string }
  }>(`${APIFY_BASE}/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`)
  return {
    status: body.data?.status ?? 'UNKNOWN',
    datasetId: body.data?.defaultDatasetId ?? null,
    statusMessage: body.data?.statusMessage ?? null,
  }
}

export async function getDatasetItems(token: string, datasetId: string): Promise<unknown[]> {
  const items = await apifyJson<unknown>(
    `${APIFY_BASE}/v2/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}&clean=true&format=json`,
  )
  return Array.isArray(items) ? items : []
}

// ---------------------------------------------------------------- mapping ----

type SerpResult = {
  title?: string
  url?: string
  directUrl?: string
  description?: string
  position?: number
  adPosition?: number
}
type SerpItem = {
  searchQuery?: { term?: string; page?: number; device?: string }
  organicResults?: SerpResult[]
  paidResults?: SerpResult[]
}

/** One row in the shape `complete_scrape_job` reads (see scraper.py). */
export type ResultRow = {
  url: string
  full_url: string
  title: string
  description: string | null
  resultType: 'Organic' | 'PPC'
  page: number
  position: number | null
  overall_position: number
  keyword: string
  seen_on: 'desktop' | 'mobile'
}

function originOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

/** Google's own click-tracker URLs carry no destination we can profile. */
function isGoogleRedirect(url: string): boolean {
  try {
    const h = new URL(url).hostname
    return /(^|\.)google\./i.test(h)
  } catch {
    return true
  }
}

export function mapItemsToResults(
  items: unknown[],
  job: Pick<RunnerJob, 'keyword' | 'view_mode'>,
  meta: { runId: string },
): { results: ResultRow[]; summary: Record<string, unknown> } {
  const seenOn: 'desktop' | 'mobile' = job.view_mode === 'mobile' ? 'mobile' : 'desktop'
  const pages = (items as SerpItem[])
    .filter(i => i && typeof i === 'object')
    .map((i, idx) => ({ item: i, page: typeof i.searchQuery?.page === 'number' ? i.searchQuery.page : idx + 1 }))
    .sort((a, b) => a.page - b.page)

  const results: ResultRow[] = []
  const seenUrls = new Set<string>()
  let overall = 1
  let organic = 0
  let ppc = 0

  for (const { item, page } of pages) {
    // Ads sit above the organic list on the page, so they take the first
    // overall positions — same order scraper.py reads the DOM in.
    // "Organic results only" scrapes leave the ads out entirely.
    const paid = (job as { result_type_filter?: string | null }).result_type_filter === 'Organic' ? [] : item.paidResults ?? []
    for (const r of paid) {
      const dest = r.directUrl && !isGoogleRedirect(r.directUrl) ? r.directUrl : r.url ?? ''
      if (!dest || isGoogleRedirect(dest)) continue
      const origin = originOf(dest)
      if (!origin || seenUrls.has(dest)) continue
      seenUrls.add(dest)
      results.push({
        url: dest,
        full_url: origin,
        title: r.title ?? '',
        description: r.description ?? null,
        resultType: 'PPC',
        page,
        position: null,
        overall_position: overall++,
        keyword: job.keyword,
        seen_on: seenOn,
      })
      ppc++
    }
    let position = 1
    for (const r of item.organicResults ?? []) {
      const dest = r.url ?? ''
      const origin = dest ? originOf(dest) : null
      if (!origin || seenUrls.has(dest)) continue
      seenUrls.add(dest)
      results.push({
        url: dest,
        full_url: origin,
        title: r.title ?? '',
        description: r.description ?? null,
        resultType: 'Organic',
        page,
        position: typeof r.position === 'number' ? r.position : position,
        overall_position: overall++,
        keyword: job.keyword,
        seen_on: seenOn,
      })
      position++
      organic++
    }
  }

  const summary = {
    total_results: results.length,
    organic,
    ppc,
    pages_scraped: pages.length,
    scraped_at: new Date().toISOString(),
    runner: RUNNER,
    apify_run_id: meta.runId,
    view_mode: seenOn,
    is_logged_in: null,
  }
  return { results, summary }
}

// ---------------------------------------------------------------- lifecycle ----

export type KickoffReport = { started: number; noToken: boolean; errors: string[] }

/** Start Apify runs for ready Google jobs, oldest-first by priority. With
 *  `ids`, only those jobs are considered — the enqueue action uses this so a
 *  fresh batch starts in full even when older pending rows exist. */
export async function kickoffPendingGoogleJobs(
  svc: Svc,
  opts: number | { limit?: number; ids?: string[] } = 3,
): Promise<KickoffReport> {
  const limit = typeof opts === 'number' ? opts : opts.limit ?? 3
  const ids = typeof opts === 'number' ? null : opts.ids ?? null
  const report: KickoffReport = { started: 0, noToken: false, errors: [] }
  const nowIso = new Date().toISOString()
  let query = svc
    .from('scrape_queue')
    .select(RUNNER_JOB_COLS)
    .eq('status', 'pending')
    .eq('search_engine', 'google')
    .or('scrape_source.is.null,scrape_source.eq.apify')
    .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
    .is('parent_scrape_job_id', null)
  if (ids) {
    if (ids.length === 0) return report
    query = query.in('id', ids)
  }
  const { data, error } = await query
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) {
    report.errors.push(`queue lookup: ${error.message}`)
    return report
  }
  const jobs = (data ?? []) as unknown as RunnerJob[]
  if (jobs.length === 0) return report

  const apify = await resolvePlatformApify(svc)
  if (!apify) {
    report.noToken = true
    report.errors.push('No Apify token — set APIFY_TOKEN or the apify_token platform secret.')
    return report
  }
  const pagesCap = await readMaxPages(svc)

  for (const job of jobs) {
    // Conditional claim: only one tick may move a job out of pending.
    const { data: claimed } = await svc
      .from('scrape_queue')
      .update({
        status: 'running',
        claimed_by: RUNNER,
        started_at: nowIso,
        attempts: (job.attempts ?? 0) + 1,
        error_message: null,
        updated_at: nowIso,
      })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id')
    if (!claimed || claimed.length === 0) continue

    try {
      const run = await startRun(apify.token, buildActorInput(job, pagesCap))
      await svc
        .from('scrape_queue')
        .update({ runner_run_id: run.runId, runner_dataset_id: run.datasetId, updated_at: new Date().toISOString() })
        .eq('id', job.id)
      report.started++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      report.errors.push(`${job.keyword} (${job.country_code}): ${msg}`)
      await svc.rpc('fail_scrape_job', { p_job_id: job.id, p_error: `Apify start failed: ${msg}`.slice(0, 500) })
    }
  }
  return report
}

export type SyncOutcome = 'completed' | 'failed' | 'running' | 'skipped'
export type SyncReport = { completed: number; failed: number; running: number; errors: string[] }

async function syncOneJob(svc: Svc, token: string, job: RunnerJob): Promise<SyncOutcome> {
  if (!job.runner_run_id) return 'skipped'
  const run = await getRun(token, job.runner_run_id)

  if (run.status === 'SUCCEEDED') {
    // Only one caller ingests: flip the claim marker first.
    const { data: won } = await svc
      .from('scrape_queue')
      .update({ claimed_by: `${RUNNER}:ingesting`, updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'running')
      .eq('claimed_by', RUNNER)
      .select('id')
    if (!won || won.length === 0) return 'skipped'

    try {
      const datasetId = job.runner_dataset_id ?? run.datasetId
      if (!datasetId) throw new Error('run has no dataset')
      const items = await getDatasetItems(token, datasetId)
      const { results, summary } = mapItemsToResults(items, job, { runId: job.runner_run_id })
      const { error } = await svc.rpc('complete_scrape_job', {
        p_job_id: job.id,
        p_results: results,
        p_summary: summary,
      })
      if (error) throw new Error(error.message)
      await svc.from('scrape_queue').update({ claimed_by: RUNNER }).eq('id', job.id)
      return 'completed'
    } catch (e) {
      // Give the claim back so the next tick retries the ingest.
      await svc.from('scrape_queue').update({ claimed_by: RUNNER }).eq('id', job.id)
      throw e
    }
  }

  if (run.status === 'RUNNING' || run.status === 'READY') {
    const startedMs = job.started_at ? Date.parse(job.started_at) : NaN
    if (Number.isFinite(startedMs) && Date.now() - startedMs > STALE_RUN_MS) {
      await svc.rpc('fail_scrape_job', { p_job_id: job.id, p_error: 'Apify run did not finish in 20 minutes.' })
      return 'failed'
    }
    return 'running'
  }

  // FAILED | ABORTED | TIMED-OUT | UNKNOWN
  await svc.rpc('fail_scrape_job', {
    p_job_id: job.id,
    p_error: `Apify run ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ''}`.slice(0, 500),
  })
  return 'failed'
}

/** Ingest finished runs and retire dead ones, oldest-first. */
export async function syncRunningGoogleJobs(svc: Svc, limit = 5): Promise<SyncReport> {
  const report: SyncReport = { completed: 0, failed: 0, running: 0, errors: [] }
  const { data, error } = await svc
    .from('scrape_queue')
    .select(RUNNER_JOB_COLS)
    .eq('status', 'running')
    .eq('claimed_by', RUNNER)
    .not('runner_run_id', 'is', null)
    .order('started_at', { ascending: true })
    .limit(limit)
  if (error) {
    report.errors.push(`running lookup: ${error.message}`)
    return report
  }
  const jobs = (data ?? []) as unknown as RunnerJob[]
  if (jobs.length === 0) return report
  const apify = await resolvePlatformApify(svc)
  if (!apify) {
    report.errors.push('No Apify token.')
    return report
  }
  for (const job of jobs) {
    try {
      const outcome = await syncOneJob(svc, apify.token, job)
      if (outcome === 'completed') report.completed++
      else if (outcome === 'failed') report.failed++
      else if (outcome === 'running') report.running++
    } catch (e) {
      report.errors.push(`${job.keyword} (${job.country_code}): ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return report
}

/** Webhook entry point: one run finished on Apify's side. */
export async function syncJobByRunId(svc: Svc, runId: string): Promise<SyncOutcome> {
  const { data } = await svc
    .from('scrape_queue')
    .select(RUNNER_JOB_COLS)
    .eq('runner_run_id', runId)
    .eq('status', 'running')
    .maybeSingle()
  const job = data as unknown as RunnerJob | null
  if (!job) return 'skipped'
  const apify = await resolvePlatformApify(svc)
  if (!apify) return 'skipped'
  return syncOneJob(svc, apify.token, job)
}
