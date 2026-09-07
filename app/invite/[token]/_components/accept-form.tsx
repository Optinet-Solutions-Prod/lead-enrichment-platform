'use client'

import { useActionState } from 'react'
import { acceptInviteAction, type AcceptInviteState } from '../actions'

const initialState: AcceptInviteState = null

type Props = {
  token: string
  orgName: string
}

export function AcceptForm({ token, orgName }: Props) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
      >
        {pending ? 'Joining…' : `Join ${orgName}`}
      </button>
    </form>
  )
}
