import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { runAiAnalysis, readKey, type AiRunResult } from '@/lib/ai-analysis/run'
import {
  kickoffPendingGoogleJobs,
  syncRunningGoogleJobs,
  type KickoffReport,
  type SyncReport,
} from './apify-google'
import {
  advanceEnrichmentChains,
  autoEnqueueContactStage,
  processEnrichmentQueueInline,
  type InlineEnrichReport,
} from './inline-enrich'

/**
 * One tick of the in-app scrape runner. Idempotent and safe to call often:
 * the /scrape pages call it on every auto-refresh, the Apify webhook calls
 * it when a run finishes, and the scheduler cron calls it as a fallback.
 *
 * Order: start Google runs → ingest finished runs → enrichment chain →
 * contact stage → fetch queue → and, once the fetch queue is idle, a slice
 * of the AI analysis (relevance judge, triage, audit of one site with the
 * brands it endorses and its CTA links) so the website profiles fill in
 * while someone is looking, without a separate scheduler.
 */
export type TickReport = {
  enabled: boolean
  kickoff: KickoffReport | null
  sync: SyncReport | null
  chainsAdvanced: number
  contactJobsEnqueued: number
  enrich: InlineEnrichReport | null
  ai: AiRunResult | { skipped: string } | null
  errors: string[]
  ms: number
}

async function runnerEnabled(svc: ReturnType<typeof createServiceClient>): Promise<boolean> {
  const { data } = await svc.rpc('get_system_setting', { p_key: 'inline_runner_enabled' })
  return data !== false && data !== 'false'
}

/** One AI slice at a time per server instance; a second tick that arrives
 *  while it runs just skips the stage. */
let aiInFlight = false

export async function runScrapeTick(
  opts: { enrichRows?: number; enrichDeadlineMs?: number; ai?: boolean; aiDeadlineMs?: number } = {},
): Promise<TickReport> {
  const t0 = Date.now()
  const svc = createServiceClient()
  const report: TickReport = {
    enabled: true,
    kickoff: null,
    sync: null,
    chainsAdvanced: 0,
    contactJobsEnqueued: 0,
    enrich: null,
    ai: null,
    errors: [],
    ms: 0,
  }
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      report.errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!(await runnerEnabled(svc))) {
    report.enabled = false
    report.ms = Date.now() - t0
    return report
  }

  await step('kickoff', async () => { report.kickoff = await kickoffPendingGoogleJobs(svc, 3) })
  await step('sync', async () => { report.sync = await syncRunningGoogleJobs(svc, 5) })
  await step('chains', async () => { report.chainsAdvanced = await advanceEnrichmentChains(svc) })
  await step('contact', async () => { report.contactJobsEnqueued = await autoEnqueueContactStage(svc) })
  await step('enrich', async () => {
    report.enrich = await processEnrichmentQueueInline(svc, {
      maxRows: opts.enrichRows ?? 4,
      deadlineMs: opts.enrichDeadlineMs ?? 22_000,
    })
  })
  // A second pass so a chain whose last fetch just finished flips to
  // complete on this tick instead of the next one.
  await step('chains', async () => { report.chainsAdvanced += await advanceEnrichmentChains(svc) })
  await step('contact', async () => { report.contactJobsEnqueued += await autoEnqueueContactStage(svc) })

  // AI analysis: only when the fetch queue had nothing to do this tick, so
  // the two never compete for the function's time budget.
  if (opts.ai !== false && (report.enrich?.claimed ?? 0) === 0) {
    await step('ai', async () => {
      if (!(await readKey(svc))) {
        report.ai = { skipped: 'no OpenAI key' }
        return
      }
      if (aiInFlight) {
        report.ai = { skipped: 'already running' }
        return
      }
      aiInFlight = true
      try {
        report.ai = await runAiAnalysis(svc, {
          days: 3,
          triageLimit: 10,
          auditLimit: 1,
          concurrency: 2,
          deadlineMs: opts.aiDeadlineMs ?? 20_000,
        })
      } finally {
        aiInFlight = false
      }
    })
  }

  report.ms = Date.now() - t0
  return report
}
