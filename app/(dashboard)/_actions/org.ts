'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/orgs/context'

/** Switch the caller's active workspace. The RPC validates membership; the
 *  session refresh re-mints the JWT so org_id/org_role claims follow. Lands
 *  on the new workspace's natural home page (module-dependent). */
export async function switchOrgAction(formData: FormData): Promise<void> {
  const orgId = String(formData.get('org_id') ?? '').trim()
  if (!orgId) return

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_active_org', { p_org_id: orgId })
  if (error) return // not a member / not signed in — nav simply stays put

  await supabase.auth.refreshSession()

  const ctx = await getOrgContext()
  const home = ctx?.modules.includes('property')
    ? '/property-scrape'
    : ctx?.modules.includes('affiliate')
      ? '/scrape'
      : '/settings/organization'
  redirect(home)
}
