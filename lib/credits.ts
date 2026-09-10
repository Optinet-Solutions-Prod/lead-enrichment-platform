import 'server-only'
import { getBillingEnabled, getOrgBilling } from '@/lib/billing'
import { notifyOrg } from '@/lib/notifications'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Org credits. 1 credit ≈ one source-scrape run; Airbnb browser crawls cost
 * more because they spend real Apify compute — and 3× more again on the
 * PLATFORM Apify key (our bill) than on an org's own connected key (their
 * bill). Spend/grant go through atomic SECURITY DEFINER functions
 * (service-role only) that keep the ledger and balance in lockstep. Stripe
 * purchasing bolts onto grant_credits later.
 */

export const CREDIT_COSTS = {
  source_run: 1, // one built-in or custom source scrape
  mta_refresh: 1, // full licence-register re-download
  airbnb_start_byo: 5, // Apify crawl on the org's OWN connected key
  airbnb_start_platform: 15, // Apify crawl on the platform key (covers ~$1 compute)
} as const

/** Balance under this after a spend triggers the low-credits notification. */
const LOW_BALANCE_THRESHOLD = 20

export async function getCreditsBalance(orgId: string): Promise<number> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('org_settings')
    .select('credits_balance')
    .eq('org_id', orgId)
    .maybeSingle()
  return (data?.credits_balance as number | undefined) ?? 0
}

/** Atomically spend credits. Returns the new balance, or null when the org
 *  can't afford it (nothing is deducted). */
export async function spendCredits(
  orgId: string,
  amount: number,
  reason: string,
  meta?: Record<string, unknown>,
): Promise<number | null> {
  if (amount <= 0) return getCreditsBalance(orgId)
  const svc = createServiceClient()
  const { data, error } = await svc.rpc('spend_credits', {
    p_org: orgId,
    p_amount: amount,
    p_reason: reason,
    p_meta: meta ?? null,
  })
  if (error) throw new Error(`credits: ${error.message}`)
  return data === -1 ? null : (data as number)
}

export type ChargeResult =
  | { charged: true; balance: number }
  | { charged: false } // billing disabled globally, org is unlimited, or amount 0
  | { insufficient: true; balance: number; needed: number }

/** The one entry point actions should use: respects the global billing
 *  kill-switch and per-org unlimited mode, debits atomically otherwise, and
 *  fires the low-balance notification when a spend crosses the threshold. */
export async function chargeCredits(
  orgId: string,
  amount: number,
  reason: string,
  meta?: Record<string, unknown>,
): Promise<ChargeResult> {
  if (amount <= 0) return { charged: false }
  const [enabled, orgBilling] = await Promise.all([getBillingEnabled(), getOrgBilling(orgId)])
  if (!enabled || orgBilling.mode === 'unlimited') return { charged: false }

  const balance = await spendCredits(orgId, amount, reason, meta)
  if (balance === null) {
    return { insufficient: true, balance: await getCreditsBalance(orgId), needed: amount }
  }
  if (balance < LOW_BALANCE_THRESHOLD && balance + amount >= LOW_BALANCE_THRESHOLD) {
    await notifyOrg(orgId, {
      kind: 'low_credits',
      title: `Credits are running low — ${balance} left`,
      body: 'Top up so scrapes and workflows keep running.',
      href: '/settings/billing',
    })
  }
  return { charged: true, balance }
}

export async function grantCredits(
  orgId: string,
  amount: number,
  reason: string,
  meta?: Record<string, unknown>,
): Promise<number> {
  const svc = createServiceClient()
  const { data, error } = await svc.rpc('grant_credits', {
    p_org: orgId,
    p_amount: amount,
    p_reason: reason,
    p_meta: meta ?? null,
  })
  if (error) throw new Error(`credits: ${error.message}`)
  return data as number
}

export type LedgerRow = {
  id: number
  delta: number
  balance_after: number
  reason: string
  created_at: string
}

export async function listLedger(orgId: string, limit = 50): Promise<LedgerRow[]> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('org_credit_ledger')
    .select('id, delta, balance_after, reason, created_at')
    .eq('org_id', orgId)
    .order('id', { ascending: false })
    .limit(limit)
  return (data ?? []) as LedgerRow[]
}
