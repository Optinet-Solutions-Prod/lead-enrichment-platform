'use client'

import { useActionState } from 'react'
import { Crown, DoorOpen, Loader2 } from 'lucide-react'
import { leaveOrgAction, transferOwnershipAction, type ActionState } from '../actions'

const initialState: ActionState = null

export type TransferTarget = { userId: string; label: string }

type Props = {
  orgName: string
  /** Viewer is THE owner → show transfer; otherwise show leave. */
  isOwner: boolean
  /** Other members the owner could hand the org to (never includes self). */
  targets: TransferTarget[]
}

export function DangerZone({ orgName, isOwner, targets }: Props) {
  const [transferState, transferAction, transferPending] = useActionState(
    transferOwnershipAction,
    initialState,
  )
  const [leaveState, leaveAction, leavePending] = useActionState(leaveOrgAction, initialState)

  return (
    <section className="rounded-lg border border-red-200 bg-[color:var(--color-bg-primary)] p-4">
      <h2 className="text-[14px] font-medium text-red-700">Danger zone</h2>

      {isOwner ? (
        <>
          <p className="mt-1 max-w-2xl text-[12px] text-[color:var(--color-text-secondary)]">
            Hand <strong className="text-[color:var(--color-text-primary)]">{orgName}</strong> to
            another member. They become the owner; you stay on as an admin. This is the only
            way an owner can later leave the organization.
          </p>
          {targets.length === 0 ? (
            <p className="mt-2 text-[12px] text-[color:var(--color-text-secondary)]">
              You&apos;re the only member — invite someone first, then transfer.
            </p>
          ) : (
            <form
              action={transferAction}
              onSubmit={e => {
                const sel = e.currentTarget.elements.namedItem('user_id') as HTMLSelectElement
                const label = sel.selectedOptions[0]?.textContent ?? 'this member'
                if (!confirm(`Transfer ownership of ${orgName} to ${label}? You will become an admin.`))
                  e.preventDefault()
              }}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <select
                name="user_id"
                required
                className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none"
              >
                <option value="">Choose the new owner…</option>
                {targets.map(t => (
                  <option key={t.userId} value={t.userId}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={transferPending}
                className="inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-2 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {transferPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crown className="h-3.5 w-3.5" />}
                {transferPending ? 'Transferring…' : 'Transfer ownership'}
              </button>
            </form>
          )}
          {transferState?.ok && (
            <p className="mt-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800">
              {transferState.ok}
            </p>
          )}
          {transferState?.error && (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {transferState.error}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 max-w-2xl text-[12px] text-[color:var(--color-text-secondary)]">
            Leave <strong className="text-[color:var(--color-text-primary)]">{orgName}</strong>.
            You lose access to its data immediately; an admin can re-invite you later.
          </p>
          <form
            action={leaveAction}
            onSubmit={e => {
              if (!confirm(`Leave ${orgName}? You lose access immediately.`)) e.preventDefault()
            }}
            className="mt-3"
          >
            <button
              type="submit"
              disabled={leavePending}
              className="inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-2 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              {leavePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DoorOpen className="h-3.5 w-3.5" />}
              {leavePending ? 'Leaving…' : 'Leave organization'}
            </button>
          </form>
          {leaveState?.error && (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {leaveState.error}
            </p>
          )}
        </>
      )}
    </section>
  )
}
