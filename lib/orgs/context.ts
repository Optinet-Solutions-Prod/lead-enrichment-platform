import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export type OrgRole = 'owner' | 'admin' | 'member'

export type Membership = {
  orgId: string
  orgName: string
  orgSlug: string
  role: OrgRole
}

export type OrgContext = {
  userId: string
  email: string | null
  orgId: string
  orgName: string
  orgSlug: string
  orgRole: OrgRole
  /** Vertical modules enabled for this org (org_settings.enabled_modules) —
   *  drives which nav sections/pages the workspace sees. */
  modules: string[]
  /** All of the user's org memberships (drives the workspace switcher). */
  memberships: Membership[]
}

const ROLE_RANK: Record<OrgRole, number> = { owner: 3, admin: 2, member: 1 }

/**
 * The caller's organization membership, or null when the signed-in user
 * hasn't created/joined an org yet (→ the dashboard layout sends them to
 * /welcome). Reads the membership TABLE (service client) rather than the
 * JWT claim so it's never stale right after a create/join — the JWT
 * org_id claim (stamped by custom_access_token_hook) is for RLS, not for
 * app routing decisions.
 *
 * Single-org v1: a user has at most one membership; we take the earliest.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const svc = createServiceClient()
  const [{ data: rows, error }, { data: profile }] = await Promise.all([
    svc
      .from('org_members')
      .select('org_id, role, joined_at, organizations ( id, name, slug )')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true }),
    svc.from('user_profiles').select('active_org_id').eq('id', user.id).maybeSingle(),
  ])
  if (error || !rows || rows.length === 0) return null

  const memberships: Membership[] = rows
    .map(r => {
      const org = r.organizations as unknown as { id: string; name: string; slug: string } | null
      if (!org) return null
      return { orgId: org.id, orgName: org.name, orgSlug: org.slug, role: r.role as OrgRole }
    })
    .filter((m): m is Membership => m !== null)
  if (memberships.length === 0) return null

  // Active org: the user's explicit choice (when still a member), else the
  // earliest membership — mirrors custom_access_token_hook exactly.
  const activeId = (profile?.active_org_id as string | null) ?? null
  const active = memberships.find(m => m.orgId === activeId) ?? memberships[0]!

  const { data: settings } = await svc
    .from('org_settings')
    .select('enabled_modules')
    .eq('org_id', active.orgId)
    .maybeSingle()
  const modules = (settings?.enabled_modules as string[] | null) ?? ['property']

  return {
    userId: user.id,
    email: user.email ?? null,
    orgId: active.orgId,
    orgName: active.orgName,
    orgSlug: active.orgSlug,
    orgRole: active.role,
    modules,
    memberships,
  }
}

/**
 * Server-action guard: resolve the org context and require at least
 * `minRole`. Returns the context; throws a plain Error (surface the
 * message in the action's error state) when unauthenticated, org-less,
 * or under-privileged.
 */
export async function requireOrgRole(minRole: OrgRole): Promise<OrgContext> {
  const ctx = await getOrgContext()
  if (!ctx) {
    throw new Error('You must belong to an organization to do this.')
  }
  if (ROLE_RANK[ctx.orgRole] < ROLE_RANK[minRole]) {
    throw new Error(
      minRole === 'owner'
        ? 'Only the organization owner can do this.'
        : 'You need organization admin access to do this.',
    )
  }
  return ctx
}
