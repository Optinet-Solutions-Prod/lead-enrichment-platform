'use client'

import { useActionState } from 'react'
import { Gift, Loader2, Power, TicketPercent, Trash2 } from 'lucide-react'
import {
  createVoucherAction,
  deleteVoucherAction,
  grantCreditsAction,
  setBillingEnabledAction,
  setOrgBillingModeAction,
  type BillingState,
} from '../actions'

const initialState: BillingState = null

export type OrgOption = { id: string; name: string; mode: string }
export type VoucherView = {
  code: string
  credits: number
  max_redemptions: number
  redeemed_count: number
  expires_at: string | null
}

type Props = {
  billingEnabled: boolean
  orgs: OrgOption[]
  vouchers: VoucherView[]
}

const inputCls =
  'min-h-11 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none'
const labelCls = 'flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]'
const buttonCls =
  'inline-flex min-h-11 items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50'

function Feedback({ state }: { state: BillingState }) {
  if (!state) return null
  return (
    <>
      {state.ok && (
        <p className="mt-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800">
          {state.ok}
        </p>
      )}
      {state.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{state.error}</p>
      )}
    </>
  )
}

export function AdminPanel({ billingEnabled, orgs, vouchers }: Props) {
  const [switchState, switchAction, switchPending] = useActionState(setBillingEnabledAction, initialState)
  const [giftState, giftAction, giftPending] = useActionState(grantCreditsAction, initialState)
  const [modeState, modeAction, modePending] = useActionState(setOrgBillingModeAction, initialState)
  const [voucherState, voucherAction, voucherPending] = useActionState(createVoucherAction, initialState)
  const [delState, delAction, delPending] = useActionState(deleteVoucherAction, initialState)

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
      <div>
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
          Platform admin
        </h2>
        <p className="mt-0.5 text-[12px] text-[color:var(--color-text-secondary)]">
          Only you see this section.
        </p>
      </div>

      {/* Global kill-switch */}
      <div>
        <h3 className="text-[13px] font-medium text-[color:var(--color-text-primary)]">Pricing</h3>
        <form action={switchAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="enabled" value={billingEnabled ? 'false' : 'true'} />
          <button type="submit" disabled={switchPending} className={buttonCls}>
            {switchPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
            {billingEnabled ? 'Disable pricing platform-wide' : 'Enable pricing platform-wide'}
          </button>
          <span className="text-[12px] text-[color:var(--color-text-secondary)]">
            {billingEnabled
              ? 'ON — prices show and runs debit credits.'
              : 'OFF — every price/balance is hidden and nothing is charged.'}
          </span>
        </form>
        <Feedback state={switchState} />
      </div>

      {/* Gift credits */}
      <div>
        <h3 className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
          Gift credits
        </h3>
        <form action={giftAction} className="mt-2 flex flex-wrap items-end gap-2">
          <label className={labelCls}>
            Organization
            <select name="org_id" defaultValue="" className={inputCls}>
              <option value="">— pick an org —</option>
              {orgs.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            …or find by member email
            <input type="email" name="email" placeholder="user@company.com" className={`${inputCls} w-56`} />
          </label>
          <label className={labelCls}>
            Amount
            <input type="number" name="amount" min={1} max={100000} defaultValue={250} required className={`${inputCls} w-28`} />
          </label>
          <label className={labelCls}>
            Reason
            <input type="text" name="reason" placeholder="gift" maxLength={80} className={`${inputCls} w-40`} />
          </label>
          <button type="submit" disabled={giftPending} className={buttonCls}>
            {giftPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
            Gift
          </button>
        </form>
        <Feedback state={giftState} />
      </div>

      {/* Per-org billing mode */}
      <div>
        <h3 className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
          Per-org billing mode
        </h3>
        <form action={modeAction} className="mt-2 flex flex-wrap items-end gap-2">
          <label className={labelCls}>
            Organization
            <select name="org_id" required defaultValue="" className={inputCls}>
              <option value="">— pick an org —</option>
              {orgs.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.mode})
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Mode
            <select name="mode" defaultValue="credits" className={inputCls}>
              <option value="credits">credits (normal)</option>
              <option value="unlimited">unlimited (no debits)</option>
            </select>
          </label>
          <button type="submit" disabled={modePending} className={buttonCls}>
            {modePending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Apply
          </button>
        </form>
        <Feedback state={modeState} />
      </div>

      {/* Vouchers */}
      <div>
        <h3 className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
          Voucher codes
        </h3>
        <form action={voucherAction} className="mt-2 flex flex-wrap items-end gap-2">
          <label className={labelCls}>
            Code (blank = auto)
            <input type="text" name="code" placeholder="LAUNCH-2026" className={`${inputCls} w-40 uppercase`} />
          </label>
          <label className={labelCls}>
            Credits
            <input type="number" name="credits" min={1} max={100000} defaultValue={100} required className={`${inputCls} w-28`} />
          </label>
          <label className={labelCls}>
            Max uses
            <input type="number" name="max_redemptions" min={1} defaultValue={1} className={`${inputCls} w-24`} />
          </label>
          <label className={labelCls}>
            Expires (days, 0 = never)
            <input type="number" name="expires_days" min={0} defaultValue={30} className={`${inputCls} w-28`} />
          </label>
          <button type="submit" disabled={voucherPending} className={buttonCls}>
            {voucherPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TicketPercent className="h-3.5 w-3.5" />}
            Create
          </button>
        </form>
        <Feedback state={voucherState} />
        {vouchers.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {vouchers.map(v => (
              <li
                key={v.code}
                className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--color-border)] px-3 py-2 text-[12px]"
              >
                <code className="font-semibold text-[color:var(--color-text-primary)]">{v.code}</code>
                <span className="tabular-nums text-[color:var(--color-text-secondary)]">
                  {v.credits.toLocaleString()} credits · used {v.redeemed_count}/{v.max_redemptions}
                  {v.expires_at ? ` · expires ${new Date(v.expires_at).toLocaleDateString()}` : ' · never expires'}
                </span>
                <form action={delAction} className="ml-auto">
                  <input type="hidden" name="code" value={v.code} />
                  <button
                    type="submit"
                    disabled={delPending}
                    aria-label={`Delete ${v.code}`}
                    className="rounded border border-red-200 p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <Feedback state={delState} />
      </div>
    </section>
  )
}
