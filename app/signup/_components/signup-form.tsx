'use client'

import { useActionState } from 'react'
import { signUpAction, type SignupState } from '../actions'

const initialState: SignupState = null

type Props = {
  /** Raw invite token when arriving from an /invite/<token> link. */
  inviteToken?: string | undefined
  /** Pre-filled (and locked) email for invited signups. */
  inviteEmail?: string | undefined
}

export function SignupForm({ inviteToken, inviteEmail }: Props) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {inviteToken && <input type="hidden" name="invite" value={inviteToken} />}

      <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={inviteEmail ?? ''}
          readOnly={Boolean(inviteEmail)}
          placeholder="you@company.com"
          className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-secondary)] read-only:opacity-70 focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
        Password (12+ characters)
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
        Confirm password
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
        />
      </label>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{state.error}</p>
      )}
      {state?.notice && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
      >
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
