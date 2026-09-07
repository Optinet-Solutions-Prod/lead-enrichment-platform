/**
 * Authenticated page smoke test (Milestone A/B acceptance): creates a
 * throwaway user + org, signs in, replays the @supabase/ssr session cookie
 * against a running server (default http://localhost:3000), and asserts
 * every dashboard page returns 200. Cleans up after itself.
 *
 * Run: npx tsx scripts/orgs/smoke-pages.ts
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', quiet: true })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP = process.env.SMOKE_APP_URL ?? 'http://localhost:3000'

const PROJECT_REF = new globalThis.URL(URL).hostname.split('.')[0]
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

const PAGES = [
  '/',
  '/property-scrape',
  '/property-leads',
  '/property-leads?q=malta&sort=owner_name&order=desc&f=contact_type%3Ais%3Aowner',
  '/pm-prospects',
  '/pm-prospects?q=ma&sort=listings_count&order=asc&f=purest%3Aistrue',
  '/airbnb-listings',
  '/airbnb-listings?q=sea&sort=host_name&order=asc&page=2',
  '/hfps-register',
  '/hfps-register?q=triq&f=island%3Ais%3AGozo&sort=town&order=desc&page=2',
  '/scrape',
  '/leads',
  '/activity',
  '/profiles',
  '/onboarding',
  '/help',
  '/settings/organization',
  '/account/password',
  '/admin/interactive',
  '/admin/google-login',
]

async function main() {
  const stamp = Date.now()
  const email = `smoke-test-${stamp}@example.com`
  const password = `smoke-check-${stamp}-Aa1!`

  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !created.user) throw new Error(`createUser: ${createErr?.message}`)
  const userId = created.user.id
  let orgId: string | null = null
  let failures = 0

  try {
    const tokenRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const session = (await tokenRes.json()) as { access_token?: string }
    if (!session.access_token) throw new Error('sign-in failed')

    // Org membership (dashboard layout redirects org-less users to /welcome).
    const orgRes = await fetch(`${URL}/rest/v1/rpc/create_organization`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_name: `Smoke Org ${stamp}` }),
    })
    orgId = (await orgRes.json()) as string
    if (!orgRes.ok) throw new Error(`create_organization: ${JSON.stringify(orgId)}`)

    // Re-sign-in so the cookie's JWT carries the org claims.
    const token2Res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const session2 = (await token2Res.json()) as Record<string, unknown>

    // @supabase/ssr cookie: sb-<ref>-auth-token = "base64-" + base64url(JSON),
    // chunked as .0/.1/... when longer than ~3180 chars.
    const raw = 'base64-' + Buffer.from(JSON.stringify(session2)).toString('base64url')
    const CHUNK = 3180
    const cookies: string[] = []
    if (raw.length <= CHUNK) {
      cookies.push(`sb-${PROJECT_REF}-auth-token=${raw}`)
    } else {
      for (let i = 0; i * CHUNK < raw.length; i++) {
        cookies.push(`sb-${PROJECT_REF}-auth-token.${i}=${raw.slice(i * CHUNK, (i + 1) * CHUNK)}`)
      }
    }
    const cookieHeader = cookies.join('; ')

    for (const page of PAGES) {
      const res = await fetch(`${APP}${page}`, {
        headers: { Cookie: cookieHeader },
        redirect: 'manual',
      })
      const ok = res.status === 200
      if (!ok) failures++
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${res.status}  ${page}${!ok ? `  (location: ${res.headers.get('location') ?? '—'})` : ''}`)
    }
  } finally {
    if (orgId) await svc.from('organizations').delete().eq('id', orgId)
    await svc.auth.admin.deleteUser(userId)
    console.log('\nCleanup: removed smoke user + org.')
  }

  console.log(failures === 0 ? '\nALL PAGES OK' : `\n${failures} PAGE(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('smoke-pages crashed:', e)
  process.exit(1)
})
