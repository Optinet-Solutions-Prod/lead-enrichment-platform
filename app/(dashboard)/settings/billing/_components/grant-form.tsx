'use client'

import { useActionState } from 'react'
import { Gift, Loader2 } from 'lucide-react'
import { grantCreditsAction, type BillingState } from '../actions'

const initialState: BillingState = null

export function GrantForm({ orgName }: { orgName: string }) {
  const [state, formAction, pending] = useActionState(grantCreditsAction, initialState)

  return (
    <section className="rounded-lg border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
      <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
        Grant credits (platform admin)
      </h2>
      <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
        Manual top-up for <strong className="text-[color:var(--color-text-primary)]">{orgName}</strong> until
        card payments are live. Only you see this section.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Amount
          <input
            type="number"
            name="amount"
            min={1}
            max={100000}
            defaultValue={500}
            required
            className="w-32 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] tabular-nums text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Reason
          <input
            type="text"
            name="reason"
            placeholder="manual_grant"
            maxLength={80}
            className="w-56 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
          {pending ? 'Granting…' : 'Grant'}
        </button>
      </form>
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
