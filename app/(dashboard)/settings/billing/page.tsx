import { Coins, CreditCard } from 'lucide-react'
import { redirect } from 'next/navigation'
import { CREDIT_COSTS, getCreditsBalance, listLedger } from '@/lib/credits'
import { getOrgContext } from '@/lib/orgs/context'
import { createServiceClient } from '@/lib/supabase/service'
import { GrantForm } from './_components/grant-form'

export const dynamic = 'force-dynamic'

const COST_ROWS = [
  { action: 'Source scrape run', detail: 'Any built-in or custom source (per source, per run)', cost: CREDIT_COSTS.source_run },
  { action: 'Licence register refresh', detail: 'Full MTA short-let register re-download', cost: CREDIT_COSTS.mta_refresh },
  { action: 'Airbnb crawl', detail: 'Real-browser crawl on Apify (~300 listings)', cost: CREDIT_COSTS.airbnb_start },
  { action: 'Airbnb cross-match', detail: 'Linking Owner Leads to Airbnb hosts', cost: 0 },
]

export default async function BillingPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/welcome')

  const svc = createServiceClient()
  const [balance, ledger, { data: isAdmin }] = await Promise.all([
    getCreditsBalance(ctx.orgId),
    listLedger(ctx.orgId, 50),
    svc.rpc('is_admin', { p_user_id: ctx.userId }),
  ])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          Billing &amp; Credits
        </h1>
        <p className="mt-1 max-w-2xl text-[12px] text-[color:var(--color-text-secondary)]">
          Data collection runs on credits so costs stay predictable: every scrape debits{' '}
          <strong className="text-[color:var(--color-text-primary)]">{ctx.orgName}</strong>&apos;s
          balance up-front, and the ledger below shows exactly where each credit went.
        </p>
      </header>

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
            <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">credits available</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-md border border-dashed border-[color:var(--color-border)] px-3 py-2">
          <CreditCard className="h-4 w-4 text-[color:var(--color-text-secondary)]" />
          <p className="text-[12px] text-[color:var(--color-text-secondary)]">
            <strong className="text-[color:var(--color-text-primary)]">Buy credits — coming soon.</strong>{' '}
            Card payments via Stripe are being wired up; until then contact us for a top-up.
          </p>
        </div>
      </section>

      {/* Price list */}
      <section>
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">What things cost</h2>
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
                  <td className="px-3 py-2 font-medium text-[color:var(--color-text-primary)]">{r.action}</td>
                  <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">{r.detail}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[color:var(--color-text-primary)]">
                    {r.cost === 0 ? 'free' : r.cost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin === true && <GrantForm orgName={ctx.orgName} />}

      {/* Ledger */}
      <section>
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">Recent activity</h2>
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
