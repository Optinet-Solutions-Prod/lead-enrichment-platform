/**
 * Acceptance check for the Google-Lead-Gen website-profiles port
 * (docs/for-saas-repo-2026-09-24.md §12), end to end against a running app
 * (default http://localhost:3000, or SMOKE_APP_URL):
 *
 *   - a re-scrape of ONLY already-known websites still writes its full row
 *     set (the regression that motivated the job-scoped dedupe)
 *   - same-site duplicates collapse, every sighting is an appearance
 *   - the batch header names what it hid / collapsed, and agrees with rows
 *   - /websites/[domain] renders, Back returns to the batch, an absolute
 *     `from` is refused (no open redirect), unknown domains 404
 *   - old ?lead=<id> permalinks redirect to the website page
 *   - advanced search finds a batch by a website it produced
 *   - /api/ai-analysis/run answers with its OWN bearer check (not a login
 *     redirect) and is a no-op while ai_analysis_enabled is off
 *
 * Creates a throwaway user, org, jobs and uniquely-named websites; removes
 * them all at the end. Run: npx tsx scripts/orgs/verify-websites.ts
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', quiet: true })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON = process.env.CRON_SECRET ?? ''
const APP = process.env.SMOKE_APP_URL ?? 'http://localhost:3000'
const PROJECT_REF = new globalThis.URL(URL).hostname.split('.')[0]
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

let failures = 0
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const stamp = Date.now()
  const email = `verify-websites-${stamp}@example.com`
  const password = `verify-websites-${stamp}-Aa1!`
  const alpha = `casinoalpha-${stamp}.com`
  const beta = `casinobeta-${stamp}.net`
  const wiki = `t${stamp}.wikipedia.org` // registered domain is on the known non-affiliate list
  const domains = [alpha, beta, wiki]

  const results = [
    { url: `https://www.${alpha}/`, full_url: `https://www.${alpha}/`, title: 'Casino Alpha review', description: 'Best casino bonuses in Malta', page: 1, position: 1, overall_position: 1, resultType: 'Organic', seen_on: 'desktop' },
    { url: `https://${beta}/top`, full_url: `https://${beta}/top`, title: 'Top casinos', snippet: 'Ranked list', page: 1, position: 2, overall_position: 2, resultType: 'Organic', seen_on: 'desktop' },
    { url: `https://www.${alpha}/mobile`, full_url: `https://www.${alpha}/mobile`, title: 'Casino Alpha mobile', page: 1, position: 3, overall_position: 3, resultType: 'Organic', seen_on: 'mobile' },
    { url: `https://${wiki}/wiki/Casino`, full_url: `https://${wiki}/wiki/Casino`, title: 'Casino - Wikipedia', page: 1, position: 4, overall_position: 4, resultType: 'Organic', seen_on: 'desktop' },
  ]

  const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
  if (cErr || !created.user) throw new Error(`createUser: ${cErr?.message}`)
  const userId = created.user.id
  const jobIds: string[] = []
  let orgId: string | null = null

  try {
    // --- two scrapes of the same websites --------------------------------
    for (let i = 0; i < 2; i++) {
      const { data: job, error } = await svc
        .from('scrape_queue')
        .insert({ keyword: `verify casino ${stamp}`, country_code: 'MT', status: 'running', created_by_email: email })
        .select('id')
        .single()
      if (error || !job) throw new Error(`insert job: ${error?.message}`)
      jobIds.push(job.id as string)
      const { error: rpcErr } = await svc.rpc('complete_scrape_job', {
        p_job_id: job.id,
        p_results: results,
        p_summary: { organic_results: results.length },
      })
      if (rpcErr) throw new Error(`complete_scrape_job: ${rpcErr.message}`)
    }
    const [jobA, jobB] = jobIds as [string, string]

    const rowsOf = async (jobId: string) => {
      const { data } = await svc
        .from('google_lead_gen_table')
        .select('id, url, serp_title, serp_description, system_flag, profile_id')
        .eq('scrape_job_id', jobId)
      return (data ?? []) as Array<{ id: number; url: string; serp_title: string | null; serp_description: string | null; system_flag: string | null; profile_id: number | null }>
    }
    const rowsA = await rowsOf(jobA)
    const rowsB = await rowsOf(jobB)
    check('first scrape writes one row per website (same-site duplicate collapsed)', rowsA.length === 3, `got ${rowsA.length}`)
    check('re-scrape of only KNOWN websites still writes its full row set', rowsB.length === 3, `got ${rowsB.length}`)
    check('every row is linked to a website profile', rowsB.every(r => r.profile_id !== null))
    check('SERP title + snippet stored (description and snippet field names)', rowsB.filter(r => r.serp_title && r.serp_description).length === 2)
    check('known non-affiliate host is system-flagged', rowsB.some(r => r.system_flag !== null && r.url.includes(wiki)))

    const { count: appearances } = await svc
      .from('website_appearances')
      .select('id', { count: 'exact', head: true })
      .in('scrape_job_id', jobIds)
    check('every sighting is logged as an appearance (4 per scrape)', appearances === 8, `got ${appearances}`)
    const { data: alphaProfile } = await svc
      .from('website_profiles')
      .select('appearance_count, first_seen_at')
      .eq('normalized_domain', alpha)
      .maybeSingle()
    check('profile appearance_count counts both scrapes', alphaProfile?.appearance_count === 4, JSON.stringify(alphaProfile))

    // --- a signed-in session ------------------------------------------------
    const tok = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(r => r.json() as Promise<{ access_token: string }>)
    const orgRes = await fetch(`${URL}/rest/v1/rpc/create_organization`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_name: `Verify Websites ${stamp}` }),
    })
    orgId = (await orgRes.json()) as string
    await svc.from('org_settings').update({ enabled_modules: ['affiliate'] }).eq('org_id', orgId)
    const session = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(r => r.json() as Promise<Record<string, unknown>>)
    const raw = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
    const CHUNK = 3180
    const parts: string[] = []
    if (raw.length <= CHUNK) parts.push(`sb-${PROJECT_REF}-auth-token=${raw}`)
    else for (let i = 0; i * CHUNK < raw.length; i++) parts.push(`sb-${PROJECT_REF}-auth-token.${i}=${raw.slice(i * CHUNK, (i + 1) * CHUNK)}`)
    const cookie = parts.join('; ')
    const get = (path: string) => fetch(`${APP}${path}`, { headers: { Cookie: cookie }, redirect: 'manual' })

    // --- batch page ---------------------------------------------------------
    const batch = await get(`/scrape/${jobB}?show_hidden=1`)
    const batchHtml = await batch.text()
    check('batch page renders', batch.status === 200, `status ${batch.status}`)
    check('batch header names the system-flagged row', /hidden by a system flag|system-flagged/.test(batchHtml) || /Hide not-relevant \/ flagged/.test(batchHtml))
    check('batch header names the collapsed same-site duplicate', batchHtml.includes('same-site duplicate'))
    check('batch shows "In system" for websites an earlier scrape found', batchHtml.includes('In system'))

    // --- website page -------------------------------------------------------
    const site = await get(`/websites/${alpha}?from=${encodeURIComponent(`/scrape/${jobB}`)}`)
    const siteHtml = await site.text()
    check('website page renders', site.status === 200, `status ${site.status}`)
    check('website page shows its appearances', siteHtml.includes('Appearances'))
    check('Back returns to the batch it came from', siteHtml.includes(`href="/scrape/${jobB}"`) && siteHtml.includes('Back to batch'))
    const evil = await get(`/websites/${alpha}?from=${encodeURIComponent('https://evil.example.com/x')}`)
    const evilHtml = await evil.text()
    // The requested URL is echoed in Next's router state, so assert on links.
    check('absolute ?from= is refused (no open redirect)', !/href="https?:\/\/evil\.example\.com/.test(evilHtml))
    // With a loading.tsx the shell streams before the page resolves, so
    // notFound()/redirect() can no longer change the HTTP status — they are
    // delivered in-page. Assert on what the browser receives.
    const missing = await get(`/websites/nothing-here-${stamp}.com`)
    const missingHtml = await missing.text()
    check('unknown website renders the not-found page', missing.status === 404 || missingHtml.includes('NEXT_HTTP_ERROR_FALLBACK;404'), `status ${missing.status}`)

    // --- old permalinks -----------------------------------------------------
    const leadId = rowsB.find(r => r.url.includes(alpha))!.id
    const perma = await get(`/leads?lead=${leadId}`)
    const permaHtml = await perma.text()
    const permaTarget = perma.headers.get('location') ?? permaHtml.match(/http-equiv="refresh" content="\d+;url=([^"]+)"/)?.[1] ?? ''
    check('/leads?lead=<id> redirects to the website page', permaTarget.includes(`/websites/${alpha}`), `${perma.status} -> ${permaTarget || 'no redirect'}`)

    // --- advanced search ----------------------------------------------------
    const search = await fetch(`${APP}/api/jobs/search`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `casinoalpha-${stamp}` }),
    })
    const found = (await search.json()) as { rows?: Array<{ id: string; matchReasons?: string[] }> }
    check('advanced search finds batches by a website they produced', (found.rows ?? []).some(r => jobIds.includes(r.id)), JSON.stringify(found).slice(0, 200))

    // --- AI route auth ------------------------------------------------------
    const noAuth = await fetch(`${APP}/api/ai-analysis/run`, { method: 'POST', redirect: 'manual' })
    check('AI route answers its own bearer check (not a /login redirect)', noAuth.status === 401, `status ${noAuth.status} ${noAuth.headers.get('location') ?? ''}`)
    if (CRON) {
      const withAuth = await fetch(`${APP}/api/ai-analysis/run?dry=1`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRON}` },
      })
      const body = (await withAuth.json()) as { skipped?: string }
      check('AI analysis is a no-op while disabled', withAuth.status === 200 && body.skipped === 'ai_analysis_enabled is off', JSON.stringify(body).slice(0, 200))
    }

    const aff = await get('/affiliates')
    check('/affiliates renders', aff.status === 200, `status ${aff.status}`)
  } finally {
    if (jobIds.length > 0) {
      await svc.from('website_appearances').delete().in('scrape_job_id', jobIds)
      await svc.from('google_lead_gen_table').delete().in('scrape_job_id', jobIds)
      await svc.from('scrape_queue').delete().in('id', jobIds)
    }
    await svc.from('website_profiles').delete().in('normalized_domain', domains)
    if (orgId) await svc.from('organizations').delete().eq('id', orgId)
    await svc.from('user_profiles').delete().eq('id', userId)
    await svc.auth.admin.deleteUser(userId)
    console.log('\nCleanup: removed test jobs, rows, appearances, profiles, org, user.')
  }

  console.log(failures === 0 ? '\nALL WEBSITE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('verify-websites crashed:', e)
  process.exit(1)
})
