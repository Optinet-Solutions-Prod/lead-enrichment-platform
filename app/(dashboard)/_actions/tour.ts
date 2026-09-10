'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/** Persist tour progress on the profile (DB, not localStorage — survives
 *  devices; bump the version in the controller to re-offer after big UI
 *  changes). */
export async function saveTourStateAction(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const completed = String(formData.get('status')) === 'completed'
  const version = Number(formData.get('version')) || 1
  const state = {
    version,
    ...(completed
      ? { completedAt: new Date().toISOString() }
      : { skippedAt: new Date().toISOString() }),
  }
  const svc = createServiceClient()
  await svc.from('user_profiles').update({ tour_state: state }).eq('id', user.id)
}
