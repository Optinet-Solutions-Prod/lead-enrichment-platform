/**
 * Milestone B acceptance check (docs/saas/04-BUILD-PLAN.md §9):
 *   - create_organization → owner membership + org_settings
 *   - custom_access_token_hook stamps org_id / org_role into the JWT
 *   - invite flow end-to-end at the RPC level (create → accept → re-use fails)
 *   - role enforcement (member cannot invite)
 *   - RLS: an org's rows are invisible to other orgs' users
 *
 * Run: npx tsx scripts/orgs/verify-tenancy.ts
 * Creates throwaway users/orgs (tenancy-test-*) and deletes them at the end.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', quiet: true })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!URL || !ANON || !SERVICE) {
  console.error('Missing Supabase env — run from the repo root with .env.local present.')
  process.exit(1)
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

const STAMP = Date.now()
const PASSWORD = `tenancy-check-${STAMP}-Aa1!`
const emailFor = (who: string) => `tenancy-test-${who}-${STAMP}@example.com`

let failures = 0
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function signIn(email: string): Promise<{ token: string; claims: Record<string, unknown> }> {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const body = (await res.json()) as { access_token?: string; error_description?: string; msg?: string }
  if (!body.access_token) {
    throw new Error(`sign-in failed for ${email}: ${body.error_description ?? body.msg ?? res.status}`)
  }
  const payload = JSON.parse(
    Buffer.from(body.access_token.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as Record<string, unknown>
  return { token: body.access_token, claims: payload }
}

async function rpc(token: string, fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

async function select(token: string, table: string, query = 'select=*') {
  const res = await fetch(`${URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  return { ok: res.ok, rows: res.ok ? ((await res.json()) as unknown[]) : [] }
}

async function main() {
  const created: { userIds: string[]; orgIds: string[] } = { userIds: [], orgIds: [] }

  try {
    // -- setup: three confirmed users -------------------------------------
    for (const who of ['a', 'b', 'c']) {
      const { data, error } = await svc.auth.admin.createUser({
        email: emailFor(who),
        password: PASSWORD,
        email_confirm: true,
      })
      if (error || !data.user) throw new Error(`createUser ${who}: ${error?.message}`)
      created.userIds.push(data.user.id)
    }

    // -- A: create org, check hook claims ----------------------------------
    const a1 = await signIn(emailFor('a'))
    check('fresh user has no org_id claim', a1.claims.org_id === undefined)

    const orgARes = await rpc(a1.token, 'create_organization', { p_name: `Tenancy Test A ${STAMP}` })
    check('create_organization succeeds', orgARes.ok, JSON.stringify(orgARes.data))
    const orgA = orgARes.data as string
    if (orgARes.ok) created.orgIds.push(orgA)

    const dupRes = await rpc(a1.token, 'create_organization', { p_name: 'Second Org Attempt' })
    check('single-org guard blocks a second org', !dupRes.ok)

    const a2 = await signIn(emailFor('a'))
    check('JWT carries org_id after joining', a2.claims.org_id === orgA, `got ${a2.claims.org_id}`)
    check('JWT carries org_role=owner', a2.claims.org_role === 'owner', `got ${a2.claims.org_role}`)

    const { data: settingsRow } = await svc
      .from('org_settings')
      .select('enabled_sources')
      .eq('org_id', orgA)
      .maybeSingle()
    check(
      "org_settings row created with sources={google}",
      JSON.stringify(settingsRow?.enabled_sources) === '["google"]',
      JSON.stringify(settingsRow),
    )

    // -- invites ------------------------------------------------------------
    const invRes = await rpc(a2.token, 'create_org_invite', {
      p_email: emailFor('b'),
      p_role: 'member',
    })
    const invRow = Array.isArray(invRes.data) ? (invRes.data[0] as { token?: string }) : null
    check('create_org_invite returns a token', invRes.ok && !!invRow?.token, JSON.stringify(invRes.data))
    const inviteToken = invRow?.token ?? ''

    const b1 = await signIn(emailFor('b'))
    const wrongAccept = await rpc(b1.token, 'accept_org_invite', { p_token: 'deadbeef'.repeat(6) })
    check('bogus invite token is rejected', !wrongAccept.ok)

    const accept = await rpc(b1.token, 'accept_org_invite', { p_token: inviteToken })
    check('accept_org_invite succeeds for invited email', accept.ok && accept.data === orgA, JSON.stringify(accept.data))

    const reuse = await rpc(b1.token, 'accept_org_invite', { p_token: inviteToken })
    check('used invite cannot be re-used', !reuse.ok)

    const b2 = await signIn(emailFor('b'))
    check('invitee JWT carries org_id', b2.claims.org_id === orgA)
    check('invitee JWT carries org_role=member', b2.claims.org_role === 'member')

    const memberInvite = await rpc(b2.token, 'create_org_invite', {
      p_email: 'nobody@example.com',
      p_role: 'member',
    })
    check('member cannot create invites', !memberInvite.ok)

    // -- C: second org + RLS isolation --------------------------------------
    const c1 = await signIn(emailFor('c'))
    const orgCRes = await rpc(c1.token, 'create_organization', { p_name: `Tenancy Test C ${STAMP}` })
    const orgC = orgCRes.data as string
    if (orgCRes.ok) created.orgIds.push(orgC)

    const c2 = await signIn(emailFor('c'))
    const cOrgs = await select(c2.token, 'organizations', 'select=id')
    check(
      'RLS: C sees exactly their own organization',
      cOrgs.rows.length === 1 && (cOrgs.rows[0] as { id: string }).id === orgC,
      JSON.stringify(cOrgs.rows),
    )
    const cMembers = await select(c2.token, 'org_members', 'select=org_id')
    check(
      "RLS: C sees no other org's members",
      cMembers.rows.every(r => (r as { org_id: string }).org_id === orgC) && cMembers.rows.length === 1,
      JSON.stringify(cMembers.rows),
    )
    const cSettings = await select(c2.token, 'org_settings', 'select=org_id')
    check(
      "RLS: C sees only their org_settings",
      cSettings.rows.length === 1 && (cSettings.rows[0] as { org_id: string }).org_id === orgC,
    )

    const aOrgs = await select(a2.token, 'organizations', 'select=id')
    check(
      'RLS: A sees exactly their own organization',
      aOrgs.rows.length === 1 && (aOrgs.rows[0] as { id: string }).id === orgA,
    )
    const aMembers = await select(a2.token, 'org_members', 'select=org_id,role')
    check('RLS: A sees both members of org A (A + B)', aMembers.rows.length === 2, JSON.stringify(aMembers.rows))

    // Anonymous access gets nothing.
    const anonRes = await fetch(`${URL}/rest/v1/organizations?select=id`, { headers: { apikey: ANON } })
    const anonRows = anonRes.ok ? ((await anonRes.json()) as unknown[]) : []
    check('RLS: anonymous sees zero organizations', anonRows.length === 0)
  } finally {
    // -- cleanup -------------------------------------------------------------
    for (const orgId of created.orgIds) {
      await svc.from('organizations').delete().eq('id', orgId)
    }
    for (const userId of created.userIds) {
      await svc.auth.admin.deleteUser(userId)
    }
    console.log(`\nCleanup: removed ${created.orgIds.length} orgs, ${created.userIds.length} users.`)
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('verify-tenancy crashed:', e)
  process.exit(1)
})
