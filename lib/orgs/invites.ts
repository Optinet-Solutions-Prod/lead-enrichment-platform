import 'server-only'
import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'

export type InviteLookup =
  | { state: 'not_found' }
  | { state: 'used'; orgName: string }
  | { state: 'expired'; orgName: string; email: string }
  | {
      state: 'valid'
      orgId: string
      orgName: string
      email: string
      role: 'admin' | 'member'
    }

/** SHA-256 hex of the raw invite token — matches what create_org_invite stores. */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Resolve an invite token to its org + state. Service-role read (the visitor
 * is often not signed in yet); only ever exposes the invited email + org name,
 * which the link-holder was sent anyway.
 */
export async function lookupInviteByToken(token: string): Promise<InviteLookup> {
  if (!/^[0-9a-f]{48}$/.test(token)) return { state: 'not_found' }

  const svc = createServiceClient()
  const { data } = await svc
    .from('org_invites')
    .select('org_id, email, role, expires_at, accepted_at, organizations ( name )')
    .eq('token_hash', hashInviteToken(token))
    .maybeSingle()
  if (!data) return { state: 'not_found' }

  const orgName =
    (data.organizations as unknown as { name: string } | null)?.name ?? 'an organization'

  if (data.accepted_at) return { state: 'used', orgName }
  if (new Date(data.expires_at) < new Date()) {
    return { state: 'expired', orgName, email: data.email }
  }
  return {
    state: 'valid',
    orgId: data.org_id,
    orgName,
    email: data.email,
    role: data.role as 'admin' | 'member',
  }
}
