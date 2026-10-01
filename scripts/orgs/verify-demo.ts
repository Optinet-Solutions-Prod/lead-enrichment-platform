/**
 * Landing-page demo, end to end (Playwright/Chromium, no account):
 *   hero "Try it now" scrolls to the demo → preset → Run → results modal
 *   with cards, verdict chips and contacts → Email/SMS draft → confirmation.
 * Costs one Apify page. Removes the demo_runs row it created.
 *
 * Run: npx tsx scripts/orgs/verify-demo.ts   (server on :3000, or SMOKE_APP_URL)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

config({ path: '.env.local', quiet: true })
const APP = process.env.SMOKE_APP_URL ?? 'http://localhost:3000'
const SHOTS = process.env.SHOTS_DIR ?? ''
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

let failures = 0
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const browser = await chromium.launch()
  let runId: string | null = null
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
    const serverErrors: string[] = []
    page.on('response', r => {
      if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
      if (r.url().includes('/api/demo/start') && r.ok()) {
        r.json().then((b: { id?: string }) => { runId = b.id ?? null }).catch(() => {})
      }
    })

    await page.goto(`${APP}/`, { waitUntil: 'load' })
    check('landing page renders the hero', (await page.locator('text=Try it now').count()) >= 1)
    await page.locator('button:has-text("Try it now")').first().click()
    await page.waitForTimeout(900)
    const demoTop = await page.locator('#demo').evaluate(el => el.getBoundingClientRect().top)
    check('Try it now scrolls to the demo section', demoTop < 200, `top=${Math.round(demoTop)}`)
    const focused = await page.evaluate(() => document.activeElement?.tagName === 'INPUT')
    check('the keyword field takes focus', focused)

    await page.locator('button:has-text("VPN brand")').click()
    check('preset fills the keyword', (await page.inputValue('#demo input')) === 'best vpn for streaming')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/demo-form.png`, fullPage: false })

    await page.locator('button:has-text("Run demo scrape")').click()
    const started = await Promise.race([
      page.locator('text=Searching Google').waitFor({ timeout: 20_000 }).then(() => 'ok' as const),
      page.locator('#demo [data-demo-error]').waitFor({ timeout: 20_000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const)
    if (started !== 'ok') {
      const msg = started === 'error' ? await page.locator('#demo [data-demo-error]').first().textContent() : 'no progress panel within 20 s'
      check('progress panel appears', false, msg ?? started)
      throw new Error(`demo did not start: ${msg ?? started}`)
    }
    check('progress panel appears', true)

    const dialog = page.locator('[role="dialog"]')
    await dialog.waitFor({ timeout: 240_000 })
    check('results modal opens when the run completes', true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/demo-results.png`, fullPage: false })

    const onTop = await page.locator('[data-demo-card]').count()
    const fold = page.locator('[role="dialog"] button[aria-expanded]')
    if ((await fold.count()) > 0) await fold.first().click()
    const cards = await page.locator('[data-demo-card]').count()
    check('result cards render', cards >= 5, `${cards} cards (${onTop} shown before expanding)`)
    check('confirmed sites sit on top, the rest folded', onTop < cards || onTop >= 5, `${onTop} on top of ${cards}`)
    const kindChips = await page.locator('[data-demo-card] >> text=/^(Affiliate|Operator|Publisher)/').count()
    check('affiliate / operator / publisher chips are present', kindChips >= 1, `${kindChips}`)
    const relevantChips = await page.locator('[data-demo-card] >> text=/^Relevant$/').count()
    check('relevance chips are present', relevantChips >= 1, `${relevantChips}`)
    const brandBlocks = await page.locator('[data-demo-card] >> text=/Endorses|Mentions/').count()
    check('brands endorsed / CTA links shown on at least one site', brandBlocks >= 1, `${brandBlocks}`)
    const hearts = await page.locator('[data-demo-card] button[aria-label="Add to relevant list"]').count()
    check('heart toggle on every card', hearts === cards, `${hearts}/${cards}`)
    await page.locator('[data-demo-card] button[aria-label="Add to relevant list"]').first().click()
    check('hearting a site counts it in the list', (await page.locator('text=/1 in your list|1 in your relevant list/').count()) >= 1)
    const contactChips = await page.locator('[data-demo-card] span:has-text("@"), [data-demo-card] a:has-text("Contact page")').count()
    check('contacts were found on at least one site', contactChips >= 1, `${contactChips}`)

    const emailBtn = page.locator('[data-demo-card] button:has-text("Email"):not([disabled])').first()
    const smsBtn = page.locator('[data-demo-card] button:has-text("SMS"):not([disabled])').first()
    const hasEmail = (await emailBtn.count()) > 0
    const hasSms = (await smsBtn.count()) > 0
    check('an outreach channel is available on a result', hasEmail || hasSms)
    if (hasEmail || hasSms) {
      await (hasEmail ? emailBtn : smsBtn).click()
      await page.locator('textarea').waitFor({ timeout: 5000 })
      const body = await page.inputValue('textarea')
      check('the draft names the site and the keyword', /best vpn for streaming/i.test(body))
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/demo-compose.png`, fullPage: false })
      await page.locator('button:has-text("Send")').last().click()
      await page.locator('text=Nothing was sent').waitFor({ timeout: 5000 })
      check('sending shows the confirmation, nothing sent', true)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/demo-confirmation.png`, fullPage: false })
      await page.locator('button:has-text("Back to results")').click()
      check('the card shows the draft state', (await page.locator('text=/drafted/i').count()) >= 1)
    }

    // Phone layout of the form for the eye.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await phone.goto(`${APP}/`, { waitUntil: 'load' })
    if (SHOTS) await phone.screenshot({ path: `${SHOTS}/demo-phone.png`, fullPage: true })
    await phone.close()

    check('no 5xx responses during the whole flow', serverErrors.length === 0, serverErrors.join(' | '))
  } finally {
    await browser.close()
    if (runId) await svc.from('demo_runs').delete().eq('id', runId)
    console.log(`\nCleanup: removed demo run ${runId ?? '(none)'}.`)
  }
  console.log(failures === 0 ? '\nALL DEMO CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('verify-demo crashed:', e)
  process.exit(1)
})
