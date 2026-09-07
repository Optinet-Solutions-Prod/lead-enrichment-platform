'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AcceptInviteState = { error: string } | null

/** Join the org behind the invite as the currently signed-in user. The RPC
 *  re-validates everything server-side (token, expiry, email match). */
export async function acceptInviteAction(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get('token') ?? '').trim()
  if (!token) return { error: 'Missing invite token.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?from=/invite/${token}`)

  const { error } = await supabase.rpc('accept_org_invite', { p_token: token })
  if (error) return { error: error.message }

  // Refresh so the new JWT carries the org_id / org_role claims.
  await supabase.auth.refreshSession()
  redirect('/property-scrape')
}
