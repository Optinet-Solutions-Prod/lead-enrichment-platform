'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  CREDIT_PACKS,
  getBillingEnabled,
  setBillingEnabled,
  setOrgBillingMode,
  setOrgCurrency,
  type Currency,
} from '@/lib/billing'
import { grantCredits } from '@/lib/credits'
import { notifyOrg } from '@/lib/notifications'
import { getOrgContext } from '@/lib/orgs/context'
import { createPackCheckout, stripeConfigured } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const PAGE = '/settings/billing'

export type BillingState = { ok?: string; error?: string } | null

async function requirePlatformAdmin(): Promise<
  { ctx: NonNullable<Awaited<ReturnType<typeof getOrgContext>>> } | { error: string }
> {
  const ctx = await getOrgContext()
  if (!ctx) return { error: 'No organization — sign in first.' }
  const svc = createServiceClient()
  const { data: isAdmin } = await svc.rpc('is_admin', { p_user_id: ctx.userId })
  if (isAdmin !== true) return { error: 'Only the platform admin can do this.' }
  return { ctx }
}

/** Platform-admin gift: top up ANY org — picked from the dropdown, or found
 *  by a member's email. Gifts are ledgered and announced to the org. */
export async function grantCreditsAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const gate = await requirePlatformAdmin()
  if ('error' in gate) return { error: gate.error }

  const amount = Number(formData.get('amount'))
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) {
    return { error: 'Amount must be a whole number between 1 and 100,000.' }
  }
  const reason = String(formData.get('reason') ?? '').trim() || 'gift'
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  let orgId = String(formData.get('org_id') ?? '').trim()

  const svc = createServiceClient()
  if (email) {
    // Resolve a user by email, then their org membership(s).
    let userId: string | null = null
    for (let page = 1; page <= 5 && !userId; page++) {
      const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 })
      if (error) return { error: error.message }
      userId = data.users.find(u => u.email?.toLowerCase() === email)?.id ?? null
      if (data.users.length < 200) break
    }
    if (!userId) return { error: `No user found with email ${email}.` }
    const { data: memberships } = await svc
      .from('org_members')
      .select('org_id, organizations ( name )')
      .eq('user_id', userId)
    const rows = (memberships ?? []) as unknown as Array<{
      org_id: string
      organizations: { name: string } | null
    }>
    if (rows.length === 0) return { error: `${email} has no organization yet.` }
    if (rows.length > 1) {
      const names = rows.map(r => r.organizations?.name ?? r.org_id).join(', ')
      return { error: `${email} belongs to several orgs (${names}) — pick the org in the dropdown instead.` }
    }
    orgId = rows[0]!.org_id
  }
  if (!orgId) return { error: 'Pick an organization or enter a member email.' }

  const { data: org } = await svc.from('organizations').select('name').eq('id', orgId).maybeSingle()
  if (!org) return { error: 'Organization not found.' }

  try {
    const balance = await grantCredits(orgId, amount, reason, { granted_by: gate.ctx.userId })
    await notifyOrg(orgId, {
      kind: 'gift',
      title: `You received ${amount.toLocaleString()} gift credits 🎁`,
      body: `New balance: ${balance.toLocaleString()} credits.`,
      href: '/settings/billing',
    })
    revalidatePath(PAGE)
    return { ok: `Granted ${amount.toLocaleString()} credits to ${org.name} — new balance ${balance.toLocaleString()}.` }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** Send an org admin to Stripe's hosted checkout for one pack. Amounts come
 *  from CREDIT_PACKS server-side — the client only names a pack + currency. */
export async function startCheckoutAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext()
  if (!ctx || (ctx.orgRole !== 'owner' && ctx.orgRole !== 'admin')) return
  if (!stripeConfigured() || !(await getBillingEnabled())) return

  const pack = CREDIT_PACKS.find(p => p.key === String(formData.get('pack')))
  const currency: Currency = String(formData.get('currency')) === 'USD' ? 'USD' : 'EUR'
  if (!pack) return

  let url: string
  try {
    url = await createPackCheckout({
      orgId: ctx.orgId,
      orgName: ctx.orgName,
      pack,
      currency,
      userEmail: ctx.email,
    })
  } catch {
    redirect(`${PAGE}?purchase=error`)
  }
  redirect(url)
}

