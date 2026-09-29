/**
 * Real-browser server-action check (Playwright/Chromium): logs in through
 * the UI, dismisses the tour, and switches workspaces three times, asserting
 * no error page and that active_org_id follows in the DB.
 *
 * WHY: page-GET smoke tests can't catch a broken server-actions chunk — a
 * single `export type { X }` re-export in a 'use server' file crashed chunk
 * evaluation ("SourceResult is not defined") and 500'd EVERY action bundled
 * with it (org switch, sign-out, tour save) while all GETs stayed green
 * (found 2026-09-14, the "This page couldn't load" bug).
 *
 * Run: npx tsx scripts/orgs/verify-actions.ts   (server on :3000, or SMOKE_APP_URL)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

config({ path: '.env.local', quiet: true })
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP = process.env.SMOKE_APP_URL ?? 'http://localhost:3000'
const svc = createClient(SUPA, SERVICE, { auth: { persistSession: false } })

let failures = 0
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const stamp = Date.now()
  const email = `verify-actions-${stamp}@example.com`
  const password = `verify-actions-${stamp}-Aa1!`
  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (cErr || !created.user) throw new Error(`createUser: ${cErr?.message}`)
  const userId = created.user.id

  const { data: orgs } = await svc
    .from('organizations')
    .select('id, name, slug')
    .in('slug', ['optinet-discovery', 'optinet-solutions'])
  if (!orgs || orgs.length < 2) throw new Error('need the two admin orgs to exist')

  const browser = await chromium.launch()
  try {
    for (const org of orgs) {
      await svc.from('org_members').insert({ org_id: org.id, user_id: userId, role: 'member' })
    }
    const page = await browser.newPage()
    const serverErrors: string[] = []
    page.on('response', r => {
      if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`)
    })

    await page.goto(`${APP}/login`)
    await page.fill('input[name="username"]', email)
    await page.fill('input[name="password"]', password)
    await page.click('button[type="submit"]')
    // Wait for the post-login navigation itself: with loading boundaries the
    // network can go idle before the redirect away from /login lands.
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20_000 }).catch(() => {})
    await page.waitForLoadState('networkidle')
    check('login lands on a dashboard page', !page.url().includes('/login'), page.url())

    // A brand-new account gets the guided tour automatically. Escape both
    // dismisses it and exercises saveTourStateAction (a real action POST).
    const sawPropertyTour = await page
      .locator('#driver-popover-content')
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false)
    check('guided tour auto-starts for a new account', sawPropertyTour)
    if (sawPropertyTour) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }

    // The affiliate workspace has its own script. Reset the profile so it
    // counts as a first visit again, then open the affiliate home.
    await svc.from('user_profiles').update({ tour_state: null }).eq('id', userId)
    // 'load', not 'networkidle': while a scrape is active the page ticks the
    // runner every 5 s and the network never goes quiet.
    await page.goto(`${APP}/scrape`, { waitUntil: 'load' })
    const sawAffiliateTour = await page
      .locator('#driver-popover-content')
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false)
    check('guided tour auto-starts on the affiliate workspace', sawAffiliateTour)
    if (sawAffiliateTour) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }

    for (let round = 1; round <= 3; round++) {
      await page.goto(`${APP}/scrape`, { waitUntil: 'load' })
      await page.waitForLoadState('networkidle')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      await page.locator('button[title="Switch workspace"]').click()
      const option = page
        .locator('div[role="listbox"] button[role="option"]:not([disabled])')
        .first()
      await option.waitFor({ timeout: 5000 })
      const targetName = (await option.innerText()).split('\n')[0]!
      const target = orgs.find(o => o.name === targetName)
      await option.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1200)

      const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      const { data: prof } = await svc
        .from('user_profiles')
        .select('active_org_id')
        .eq('id', userId)
        .maybeSingle()
      check(
        `switch ${round} (${targetName}): no error page`,
        !/couldn.t load|server error/i.test(bodyText),
        bodyText.slice(0, 120),
      )
      check(
        `switch ${round} (${targetName}): active_org applied`,
        prof?.active_org_id === target?.id,
        `active=${prof?.active_org_id}`,
      )
    }
    // Outreach tracking renders on a website page (status select in the
    // header). Render-only, nothing is changed.
    const { data: anyProfile } = await svc
      .from('website_profiles')
      .select('normalized_domain')
      .not('first_lead_id', 'is', null)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    const domain = (anyProfile as { normalized_domain: string } | null)?.normalized_domain
    if (domain) {
      await page.goto(`${APP}/websites/${encodeURIComponent(domain)}`, { waitUntil: 'load' })
      await page.locator('select[name="status"]').first().waitFor({ timeout: 15_000 }).catch(() => {})
      const outreachSelects = await page.locator('select[name="status"]').count()
      check('outreach editor renders on a website page', outreachSelects > 0, `found ${outreachSelects} on ${domain}`)
    } else {
      check('outreach editor renders on a website page', false, 'no website profile to open')
    }

    check('no 5xx responses during the whole flow', serverErrors.length === 0, serverErrors.join(' | '))
  } finally {
    await browser.close()
    await svc.from('org_members').delete().eq('user_id', userId)
    await svc.from('user_profiles').delete().eq('id', userId)
    await svc.auth.admin.deleteUser(userId)
    console.log('\nCleanup: removed verify-actions user + memberships.')
  }
  console.log(failures === 0 ? '\nALL ACTION CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('verify-actions crashed:', e)
  process.exit(1)
})
