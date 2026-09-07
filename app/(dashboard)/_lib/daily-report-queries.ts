import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { parseDateRange } from './date-range'

/**
 * "Daily report" snapshot for the Overview dashboard. All counts are for
 * a single UTC calendar day (today = midnight→now, yesterday = the full
 * prior UTC day), chosen by the Today/Yesterday toggle.
 *
 *   batchesScraped    — distinct scrape batches created in the day.
 *   scrapesCompleted  — phase-1 scrape rows that completed in the day.
 *   leadsFound        — google leads discovered (created) in the day.
 */

export type DailyReportDay = 'today' | 'yesterday'

export type DailyReport = {
  day: DailyReportDay
  label: string
  since: string
  until: string
  batchesScraped: number
  scrapesCompleted: number
  leadsFound: number
}

export async function loadDailyReport(day: DailyReportDay): Promise<DailyReport> {
  const svc = createServiceClient()
  const range = parseDateRange(day) // 'today' | 'yesterday' → UTC window
  const since = range.since
  const until = range.until

  // --- Scrape batches created in the window (distinct batch_id). A day's
  //     batch set is small, so fetch the ids and dedupe in memory.
  const { data: batchRows } = await svc
    .from('scrape_queue')
    .select('batch_id')
    .is('parent_scrape_job_id', null)
    .not('batch_id', 'is', null)
    .gte('created_at', since)
    .lte('created_at', until)
    .limit(10000)
  const batchesScraped = new Set(((batchRows ?? []) as Array<{ batch_id: number }>).map(r => r.batch_id)).size

  // --- Scrapes completed in the window (phase-1).
  const { count: scrapesCompleted } = await svc
    .from('scrape_queue')
    .select('id', { count: 'exact', head: true })
    .is('parent_scrape_job_id', null)
    .eq('status', 'completed')
    .gte('completed_at', since)
    .lte('completed_at', until)

  // --- Leads discovered in the window.
  const { count: leadsFound } = await svc
    .from('google_lead_gen_table')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
    .lte('created_at', until)

  return {
    day,
    label: range.label,
    since,
    until,
    batchesScraped,
    scrapesCompleted: scrapesCompleted ?? 0,
    leadsFound: leadsFound ?? 0,
  }
}
