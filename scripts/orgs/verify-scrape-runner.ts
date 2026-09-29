/**
 * End-to-end check of the in-app scrape runner (Playwright/Chromium + DB):
 *   1. a fresh user opens /scrape/new?demo=vpn and presses "Start scraping"
 *   2. the ticket says the job is running (Apify run started by the action)
 *   3. /api/scrape/tick is driven until the Google results, the affiliate
 *      stage and the contact stage have all landed
 *   4. rows exist in google_lead_gen_table + website_profiles, verdicts and
 *      contact checks are stamped, the batch page renders
 *
 * Costs two small Apify runs. Cleans up its own user and batch; the website
 * profiles it created are global and stay (that is how the product works).
 *
 * Run: npx tsx scripts/orgs/verify-scrape-runner.ts   (server on :3000, or SMOKE_APP_URL)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

config({ path: '.env.local', quiet: true })
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON = process.env.CRON_SECRET!
const APP = process.env.SMOKE_APP_URL ?? 'http://localhost:3000'
const SHOTS = process.env.SHOTS_DIR ?? ''
const svc = createClient(SUPA, SERVICE, { auth: { persistSession: false } })

let failures = 0
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function tick(): Promise<Record<string, unknown>> {
  const res = await fetch(`${APP}/api/scrape/tick`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON}` },
  })
  return (await res.json()) as Record<string, unknown>
}

type Job = {
  id: string
  keyword: string
  status: string
  with_enrichment: boolean | null
  enrichment_status: string | null
  auto_contact_enqueued_at: string | null
  error_message: string | null
  result_summary: Record<string, unknown> | null
}

async function main() {
  const stamp = Date.now()
  const email = `verify-runner-${stamp}@example.com`
  const password = `verify-runner-${stamp}-Aa1!`
  const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  if (cErr || !created.user) throw new Error(`createUser: ${cErr?.message}`)
  const userId = created.user.id
  const { data: orgs } = await svc
    .from('organizations')
    .select('id')
    .in('slug', ['optinet-discovery', 'optinet-solutions'])
  for (const org of orgs ?? []) {
    await svc.from('org_members').insert({ org_id: org.id, user_id: userId, role: 'member' })
  }
  // Mark the tour as seen so it does not cover the wizard.
  await svc.from('user_profiles').update({ tour_state: { status: 'skipped', version: 99 } }).eq('id', userId)

  const browser = await chromium.launch()
  const jobIds: string[] = []
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
    const serverErrors: string[] = []
    page.on('response', r => {
      if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
    })

    await page.goto(`${APP}/login`)
    await page.fill('input[name="username"]', email)
    await page.fill('input[name="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20_000 }).catch(() => {})
    await page.waitForLoadState('networkidle')
    check('login lands on a dashboard page', !page.url().includes('/login'), page.url())

    // ---- the wizard, prefilled by the demo preset ----
    await page.goto(`${APP}/scrape/new?demo=vpn`)
    await page.waitForLoadState('networkidle')
    await page.locator('button[aria-pressed="true"]:has-text("VPN affiliates")').waitFor({ timeout: 10_000 }).catch(() => {})
    const demoActive = await page.locator('button[aria-pressed="true"]:has-text("VPN affiliates")').count()
    check('demo preset is applied on open', demoActive === 1)
    const chips = await page.locator('li:has-text("best vpn for streaming")').count()
    check('demo keywords are in the form', chips >= 1, `found ${chips}`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/wizard-desktop.png`, fullPage: true })

    const startBtn = page.locator('button:has-text("Start scraping")').first()
    await startBtn.waitFor({ timeout: 10_000 })
    check('Start scraping is enabled', await startBtn.isEnabled())
    await startBtn.click()
    const ticket = page.locator('text=Scrape ticket')
    await ticket.waitFor({ timeout: 60_000 })
    const runningText = await page.locator('text=/Running|Queued/').first().textContent().catch(() => '')
    check('ticket shows the job running', /Running/.test(runningText ?? ''), runningText ?? '')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/wizard-ticket.png`, fullPage: true })

    // ---- the batches exist and are running on Apify ----
    const { data: jobsNow } = await svc
      .from('scrape_queue')
      .select('id, keyword, status, claimed_by, runner_run_id, scrape_source, error_message, attempts')
      .eq('created_by_email', email)
      .order('created_at', { ascending: true })
    const jobs0 = (jobsNow ?? []) as Array<{ id: string; keyword: string; status: string; claimed_by: string | null; runner_run_id: string | null; scrape_source: string | null; error_message: string | null; attempts: number | null }>
    for (const j of jobs0) jobIds.push(j.id)
    check('one job per keyword, no VM sibling', jobs0.length === 2 && jobs0.every(j => j.scrape_source === 'apify'), JSON.stringify(jobs0.map(j => [j.keyword, j.scrape_source])))
    const startedImmediately = jobs0.filter(j => j.status === 'running' && !!j.runner_run_id).length
    check('the action started the Apify runs itself', startedImmediately === jobs0.length, JSON.stringify(jobs0.map(j => [j.status, j.runner_run_id, j.attempts, j.error_message])))

    // The list page ticks the runner every 5 s while a job is active, so the
    // network never goes idle — wait for the row instead.
    await page.goto(`${APP}/scrape`, { waitUntil: 'load' })
    const row = page.locator('text=best vpn for streaming').first()
    await row.waitFor({ timeout: 20_000 }).catch(() => {})
    const rowVisible = await page.locator('text=best vpn for streaming').count()
    check('the batch shows on the scraping table', rowVisible >= 1)
    check('table auto-refreshes while running', (await page.locator('text=auto-refreshing').count()) >= 1)

    // ---- drive the runner until results + enrichment are in ----
    let jobs: Job[] = []
    let ticks = 0
    const deadline = Date.now() + 8 * 60 * 1000
    let lastReport: Record<string, unknown> = {}
    while (Date.now() < deadline) {
      lastReport = await tick()
      ticks++
      const { data } = await svc
        .from('scrape_queue')
        .select('id, keyword, status, with_enrichment, enrichment_status, auto_contact_enqueued_at, error_message, result_summary')
        .in('id', jobIds)
      jobs = (data ?? []) as Job[]
      const scraped = jobs.every(j => j.status === 'completed')
      const chainDone = jobs.every(j => !j.with_enrichment || j.enrichment_status === 'complete')
      const contactQueued = jobs.every(j => j.auto_contact_enqueued_at !== null)
      let contactDone = false
      if (scraped && chainDone && contactQueued) {
        const { data: leads } = await svc.from('google_lead_gen_table').select('id').in('scrape_job_id', jobIds)
        const leadIds = ((leads ?? []) as Array<{ id: number }>).map(l => l.id)
        const { count } = await svc
          .from('enrichment_fetch_queue')
          .select('id', { count: 'exact', head: true })
          .in('lead_id', leadIds)
          .in('status', ['pending', 'running'])
        contactDone = (count ?? 0) === 0
      }
      const failed = jobs.some(j => j.status === 'failed')
      process.stdout.write(`  tick ${ticks}: ${jobs.map(j => `${j.status}/${j.enrichment_status ?? '-'}`).join(' ')} enrich=${JSON.stringify(lastReport.enrich)}\n`)
      if (failed || (scraped && chainDone && contactQueued && contactDone)) break
      await sleep(8000)
    }
    check('both jobs completed on Apify', jobs.every(j => j.status === 'completed'), jobs.map(j => `${j.keyword}: ${j.status} ${j.error_message ?? ''}`).join(' | '))
    check('affiliate chain reached complete', jobs.every(j => j.enrichment_status === 'complete'), jobs.map(j => j.enrichment_status ?? 'null').join(','))
    const summaries = jobs.map(j => j.result_summary)
    check('summary names the runner and counts pages', summaries.every(s => s && s.runner === 'apify-google' && typeof s.total_results === 'number'), JSON.stringify(summaries))

    const { data: leadRows } = await svc
      .from('google_lead_gen_table')
      .select('id, url, domain, result_type, profile_id, affiliate_checked_at, is_affiliate, contact_checked_at, has_contact_details, serp_title')
      .in('scrape_job_id', jobIds)
    const leads = (leadRows ?? []) as Array<{
      id: number; url: string; domain: string | null; result_type: string | null; profile_id: number | null
      affiliate_checked_at: string | null; is_affiliate: boolean | null; contact_checked_at: string | null; has_contact_details: boolean | null; serp_title: string | null
    }>
    check('Google results were stored as leads', leads.length >= 10, `${leads.length} rows`)
    check('every lead links to a website profile', leads.length > 0 && leads.every(l => l.profile_id !== null))
    check('titles came through from the SERP', leads.some(l => (l.serp_title ?? '').length > 0))
    const affChecked = leads.filter(l => l.affiliate_checked_at !== null).length
    check('affiliate detection ran on the leads', affChecked >= Math.floor(leads.length * 0.8), `${affChecked}/${leads.length}`)
    const affYes = leads.filter(l => l.is_affiliate === true).length
    console.log(`  affiliates found: ${affYes}/${leads.length}`)
    const conChecked = leads.filter(l => l.contact_checked_at !== null).length
    check('contact extraction ran on the leads', conChecked >= Math.floor(leads.length * 0.8), `${conChecked}/${leads.length}`)
    const conYes = leads.filter(l => l.has_contact_details === true).length
    check('at least one lead has contact details', conYes >= 1, `${conYes}/${leads.length}`)
    const { data: contacts } = await svc.from('contact_table').select('lead_id, emails, socials').in('lead_id', leads.map(l => l.id)).limit(5)
    console.log(`  sample contacts: ${JSON.stringify(contacts ?? []).slice(0, 400)}`)

    // ---- the batch page renders the results ----
    const firstJob = jobIds[0]!
    await page.goto(`${APP}/scrape/${firstJob}`, { waitUntil: 'load' })
    await page.locator('text=best vpn for streaming').first().waitFor({ timeout: 20_000 }).catch(() => {})
    await sleep(1500)
    const bodyText = (await page.locator('body').innerText()).slice(0, 8000)
    check('batch page shows the keyword and a completed status', /best vpn for streaming/i.test(bodyText) && /completed/i.test(bodyText))
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/batch-page.png`, fullPage: true })
    await page.goto(`${APP}/scrape`, { waitUntil: 'load' })
    await page.locator('text=best vpn for streaming').first().waitFor({ timeout: 20_000 }).catch(() => {})
    await sleep(1500)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/scrape-list.png`, fullPage: true })

    // Phone wizard for the eye.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await phone.goto(`${APP}/login`)
    await phone.fill('input[name="username"]', email)
    await phone.fill('input[name="password"]', password)
    await phone.click('button[type="submit"]')
    await phone.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20_000 }).catch(() => {})
    await phone.goto(`${APP}/scrape/new`, { waitUntil: 'load' })
    await phone.locator('text=New scrape').first().waitFor({ timeout: 20_000 }).catch(() => {})
    await sleep(1000)
    if (SHOTS) await phone.screenshot({ path: `${SHOTS}/wizard-phone.png`, fullPage: true })
    await phone.close()

    check('no 5xx responses during the whole flow', serverErrors.length === 0, serverErrors.join(' | '))
  } finally {
    await browser.close()
    for (const id of jobIds) {
      await svc.rpc('delete_scrape_job_cascade', { p_job_id: id })
    }
    await svc.from('org_members').delete().eq('user_id', userId)
    await svc.from('user_profiles').delete().eq('id', userId)
    await svc.auth.admin.deleteUser(userId)
    console.log(`\nCleanup: removed verify-runner user + ${jobIds.length} test batch(es).`)
  }
  console.log(failures === 0 ? '\nALL SCRAPE RUNNER CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('verify-scrape-runner crashed:', e)
  process.exit(1)
})
