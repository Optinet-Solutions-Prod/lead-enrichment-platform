import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Billing configuration: the global pricing kill-switch (system_settings),
 * per-org billing mode + display currency, and the credit-pack price list.
 * Prices are PROPOSED numbers awaiting owner sign-off — they render on the
 * billing page but purchases stay disabled until Stripe keys exist.
 */

export type { Currency, CreditPack } from './pricing'
export { CREDIT_PACKS } from './pricing'
import type { Currency, CreditPack } from './pricing'

export function formatPackPrice(pack: CreditPack, currency: Currency): string {
  return currency === 'EUR' ? `€${pack.eur}` : `$${pack.usd}`
}

/** Global pricing kill-switch. When false the UI hides every price, balance
 *  and top-up surface, and runs stop debiting — "billing pending" as a
 *  toggle. Missing row counts as OFF (safe default for fresh environments). */
export async function getBillingEnabled(): Promise<boolean> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('system_settings')
    .select('value')
    .eq('key', 'billing_enabled')
    .maybeSingle()
  return data?.value === true
}

export async function setBillingEnabled(on: boolean, byUserId: string): Promise<string | null> {
  const svc = createServiceClient()
  const { error } = await svc.from('system_settings').upsert({
    key: 'billing_enabled',
    value: on,
    updated_at: new Date().toISOString(),
    updated_by: byUserId,
  })
  return error ? error.message : null
}

export type OrgBilling = { mode: 'credits' | 'unlimited'; currency: Currency }

export async function getOrgBilling(orgId: string): Promise<OrgBilling> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('org_settings')
    .select('billing_mode, currency')
    .eq('org_id', orgId)
    .maybeSingle()
  return {
    mode: data?.billing_mode === 'unlimited' ? 'unlimited' : 'credits',
    currency: data?.currency === 'USD' ? 'USD' : 'EUR',
  }
}

export async function setOrgCurrency(orgId: string, currency: Currency): Promise<string | null> {
  const svc = createServiceClient()
  const { error } = await svc.from('org_settings').update({ currency }).eq('org_id', orgId)
  return error ? error.message : null
}

export async function setOrgBillingMode(
  orgId: string,
  mode: 'credits' | 'unlimited',
): Promise<string | null> {
  const svc = createServiceClient()
  const { error } = await svc.from('org_settings').update({ billing_mode: mode }).eq('org_id', orgId)
  return error ? error.message : null
}
