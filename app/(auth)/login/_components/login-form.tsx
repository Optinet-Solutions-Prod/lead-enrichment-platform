'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { authButtonCls, authInputCls } from '../../_components/auth-shell'
import { signInAction, type LoginState } from '../actions'

const initialState: LoginState = null

type Props = {
  redirectTo: string
}

export function LoginForm({ redirectTo }: Props) {
  const [state, formAction, pending] = useActionState(signInAction, initialState)
  const [show, setShow] = useState(false)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="from" value={redirectTo} />

      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Email or username
        <input
          name="username"
          type="text"
          autoComplete="username"
          required
          autoFocus
          placeholder="you@company.com"
          className={authInputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Password
        <span className="relative">
          <input
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className={`${authInputCls} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      </label>

      {state?.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={authButtonCls}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
