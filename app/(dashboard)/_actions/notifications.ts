'use server'

import { revalidatePath } from 'next/cache'
import { markAllRead } from '@/lib/notifications'
import { createClient } from '@/lib/supabase/server'

export async function markAllReadAction(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await markAllRead(user.id)
  revalidatePath('/', 'layout')
}
