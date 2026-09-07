'use client'

import { useActionState } from 'react'
import { renameOrgAction, type ActionState } from '../actions'

const initialState: ActionState = null

type Props = {
  currentName: string
}

export function RenameForm({ currentName }: Props) {
  const [state, formAction, pending] = useActionState(renameOrgAction, initialState)

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-56 flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
        Organization name
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          defaultValue={currentName}
          className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-[color:var(--color-border)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-bg-secondary)] disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      {state?.error && <p className="text-[12px] text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-[12px] text-green-700">{state.ok}</p>}
    </form>
  )
}
