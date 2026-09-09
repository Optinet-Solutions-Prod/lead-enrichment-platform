import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Org credits. 1 credit ≈ one source-scrape run; Airbnb browser crawls cost
 * more because they spend real Apify compute. Spend/grant go through atomic
 * SECURITY DEFINER functions (service-role only) that keep the ledger and
 * balance in lockstep. Stripe purchasing bolts onto grant_credits later.
 */

export const CREDIT_COSTS = {
  source_run: 1, // one built-in or custom source scrape
  mta_refresh: 1, // full licence-register re-download
  airbnb_start: 5, // Apify browser crawl (~300 listings)
} as const

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
