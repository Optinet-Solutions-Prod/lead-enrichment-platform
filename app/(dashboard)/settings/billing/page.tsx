import { Coins, Infinity as InfinityIcon } from 'lucide-react'
import { redirect } from 'next/navigation'
import { CREDIT_PACKS, getBillingEnabled, getOrgBilling } from '@/lib/billing'
import { CREDIT_COSTS, getCreditsBalance, listLedger } from '@/lib/credits'
import { getOrgContext } from '@/lib/orgs/context'
import { stripeConfigured } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { AdminPanel, type OrgOption, type VoucherView } from './_components/admin-panel'
import { PacksPanel } from './_components/packs-panel'
import { RedeemVoucher } from './_components/redeem-voucher'

export const dynamic = 'force-dynamic'

const COST_ROWS = [
  { action: 'Source scrape run', detail: 'Any built-in or custom source (per source, per run)', cost: String(CREDIT_COSTS.source_run) },
  { action: 'Licence register refresh', detail: 'Full MTA short-let register re-download', cost: String(CREDIT_COSTS.mta_refresh) },
  { action: 'Airbnb crawl (your Apify key)', detail: 'Real-browser crawl billed to YOUR Apify account', cost: String(CREDIT_COSTS.airbnb_start_byo) },
  { action: 'Airbnb crawl (platform key)', detail: 'Same crawl on our Apify account (~$1 of compute)', cost: String(CREDIT_COSTS.airbnb_start_platform) },
  { action: 'Airbnb cross-match', detail: 'Linking Owner Leads to Airbnb hosts', cost: 'free' },
]

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/welcome')
  const canManage = ctx.orgRole === 'owner' || ctx.orgRole === 'admin'
  const purchase = (await searchParams).purchase

  const svc = createServiceClient()
  const [balance, ledger, billingEnabled, orgBilling, { data: isAdmin }] = await Promise.all([
    getCreditsBalance(ctx.orgId),
    listLedger(ctx.orgId, 50),
    getBillingEnabled(),
    getOrgBilling(ctx.orgId),
    svc.rpc('is_admin', { p_user_id: ctx.userId }),
  ])

  // Admin extras: all orgs (for gifting / mode) + the voucher list.
  let adminOrgs: OrgOption[] = []
  let vouchers: VoucherView[] = []
  if (isAdmin === true) {
    const [{ data: orgRows }, { data: voucherRows }] = await Promise.all([
      svc.from('organizations').select('id, name, org_settings ( billing_mode )').order('name'),
      svc
        .from('credit_vouchers')
        .select('code, credits, max_redemptions, redeemed_count, expires_at')
        .order('created_at', { ascending: false }),
    ])
    adminOrgs = ((orgRows ?? []) as Array<{
      id: string
      name: string
      org_settings: { billing_mode: string } | { billing_mode: string }[] | null
    }>).map(o => {
      const s = Array.isArray(o.org_settings) ? o.org_settings[0] : o.org_settings
      return { id: o.id, name: o.name, mode: s?.billing_mode ?? 'credits' }
    })
    vouchers = (voucherRows ?? []) as VoucherView[]
  }

  const unlimited = orgBilling.mode === 'unlimited'
  const showMoney = billingEnabled && !unlimited

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          Billing &amp; Credits
        </h1>
        <p className="mt-1 max-w-2xl text-[12px] text-[color:var(--color-text-secondary)]">
          Data collection runs on credits so costs stay predictable: every scrape debits{' '}
          <strong className="text-[color:var(--color-text-primary)]">{ctx.orgName}</strong>&apos;s
          balance up-front, and the ledger shows exactly where each credit went.
        </p>
      </header>

      {purchase === 'success' && (
        <p className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-[13px] text-green-800">
          Payment received — your credits are added within a few seconds. Refresh if the
          balance hasn&apos;t moved yet.
        </p>
      )}
      {purchase === 'cancelled' && (
        <p className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] px-4 py-3 text-[13px] text-[color:var(--color-text-secondary)]">
          Checkout cancelled — nothing was charged.
        </p>
      )}
      {purchase === 'error' && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          Checkout could not be started — try again in a minute or contact us.
        </p>
      )}

      {!billingEnabled && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Billing is currently <strong>disabled platform-wide</strong> — nothing is charged and
          prices are hidden. Scrapes and workflows run freely.
        </p>
      )}

      {billingEnabled && unlimited && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
          <InfinityIcon className="h-4 w-4 shrink-0" />
          This organization is on an <strong>unlimited plan</strong> — runs don&apos;t use credits.
        </p>
      )}

      {showMoney && (
        <>
          {/* Balance */}
          <section className="flex flex-wrap items-center gap-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--color-bg-secondary)]">
                <Coins className="h-5 w-5 text-[color:var(--color-text-primary)]" />
              </span>
              <div>
                <p className="text-[22px] font-semibold tabular-nums leading-none text-[color:var(--color-text-primary)]">
                  {balance.toLocaleString()}
                </p>
                <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
                  credits available
                </p>
              </div>
            </div>
          </section>

          <PacksPanel
            packs={CREDIT_PACKS.map(p => ({ ...p }))}
            initialCurrency={orgBilling.currency}
            canSetCurrency={canManage}
            purchasable={stripeConfigured() && canManage}
          />

          <RedeemVoucher canRedeem={canManage} />

          {/* Price list */}
          <section>
            <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
              What things cost
            </h2>
            <div className="mt-2 overflow-x-auto rounded-lg border border-[color:var(--color-border)]">
              <table className="w-full min-w-[480px] text-left text-[12px]">
                <thead className="bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-secondary)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">What it does</th>
                    <th className="px-3 py-2 text-right font-medium">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {COST_ROWS.map(r => (
                    <tr key={r.action} className="bg-[color:var(--color-bg-primary)]">
                      <td className="px-3 py-2 font-medium text-[color:var(--color-text-primary)]">
                        {r.action}
                      </td>
                      <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">{r.detail}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[color:var(--color-text-primary)]">
                        {r.cost}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {isAdmin === true && (
        <AdminPanel billingEnabled={billingEnabled} orgs={adminOrgs} vouchers={vouchers} />
      )}

      {/* Ledger — always visible: it's the audit trail even when billing is off */}
      <section>
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
          Recent activity
        </h2>
        {ledger.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-[color:var(--color-border)] p-4 text-[13px] text-[color:var(--color-text-secondary)]">
            Nothing yet — run a scrape on Collect Data or a Workflow and the debit shows up here.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-[color:var(--color-border)]">
            <table className="w-full min-w-[480px] text-left text-[12px]">
              <thead className="bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-secondary)]">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 text-right font-medium">Change</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {ledger.map(row => (
                  <tr key={row.id} className="bg-[color:var(--color-bg-primary)]">
                    <td className="whitespace-nowrap px-3 py-2 text-[color:var(--color-text-secondary)]">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-[color:var(--color-text-primary)]">{row.reason}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        row.delta < 0 ? 'text-red-700' : 'text-green-700'
                      }`}
                    >
                      {row.delta > 0 ? `+${row.delta.toLocaleString()}` : row.delta.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[color:var(--color-text-primary)]">
                      {row.balance_after.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
