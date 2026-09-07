'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type CreateOrgState = { error: string } | null

export async function createOrganizationAction(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2) {
    return { error: 'Organization name must be at least 2 characters.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?from=/welcome')

  const { error } = await supabase.rpc('create_organization', { p_name: name })
  if (error) return { error: error.message }

  // Refresh so the new JWT carries the org_id / org_role claims.
  await supabase.auth.refreshSession()
  redirect('/property-scrape')
}
