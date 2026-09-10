'use client'

import { useActionState } from 'react'
import { Loader2, TicketPercent } from 'lucide-react'
import { redeemVoucherAction, type BillingState } from '../actions'

const initialState: BillingState = null

export function RedeemVoucher({ canRedeem }: { canRedeem: boolean }) {
  const [state, formAction, pending] = useActionState(redeemVoucherAction, initialState)

  return (
    <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
      <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
        Have a promo code?
      </h2>
      {canRedeem ? (
        <form action={formAction} className="mt-2 flex w-full max-w-sm items-center gap-2">
          <input
            type="text"
            name="code"
            required
            placeholder="LEAD-XXXXXX"
            autoCapitalize="characters"
            className="min-h-11 w-full flex-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] uppercase tracking-wide text-[color:var(--color-text-primary)] placeholder:normal-case focus:border-[color:var(--color-accent)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TicketPercent className="h-3.5 w-3.5" />}
            {pending ? 'Checking…' : 'Redeem'}
          </button>
        </form>
      ) : (
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Ask an organization admin to redeem codes.
        </p>
      )}
      {state?.ok && (
        <p className="mt-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800">
          {state.ok}
        </p>
      )}
      {state?.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{state.error}</p>
      )}
    </section>
  )
}
