'use client'

import { useActionState } from 'react'
import { Loader2, X } from 'lucide-react'
import { revokeInviteAction, type ActionState } from '../actions'

const initialState: ActionState = null

type Props = {
  inviteId: string
  email: string
  role: string
  expiresAt: string
}

export function InviteRow({ inviteId, email, role, expiresAt }: Props) {
  const [state, formAction, pending] = useActionState(revokeInviteAction, initialState)
  const expired = new Date(expiresAt) < new Date()

  return (
    <tr className="border-t border-[color:var(--color-border)]">
      <td className="px-3 py-2">
        <span className="text-[13px] text-[color:var(--color-text-primary)]">{email}</span>
        {state?.error && <div className="mt-1 text-[11px] text-red-600">{state.error}</div>}
      </td>
      <td className="px-3 py-2 text-[12px] capitalize text-[color:var(--color-text-secondary)]">
        {role}
      </td>
      <td className="px-3 py-2 text-[12px] tabular-nums text-[color:var(--color-text-secondary)]">
        {expired ? (
          <span className="text-amber-700">expired</span>
        ) : (
          new Date(expiresAt).toLocaleDateString()
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <form action={formAction} className="inline">
          <input type="hidden" name="invite_id" value={inviteId} />
          <button
            type="submit"
            disabled={pending}
            aria-label={`Revoke invite for ${email}`}
            className="rounded border border-[color:var(--color-border)] p-1 text-[color:var(--color-text-secondary)] hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        </form>
      </td>
    </tr>
  )
}
