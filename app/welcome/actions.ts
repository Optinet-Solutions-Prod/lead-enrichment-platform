'use server'

import { PROPERTY_MODULE_ENABLED } from '@/lib/modules'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { notifyUser } from '@/lib/notifications'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export type CreateOrgState = { error: string } | null

export async function createOrganizationAction(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2) {
    return { error: 'Organization name must be at least 2 characters.' }
  }
  const vertical = String(formData.get('vertical') ?? 'affiliate')
  const modules = vertical === 'property' && PROPERTY_MODULE_ENABLED ? ['property'] : ['affiliate']

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?from=/welcome')

  const { data: orgId, error } = await supabase.rpc('create_organization', { p_name: name })
  if (error) return { error: error.message }

  // The vertical choice drives which nav/pages the workspace sees.
  const svc = createServiceClient()
  await svc.from('org_settings').update({ enabled_modules: modules }).eq('org_id', orgId as string)

  await notifyUser(orgId as string, user.id, {
    kind: 'welcome',
    title: 'Welcome! Your workspace starts with 100 free credits',
    body: 'Enough for a full pilot batch — run your first scrape to see it in action.',
    href: modules.includes('property') ? '/property-scrape' : '/scrape',
  })

  // Refresh so the new JWT carries the org_id / org_role claims.
  await supabase.auth.refreshSession()
  revalidatePath('/', 'layout')
  redirect(modules.includes('property') ? '/property-scrape' : '/scrape')
}
