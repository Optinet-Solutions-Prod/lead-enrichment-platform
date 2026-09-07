import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export type OrgRole = 'owner' | 'admin' | 'member'

export type OrgContext = {
  userId: string
  email: string | null
  orgId: string
  orgName: string
  orgSlug: string
  orgRole: OrgRole
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
  const { data, error } = await svc
    .from('org_members')
    .select('org_id, role, joined_at, organizations ( id, name, slug )')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null

  const org = data.organizations as unknown as {
    id: string
    name: string
    slug: string
  } | null
  if (!org) return null

  return {
    userId: user.id,
    email: user.email ?? null,
    orgId: org.id,
    orgName: org.name,
    orgSlug: org.slug,
    orgRole: data.role as OrgRole,
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
