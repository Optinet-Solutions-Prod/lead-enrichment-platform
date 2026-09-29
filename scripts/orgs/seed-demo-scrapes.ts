/**
 * Queue the three one-click demo batches (casino affiliates, VPN affiliates,
 * web hosting) under the admin account and drive the in-app runner
 * until Google results, affiliate verdicts and contacts have landed — so the
 * product has live examples to show before anyone touches the wizard.
 *
 * Run: npx tsx scripts/orgs/seed-demo-scrapes.ts [--only vpn,casino] [--admin admin@optinetsolutions.com]
 *      (server on :3000, or SMOKE_APP_URL — the tick endpoint lives in the app)
 */
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', quiet: true })
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON = process.env.CRON_SECRET!
const APP = process.env.SMOKE_APP_URL ?? 'http://localhost:3000'
const svc = createClient(SUPA, SERVICE, { auth: { persistSession: false } })

// Mirrors DEMO_PRESETS in app/(dashboard)/scrape/new/_lib/wizard-helpers.ts.
const PRESETS = [
  { key: 'casino', country: 'GB', keywords: ['best online casinos', 'new online casinos 2026'], stages: ['affiliate', 'contact'] },
  { key: 'vpn', country: 'GB', keywords: ['best vpn for streaming', 'best vpn 2026'], stages: ['affiliate', 'contact'] },
  { key: 'hosting', country: 'US', keywords: ['best web hosting for small business', 'best wordpress hosting 2026'], stages: ['affiliate', 'contact'] },
]

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}

async function tick(): Promise<Record<string, unknown>> {
  const res = await fetch(`${APP}/api/scrape/tick`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  return (await res.json()) as Record<string, unknown>
}

async function main() {
  const only = (arg('only') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const adminEmail = (arg('admin') ?? 'admin@optinetsolutions.com').toLowerCase()
  const presets = PRESETS.filter(p => only.length === 0 || only.includes(p.key))

  const { data: prof } = await svc
    .from('user_profiles')
    .select('username, display_name')
    .ilike('username', adminEmail.split('@')[0] ?? 'admin')
    .maybeSingle()
  const createdBy = {
    created_by_email: adminEmail,
    created_by_username: (prof as { username: string | null } | null)?.username ?? 'admin',
    created_by_display: (prof as { display_name: string | null } | null)?.display_name ?? 'Admin',
    created_by_is_shadow: false,
  }

  const ids: string[] = []
  for (const p of presets) {
    const groupId = randomUUID()
    const rows = p.keywords.map(keyword => ({
      keyword,
      country_code: p.country,
      pages: 2,
      priority: 15,
      with_enrichment: p.stages.includes('affiliate'),
      auto_stages: p.stages,
      language: 'en',
      search_engine: 'google',
      view_mode: 'desktop',
      scrape_source: 'apify',
      batch_group_id: groupId,
      ...createdBy,
    }))
    const { data, error } = await svc.from('scrape_queue').insert(rows).select('id, keyword')
    if (error) throw new Error(`insert ${p.key}: ${error.message}`)
    for (const r of (data ?? []) as Array<{ id: string; keyword: string }>) {
      ids.push(r.id)
      console.log(`queued  ${p.key.padEnd(9)} ${p.country}  "${r.keyword}"  ${r.id}`)
    }
  }

  const deadline = Date.now() + 15 * 60 * 1000
  let n = 0
  while (Date.now() < deadline) {
    const report = await tick()
    n++
    const { data } = await svc
      .from('scrape_queue')
      .select('id, keyword, status, with_enrichment, enrichment_status, auto_contact_enqueued_at, error_message')
      .in('id', ids)
    const jobs = (data ?? []) as Array<{ keyword: string; status: string; with_enrichment: boolean | null; enrichment_status: string | null; auto_contact_enqueued_at: string | null; error_message: string | null }>
    const { data: leads } = await svc.from('google_lead_gen_table').select('id').in('scrape_job_id', ids)
    const leadIds = ((leads ?? []) as Array<{ id: number }>).map(l => l.id)
    let inflight = 0
    if (leadIds.length > 0) {
      const { count } = await svc
        .from('enrichment_fetch_queue')
        .select('id', { count: 'exact', head: true })
        .in('lead_id', leadIds)
        .in('status', ['pending', 'running'])
      inflight = count ?? 0
    }
    const done =
      jobs.every(j => j.status === 'completed' || j.status === 'failed') &&
      jobs.every(j => j.status !== 'completed' || !j.with_enrichment || j.enrichment_status === 'complete') &&
      jobs.every(j => j.status !== 'completed' || j.auto_contact_enqueued_at !== null) &&
      inflight === 0
    console.log(
      `tick ${n}: ${jobs.map(j => `${j.status}${j.enrichment_status ? '/' + j.enrichment_status : ''}`).join(' ')} · leads ${leadIds.length} · fetches in flight ${inflight} · enrich ${JSON.stringify(report.enrich)}${report.errors && (report.errors as string[]).length ? ' · errors ' + JSON.stringify(report.errors) : ''}`,
    )
    if (done) break
    await sleep(8000)
  }

  const { data: final } = await svc
    .from('scrape_queue')
    .select('id, keyword, country_code, status, enrichment_status, error_message, result_summary')
    .in('id', ids)
  for (const j of (final ?? []) as Array<{ id: string; keyword: string; country_code: string; status: string; enrichment_status: string | null; error_message: string | null; result_summary: Record<string, unknown> | null }>) {
    const { count: leadN } = await svc.from('google_lead_gen_table').select('id', { count: 'exact', head: true }).eq('scrape_job_id', j.id)
    const { count: affN } = await svc.from('google_lead_gen_table').select('id', { count: 'exact', head: true }).eq('scrape_job_id', j.id).eq('is_affiliate', true)
    const { count: conN } = await svc.from('google_lead_gen_table').select('id', { count: 'exact', head: true }).eq('scrape_job_id', j.id).eq('has_contact_details', true)
    console.log(
      `${j.status.padEnd(9)} ${j.country_code} "${j.keyword}" — ${leadN ?? 0} leads, ${affN ?? 0} affiliates, ${conN ?? 0} with contacts${j.error_message ? ` — ${j.error_message}` : ''}`,
    )
  }
}

main().catch(e => {
  console.error('seed-demo-scrapes crashed:', e)
  process.exit(1)
})
