'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrgRole } from '@/lib/orgs/context'

const PAGE = '/settings/organization'

export type ActionState = { error?: string; ok?: string } | null
export type InviteState = { error?: string; link?: string; email?: string } | null

/** The org RPCs are SECURITY DEFINER and trust auth.uid(), so they must run
 *  on the user's session client — never the service client. */

export async function renameOrgAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireOrgRole('admin')
  } catch (e) {
    return { error: (e as Error).message }
  }
  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2) return { error: 'Name must be at least 2 characters.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('rename_organization', { p_name: name })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { ok: 'Renamed.' }
}

export async function createInviteAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  try {
    await requireOrgRole('admin')
  } catch (e) {
    return { error: (e as Error).message }
  }
  const email = String(formData.get('email') ?? '').trim()
  const role = String(formData.get('role') ?? 'member')
  if (!email.includes('@')) return { error: 'Enter a valid email address.' }
  if (role !== 'member' && role !== 'admin') return { error: 'Pick a valid role.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_org_invite', {
    p_email: email,
    p_role: role,
  })
  if (error) return { error: error.message }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.token) return { error: 'Invite was created but no token came back — try again.' }

  // Absolute link when the canonical URL is configured; path-only otherwise
  // (still copy-pasteable next to the current origin).
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const link = `${base}/invite/${row.token}`

  revalidatePath(PAGE)
  return { link, email }
}

export async function revokeInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireOrgRole('admin')
  } catch (e) {
    return { error: (e as Error).message }
  }
  const id = String(formData.get('invite_id') ?? '')
  if (!id) return { error: 'Missing invite id.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_org_invite', { p_invite_id: id })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { ok: 'Invite revoked.' }
}

export async function removeMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireOrgRole('admin')
  } catch (e) {
    return { error: (e as Error).message }
  }
  const userId = String(formData.get('user_id') ?? '')
  if (!userId) return { error: 'Missing user id.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_org_member', { p_user_id: userId })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { ok: 'Member removed.' }
}

export async function setMemberRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    // The RPC itself requires OWNER; this is just the fast-fail.
    await requireOrgRole('admin')
  } catch (e) {
    return { error: (e as Error).message }
  }
  const userId = String(formData.get('user_id') ?? '')
  const role = String(formData.get('role') ?? '')
  if (!userId) return { error: 'Missing user id.' }
  if (role !== 'member' && role !== 'admin') return { error: 'Pick a valid role.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_org_member_role', {
    p_user_id: userId,
    p_role: role,
  })
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { ok: 'Role updated.' }
}