/** Org owner/admin redeems a voucher code into their active org. */
export async function redeemVoucherAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const ctx = await getOrgContext()
  if (!ctx) return { error: 'No organization — sign in first.' }
  const code = String(formData.get('code') ?? '').trim().toUpperCase()
  if (!code) return { error: 'Enter a code.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('redeem_voucher', { p_code: code })
  if (error) return { error: error.message }

  await notifyOrg(ctx.orgId, {
    kind: 'voucher',
    title: `Voucher ${code} redeemed`,
    body: `New balance: ${Number(data).toLocaleString()} credits.`,
    href: '/settings/billing',
  })
  revalidatePath(PAGE)
  return { ok: `Code accepted — new balance ${Number(data).toLocaleString()} credits.` }
}

/** Org admin: preferred display currency for the packs. */
export async function setCurrencyAction(currency: Currency): Promise<void> {
  const ctx = await getOrgContext()
  if (!ctx || (ctx.orgRole !== 'owner' && ctx.orgRole !== 'admin')) return
  if (currency !== 'EUR' && currency !== 'USD') return
  await setOrgCurrency(ctx.orgId, currency)
  revalidatePath(PAGE)
}

/** Platform admin: the global pricing kill-switch. */
export async function setBillingEnabledAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const gate = await requirePlatformAdmin()
  if ('error' in gate) return { error: gate.error }
  const on = String(formData.get('enabled')) === 'true'
  const err = await setBillingEnabled(on, gate.ctx.userId)
  if (err) return { error: err }
  revalidatePath('/', 'layout')
  return { ok: on ? 'Billing is ON — prices and debits are live.' : 'Billing is OFF — prices hidden, nothing is charged.' }
}

/** Platform admin: put any org on unlimited (no debits) or back on credits. */
export async function setOrgBillingModeAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const gate = await requirePlatformAdmin()
  if ('error' in gate) return { error: gate.error }
  const orgId = String(formData.get('org_id') ?? '')
  const mode = String(formData.get('mode') ?? '')
  if (!orgId || (mode !== 'credits' && mode !== 'unlimited')) return { error: 'Pick an org and a mode.' }
  const err = await setOrgBillingMode(orgId, mode)
  if (err) return { error: err }
  revalidatePath(PAGE)
  return { ok: mode === 'unlimited' ? 'Org set to unlimited — runs no longer debit credits.' : 'Org back on credits.' }
}

/** Platform admin: mint a voucher code (auto-generated when left blank). */
export async function createVoucherAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const gate = await requirePlatformAdmin()
  if ('error' in gate) return { error: gate.error }

  let code = String(formData.get('code') ?? '').trim().toUpperCase().replace(/\s+/g, '-')
  if (!code) {
    const rand = Array.from({ length: 6 }, () =>
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32)),
    ).join('')
    code = `LEAD-${rand}`
  }
  if (!/^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/.test(code)) {
    return { error: 'Code must be 4–32 characters: letters, numbers, dashes.' }
  }
  const credits = Number(formData.get('credits'))
  if (!Number.isInteger(credits) || credits < 1 || credits > 100_000) {
    return { error: 'Credits must be a whole number between 1 and 100,000.' }
  }
  const maxRedemptions = Math.max(1, Number(formData.get('max_redemptions')) || 1)
  const expiresDays = Number(formData.get('expires_days')) || 0

  const svc = createServiceClient()
  const { error } = await svc.from('credit_vouchers').insert({
    code,
    credits,
    max_redemptions: maxRedemptions,
    expires_at: expiresDays > 0 ? new Date(Date.now() + expiresDays * 86_400_000).toISOString() : null,
    created_by: gate.ctx.userId,
  })
  if (error) {
    return { error: error.code === '23505' ? `Code ${code} already exists.` : error.message }
  }
  revalidatePath(PAGE)
  return { ok: `Voucher ${code} created — ${credits.toLocaleString()} credits × ${maxRedemptions} redemption(s).` }
}

export async function deleteVoucherAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const gate = await requirePlatformAdmin()
  if ('error' in gate) return { error: gate.error }
  const code = String(formData.get('code') ?? '')
  const svc = createServiceClient()
  const { error } = await svc.from('credit_vouchers').delete().eq('code', code)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { ok: `Voucher ${code} deleted.` }
}
