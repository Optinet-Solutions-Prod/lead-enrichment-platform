import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBearer } from '@/lib/auth/bearer'
import { decodeAdUrl } from '@/lib/decode-ad-url'

// Vercel cron sends GET — alias to the same handler as manual POSTs.
export async function GET(request: NextRequest) {
  return POST(request)
}

/**
 * Orchestrator tick: housekeeping sweeps, enrichment-chain advancement,
 * and the PPC-screenshot / affiliate-scoring safety nets.
 *
 * No Vercel cron currently fires this (Hobby plan allows daily crons only,
 * and the recurring-schedules feature was removed with it) — trigger it
 * from an external scheduler or manually when workers are running.
 *
 * Secured by a shared bearer token: `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(request: NextRequest) {
  const check = requireBearer(
    request.headers.get('authorization'),
    process.env.CRON_SECRET,
    { secretName: 'CRON_SECRET' },
  )
  if (!check.ok) return Response.json({ error: check.error }, { status: check.status })

  const svc = createServiceClient()
  const now = new Date()

  // Housekeeping: cancel orphaned interactive checkpoints — ones left
  // status='waiting' after their scrape job already finished
  // (completed/failed/cancelled). Without this they linger in the
  // /admin/interactive queue and read to operators as captchas that
  // "keep coming back" (solving does nothing — no live scrape behind
  // them). Runs every minute here; wrapped so a failure never blocks
  // the scheduled-scrape logic below. See migration 20260728120000.
  let orphansCancelled = 0
  try {
    const { data: n, error } = await svc.rpc('cancel_orphaned_interactive_checkpoints')
    if (error) console.error('[scheduler/tick] orphan-checkpoint sweep failed', error)
    else orphansCancelled = typeof n === 'number' ? n : 0
  } catch (e) {
    console.error('[scheduler/tick] orphan-checkpoint sweep threw', e)
  }

  // Housekeeping: cancel in-flight scrapes that duplicate an
  // already-completed keyword×country×engine (pending/captcha/
  // needs_human, >15 min old so intentional "run anyway" overrides get
  // a grace period). Stops the "already resolved but keeps reappearing"
  // churn at the source. Also try/catch-guarded. See migration
  // 20260729120000.
  let dupesCancelled = 0
  try {
    const { data: n, error } = await svc.rpc('cancel_inflight_duplicate_scrapes')
    if (error) console.error('[scheduler/tick] inflight-dedupe sweep failed', error)
    else dupesCancelled = typeof n === 'number' ? n : 0
  } catch (e) {
    console.error('[scheduler/tick] inflight-dedupe sweep threw', e)
  }

  // ----------------------------------------------------------------
  // Orchestrator pass — advance the enrichment chain for any scrape
  // that has with_enrichment=true and isn't yet 'complete'.
  // ----------------------------------------------------------------
  const { data: pending, error: pendingErr } = await svc
    .from('scrape_queue')
    .select('id')
    .eq('with_enrichment', true)
    .eq('status', 'completed')
    .or('enrichment_status.is.null,enrichment_status.in.(pending,affiliate_running,rooster_running,all_running,contact_running)')
    .order('completed_at', { ascending: true })
    .limit(50)

  const advances: Array<{ id: string; status: string | null; error?: string }> = []
  if (!pendingErr && pending) {
    // Fan out the per-job RPC calls in capped-concurrency batches so a
    // pendng queue of 50 doesn't serialize into ~50 round-trips and
    // blow Vercel's 10s budget. The RPC is independent per job, so any
    // ordering effects are intentional (already deterministic on the
    // DB side).
    const BATCH = 10
    const ids = pending.map(row => (row as { id: string }).id)
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH)
      const results = await Promise.all(
        slice.map(async id => {
          const { data, error } = await svc.rpc('advance_enrichment_chain', { p_job_id: id })
          return { id, data, error }
        }),
      )
      for (const r of results) {
        if (r.error) advances.push({ id: r.id, status: null, error: r.error.message })
        else advances.push({ id: r.id, status: typeof r.data === 'string' ? r.data : null })
      }
    }
  }

  // ----------------------------------------------------------------
  // PPC screenshot safety net — ensure every PPC lead gets enriched
  // (and therefore screenshotted) even when the user queued the scrape
  // without with_enrichment, or when the scrape engine has no scrape-
  // time screenshot path (Bing). We find PPC leads from the last 24h
  // that have no screenshot AND no fetch row yet, and enqueue affiliate
  // detection with want_screenshot=true.
  // ----------------------------------------------------------------
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: orphanPpc } = await svc
    .from('google_lead_gen_table')
    .select('id, country_code, url, scrape_job_id')
    .eq('result_type', 'PPC')
    .is('screenshot_content_link', null)
    .neq('is_not_relevant', true)
    .gte('created_at', since)
    .order('id', { ascending: false })
    .limit(50)
  const ppcCandidates = ((orphanPpc ?? []) as Array<{
    id: number
    country_code: string | null
    url: string | null
    scrape_job_id: string | null
  }>).filter(r => r.country_code && r.url && r.url.startsWith('http'))

  let ppcEnqueued = 0
  if (ppcCandidates.length > 0) {
    const ids = ppcCandidates.map(r => r.id)
    const { data: existingFetches } = await svc
      .from('enrichment_fetch_queue')
      .select('lead_id')
      .in('lead_id', ids)
    const alreadyEnqueued = new Set(
      ((existingFetches ?? []) as Array<{ lead_id: number }>).map(r => r.lead_id),
    )
    // Decode Google aclk / Bing ck/a click-tracker URLs so the
    // enrichment worker visits the real landing page instead of the
    // redirector (which often expires and bounces to a Bing/Google
    // error page — that's the "screenshots of google results" report).
    const toInsert = ppcCandidates
      .filter(r => !alreadyEnqueued.has(r.id))
      .map(r => ({
        lead_id: r.id,
        country_code: r.country_code!,
        url: decodeAdUrl(r.url!),
        want_html: true,
        want_screenshot: true,
        process_stages: ['affiliate'],
      }))
    if (toInsert.length > 0) {
      const { error: insErr } = await svc.from('enrichment_fetch_queue').insert(toInsert)
      if (!insErr) ppcEnqueued = toInsert.length
    }
  }

  // ----------------------------------------------------------------
  // Affiliate safety net — ALWAYS score affiliate status on recent leads, even
  // when the scrape was queued WITHOUT with_enrichment. The chain above only
  // advances with_enrichment=true jobs, so new/unknown domains from a no-enrich
  // scrape were left is_affiliate=null (operators: "has tracking links, should
  // be an affiliate, but no tag"). Enqueue ONLY the cheap affiliate stage for
  // recent, relevant, still-unscored ORGANIC leads with no fetch
  // row yet. Known domains already inherited is_affiliate so they won't match;
  // PPC leads are covered by the net above; the heavier contact/stag
  // stages stay gated behind the enrichment toggle.
  const { data: unscored } = await svc
    .from('google_lead_gen_table')
    .select('id, country_code, url')
    .is('is_affiliate', null)
    .is('affiliate_checked_at', null)
    .neq('is_not_relevant', true)
    .neq('result_type', 'PPC')
    .gte('created_at', since)
    .order('id', { ascending: false })
    .limit(50)
  const affCandidates = ((unscored ?? []) as Array<{
    id: number
    country_code: string | null
    url: string | null
  }>).filter(r => r.country_code && r.url && r.url.startsWith('http'))

  let affEnqueued = 0
  if (affCandidates.length > 0) {
    const ids = affCandidates.map(r => r.id)
    const { data: existingAff } = await svc
      .from('enrichment_fetch_queue')
      .select('lead_id')
      .in('lead_id', ids)
    const alreadyAff = new Set(
      ((existingAff ?? []) as Array<{ lead_id: number }>).map(r => r.lead_id),
    )
    const toInsertAff = affCandidates
      .filter(r => !alreadyAff.has(r.id))
      .map(r => ({
        lead_id: r.id,
        country_code: r.country_code!,
        url: r.url!,
        want_html: true,
        want_screenshot: false,
        process_stages: ['affiliate'],
      }))
    if (toInsertAff.length > 0) {
      const { error: insErr } = await svc.from('enrichment_fetch_queue').insert(toInsertAff)
      if (!insErr) affEnqueued = toInsertAff.length
    }
  }

  return Response.json({
    ok: true,
    now: now.toISOString(),
    enrichment_advances: advances,
    ppc_screenshot_enqueued: ppcEnqueued,
    affiliate_scoring_enqueued: affEnqueued,
    orphan_checkpoints_cancelled: orphansCancelled,
    duplicate_scrapes_cancelled: dupesCancelled,
  })
}
