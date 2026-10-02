/**
 * Affiliate data is per workspace: a throwaway user joins "Demo Org" (no
 * gambling) and "Full Demo Org" (casino included), and the scrape list, leads,
 * partners and a website page are checked in each.
 *
 *   Demo Org      → VPN / hosting jobs only, no casino keyword anywhere,
 *                   a casino-only site reads as not found.
 *   Full Demo Org → the casino jobs are there.
 *
 * Run: npx tsx scripts/orgs/verify-org-data.ts   (server on :3000, or SMOKE_APP_URL)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'

config({ path: '.env.local', quiet: true })
const APP = process.env.SMOKE_APP_URL ?? 'http://localhost:3000'
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const CASINO = /casino|gambl|betting/i

let failures = 0
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function text(page: Page, path: string): Promise<string> {
  await page.goto(`${APP}${path}`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  await page.keyboard.press('Escape').catch(() => {})
  return page.evaluate(() => document.body.innerText)
}

async function main() {
  const { data: orgs } = await svc.from('organizations').select('id, slug').in('slug', ['demo-org', 'full-demo-org'])
  const demo = orgs?.find(o => o.slug === 'demo-org')
  const full = orgs?.find(o => o.slug === 'full-demo-org')
  if (!demo || !full) throw new Error('run supabase/seed/demo_orgs.sql first')

  // A site only the casino scrapes found — must not open from Demo Org.
  const { data: casinoLead } = await svc
    .from('google_lead_gen_table')
    .select('domain, profile_id')
    .eq('org_id', full.id)
    .ilike('keyword', '%casino%')
    .not('profile_id', 'is', null)
    .limit(50)
  const { data: demoLinks } = await svc.from('org_website_profiles').select('profile_id').eq('org_id', demo.id)
  const inDemo = new Set((demoLinks ?? []).map(r => r.profile_id))
  const casinoOnly = (casinoLead ?? []).find(r => !inDemo.has(r.profile_id))
  const { data: prof } = casinoOnly
    ? await svc.from('website_profiles').select('normalized_domain').eq('id', casinoOnly.profile_id).single()
    : { data: null }
  const casinoDomain = (prof as { normalized_domain: string } | null)?.normalized_domain ?? null

  const stamp = Date.now()
  const email = `verify-orgdata-${stamp}@example.com`
  const password = `verify-orgdata-${stamp}-Aa1!`
  const { data: created, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !created.user) throw new Error(`createUser: ${error?.message}`)
  const uid = created.user.id
  await svc.from('org_members').insert([
    { org_id: demo.id, user_id: uid, role: 'member' },
    { org_id: full.id, user_id: uid, role: 'member' },
  ])

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

    // --- Demo Org
    await svc.from('user_profiles').update({ active_org_id: demo.id }).eq('id', uid)
    const scrapeDemo = await text(page, '/scrape?day=all&owner=all')
    check('Demo Org: VPN jobs are listed', /best vpn/i.test(scrapeDemo))
    check('Demo Org: no casino job in the scrape list', !CASINO.test(scrapeDemo))
    const leadsDemo = await text(page, '/leads')
    check('Demo Org: no casino keyword in leads', !CASINO.test(leadsDemo))
    const partnersDemo = await text(page, '/affiliates?filter=audited')
    check('Demo Org: partners page renders', partnersDemo.length > 100)
    if (casinoDomain) {
      const site = await text(page, `/websites/${encodeURIComponent(casinoDomain)}`)
      check(`Demo Org: casino-only site ${casinoDomain} shows no appearances`, !CASINO.test(site), site.slice(0, 200))
    } else {
      check('found a casino-only site to probe', false)
    }
    const wizardDemo = await text(page, '/scrape/new')
    check('Demo Org: no casino preset in the new-scrape screen', !CASINO.test(wizardDemo))

    // --- Full Demo Org
    await svc.from('user_profiles').update({ active_org_id: full.id }).eq('id', uid)
    const scrapeFull = await text(page, '/scrape?day=all&owner=all')
    check('Full Demo Org: casino jobs are listed', /online casinos/i.test(scrapeFull))
    check('Full Demo Org: VPN jobs are listed', /best vpn/i.test(scrapeFull))
    const wizardFull = await text(page, '/scrape/new')
    check('Full Demo Org: casino preset offered', CASINO.test(wizardFull))

    check('no 5xx responses', serverErrors.length === 0, serverErrors.join(' | '))
  } finally {
    await browser.close()
    await svc.from('org_members').delete().eq('user_id', uid)
    await svc.auth.admin.deleteUser(uid)
  }
  console.log(failures === 0 ? '\nALL ORG DATA CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('verify-org-data crashed:', e)
  process.exit(1)
})
