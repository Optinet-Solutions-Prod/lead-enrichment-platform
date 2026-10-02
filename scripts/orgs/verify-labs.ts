/**
 * Labs page end to end as a throwaway member of Demo Org: every tool runs
 * against real public data, and an internal address is refused.
 *
 * Run: npx tsx scripts/orgs/verify-labs.ts   (server on :3000, or SMOKE_APP_URL)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'

config({ path: '.env.local', quiet: true })
const APP = process.env.SMOKE_APP_URL ?? 'http://localhost:3000'
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

let failures = 0
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Wait for a result block, or report the error line the tool showed instead. */
async function result(page: Page, selector: string, timeout: number): Promise<string> {
  const outcome = await Promise.race([
    page.locator(selector).waitFor({ timeout }).then(() => 'ok'),
    page.locator('p[role="alert"]').first().waitFor({ timeout }).then(() => 'alert'),
  ]).catch(() => 'timeout')
  if (outcome === 'ok') return page.locator(selector).innerText()
  const alert = outcome === 'alert' ? await page.locator('p[role="alert"]').first().innerText() : 'timed out'
  return `ERROR: ${alert}`
}

async function tab(page: Page, label: string) {
  await page.locator(`[role="tab"]:has-text("${label}")`).click()
}

async function main() {
  const { data: org } = await svc.from('organizations').select('id').eq('slug', 'demo-org').single()
  if (!org) throw new Error('Demo Org missing')
  const stamp = Date.now()
  const email = `verify-labs-${stamp}@example.com`
  const password = `verify-labs-${stamp}-Aa1!`
  const { data: created, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !created.user) throw new Error(`createUser: ${error?.message}`)
  const uid = created.user.id
  await svc.from('org_members').insert({ org_id: org.id, user_id: uid, role: 'member' })

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
    const serverErrors: string[] = []
    page.on('response', r => {
      if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`)
    })
    await page.goto(`${APP}/login`)
    await page.fill('input[name="username"]', email)
    await page.fill('input[name="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20_000 })

    await page.goto(`${APP}/labs`, { waitUntil: 'load' })
    await page.keyboard.press('Escape').catch(() => {})
    check('Labs page renders', (await page.locator('h1:has-text("Labs")').count()) === 1)
    check('Labs is in the sidebar', (await page.locator('a[href="/labs"]').count()) >= 1)
    check('roadmap lists the unbuilt features', (await page.locator('text=Drip campaigns and sequences').count()) === 1)

    // Domain search: a real site, and an internal address that must be refused.
    await page.fill('textarea[aria-label="Websites"]', 'ghost.org, localhost, 169.254.169.254')
    await page.locator('button:has-text("Find contacts")').click()
    await page.locator('[data-labs-domain-results]').waitFor({ timeout: 60_000 })
    const domainText = await page.locator('[data-labs-domain-results]').innerText()
    check('domain search reads a public site', /ghost\.org\s+\d+ pages? read/i.test(domainText), domainText.slice(0, 200).replace(/\s+/g, ' '))
    check('internal addresses are refused', /Not a website address/i.test(domainText) && !/169\.254\.169\.254\s+\d+ page/.test(domainText), domainText.slice(0, 300))

    await tab(page, 'Email verifier')
    await page.fill('textarea[aria-label="Email addresses"]', 'someone@gmail.com\ninfo@mailinator.com\nnobody@no-such-domain-zz-1234.com\nnot-an-email')
    await page.locator('section button:not([role="tab"])').filter({ hasText: /^\s*Verify\s*$/ }).click()
    await page.locator('[data-labs-verify-results]').waitFor({ timeout: 30_000 })
    const vt = await page.locator('[data-labs-verify-results]').innerText()
    check('verifier: webmail accepts mail', /someone@gmail\.com\s+Accepts mail/i.test(vt), vt)
    check('verifier: throwaway inbox flagged', /info@mailinator\.com\s+Risky/i.test(vt), vt)
    check('verifier: dead domain flagged', /no-such-domain-zz-1234\.com\s+No mail server/i.test(vt), vt)
    check('verifier: bad syntax flagged', /not-an-email\s+Invalid/i.test(vt), vt)

    await tab(page, 'Email pattern finder')
    await page.fill('input[aria-label="First name"]', 'Jane')
    await page.fill('input[aria-label="Last name"]', 'Doe')
    await page.fill('input[aria-label="Company website"]', 'ghost.org')
    await page.locator('section button:not([role="tab"])').filter({ hasText: /^\s*Find\s*$/ }).click()
    const pt = await result(page, '[data-labs-pattern-results]', 60_000)
    check('pattern finder offers jane.doe@', /jane\.doe@ghost\.org/.test(pt), pt.slice(0, 200))

    await tab(page, 'Tech & affiliate networks')
    await page.fill('input[aria-label="Website"]', 'ghost.org')
    await page.locator('section button:not([role="tab"]):has-text("Look up")').click()
    const tt = await result(page, '[data-labs-tech-results]', 45_000)
    check('tech lookup recognises the stack', /CMS|Analytics|Hosting|Newsletter/i.test(tt) && !tt.startsWith('ERROR'), tt.slice(0, 200).replace(/\s+/g, ' '))

    await tab(page, 'Sender check')
    await page.fill('input[aria-label="Sending domain"]', 'google.com')
    await page.locator('section button:not([role="tab"]):has-text("Check")').click()
    const at = await result(page, '[data-labs-auth-results]', 30_000)
    check('sender check: SPF and DMARC found for google.com', /SPF\s+Pass/i.test(at) && /DMARC\s+(Pass|Check)/i.test(at), at.slice(0, 300))

    await tab(page, 'AI email writer')
    await page.fill('input[aria-label="Site"]', 'ghost.org')
    await page.fill('input[aria-label="Your brand"]', 'Acme Hosting')
    await page.locator('section button:not([role="tab"])').filter({ hasText: /^\s*Write\s*$/ }).click()
    await page.locator('[data-labs-writer-result]').waitFor({ timeout: 45_000 })
    const draft = await page.inputValue('[data-labs-writer-result] textarea')
    check('writer drafts a message naming the brand', /Acme Hosting/i.test(draft) && draft.length > 80, draft.slice(0, 160))

    check('no 5xx responses', serverErrors.length === 0, serverErrors.join(' | '))
  } finally {
    await browser.close()
    await svc.from('org_members').delete().eq('user_id', uid)
    await svc.auth.admin.deleteUser(uid)
  }
  console.log(failures === 0 ? '\nALL LABS CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('verify-labs crashed:', e)
  process.exit(1)
})
