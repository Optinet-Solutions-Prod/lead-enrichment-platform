'use server'

import { revalidatePath } from 'next/cache'
import { grantCredits } from '@/lib/credits'
import { getOrgContext } from '@/lib/orgs/context'
import { createServiceClient } from '@/lib/supabase/service'

export type BillingState = { ok?: string; error?: string } | null

/** Platform-admin escape hatch until Stripe checkout lands: top up the
 *  CALLER'S active org by hand. Gated on the global is_admin flag, not org
 *  role — org owners can't mint their own credits. */
export async function grantCreditsAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const ctx = await getOrgContext()
  if (!ctx) return { error: 'No organization — sign in first.' }

  const svc = createServiceClient()
  const { data: isAdmin } = await svc.rpc('is_admin', { p_user_id: ctx.userId })
  if (isAdmin !== true) return { error: 'Only the platform admin can grant credits.' }

  const amount = Number(formData.get('amount'))
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) {
    return { error: 'Amount must be a whole number between 1 and 100,000.' }
  }
  const reason = String(formData.get('reason') ?? '').trim() || 'manual_grant'

  try {
    const balance = await grantCredits(ctx.orgId, amount, reason, { granted_by: ctx.userId })
    revalidatePath('/settings/billing')
    return { ok: `Granted ${amount.toLocaleString()} credits to ${ctx.orgName} — new balance ${balance.toLocaleString()}.` }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
