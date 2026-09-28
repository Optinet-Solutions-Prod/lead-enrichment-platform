import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
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
 */
export type TickReport = {
  enabled: boolean
  kickoff: KickoffReport | null
  sync: SyncReport | null
  chainsAdvanced: number
  contactJobsEnqueued: number
  enrich: InlineEnrichReport | null
  errors: string[]
  ms: number
}

async function runnerEnabled(svc: ReturnType<typeof createServiceClient>): Promise<boolean> {
  const { data } = await svc.rpc('get_system_setting', { p_key: 'inline_runner_enabled' })
  return data !== false && data !== 'false'
}

export async function runScrapeTick(opts: { enrichRows?: number; enrichDeadlineMs?: number } = {}): Promise<TickReport> {
  const t0 = Date.now()
  const svc = createServiceClient()
  const report: TickReport = {
    enabled: true,
    kickoff: null,
    sync: null,
    chainsAdvanced: 0,
    contactJobsEnqueued: 0,
    enrich: null,
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

  report.ms = Date.now() - t0
  return report
}
