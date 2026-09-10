import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Billing configuration: the global pricing kill-switch (system_settings),
 * per-org billing mode + display currency, and the credit-pack price list.
 * Prices are PROPOSED numbers awaiting owner sign-off — they render on the
 * billing page but purchases stay disabled until Stripe keys exist.
 */

export type Currency = 'EUR' | 'USD'

export type CreditPack = {
  key: string
  name: string
  credits: number
  eur: number
  usd: number
  perCreditEur: string
  popular?: boolean
  blurb: string
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    key: 'starter',
    name: 'Starter',
    credits: 100,
    eur: 25,
    usd: 29,
    perCreditEur: '0.25',
    blurb: 'A pilot batch: ~100 source runs or a few full collection days.',
  },
  {
    key: 'growth',
    name: 'Growth',
    credits: 500,
    eur: 99,
    usd: 115,
    perCreditEur: '0.20',
    popular: true,
    blurb: 'Weekly workflows across every source with room to spare.',
  },
  {
    key: 'scale',
    name: 'Scale',
    credits: 2000,
    eur: 299,
    usd: 345,
    perCreditEur: '0.15',
    blurb: 'Agency volume — run everything, often, in multiple markets.',
  },
]

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
