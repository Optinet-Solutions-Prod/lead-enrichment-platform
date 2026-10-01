'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { authButtonCls, authInputCls } from '../../_components/auth-shell'
import { signUpAction, type SignupState } from '../actions'

const initialState: SignupState = null

type Props = {
  /** Raw invite token when arriving from an /invite/<token> link. */
  inviteToken?: string | undefined
  /** Pre-filled (and locked) email for invited signups. */
  inviteEmail?: string | undefined
}

/** Rough strength hint — the real rule (12+ chars) is enforced server-side. */
function strength(pw: string): { label: string; width: string; cls: string } {
  if (pw.length === 0) return { label: '', width: '0%', cls: '' }
  let score = 0
  if (pw.length >= 12) score++
  if (pw.length >= 16) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (pw.length < 12) return { label: 'Too short — 12 characters minimum', width: '20%', cls: 'bg-rose-500' }
  if (score <= 2) return { label: 'Okay', width: '45%', cls: 'bg-amber-500' }
  if (score <= 4) return { label: 'Good', width: '75%', cls: 'bg-lime-500' }
  return { label: 'Strong', width: '100%', cls: 'bg-emerald-500' }
}

export function SignupForm({ inviteToken, inviteEmail }: Props) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState)
  const [show, setShow] = useState(false)
  const [pw, setPw] = useState('')
  const s = strength(pw)

  return (
    <form action={formAction} className="auth-form flex flex-col gap-5">
      {inviteToken && <input type="hidden" name="invite" value={inviteToken} />}

      <label className="flex flex-col gap-2 text-[15px] font-medium text-white">
        Work email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus={!inviteEmail}
          defaultValue={inviteEmail ?? ''}
          readOnly={Boolean(inviteEmail)}
          placeholder="you@company.com"
          className={authInputCls}
        />
      </label>

      <label className="flex flex-col gap-2 text-[15px] font-medium text-white">
        Password
        <span className="relative">
          <input
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={12}
            placeholder="Password"
            onChange={e => setPw(e.currentTarget.value)}
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
        <span className="h-1 overflow-hidden rounded-full bg-[color:var(--color-border)]">
          <span className={`block h-full rounded-full transition-all ${s.cls}`} style={{ width: s.width }} />
        </span>
        <span className="text-[11px] font-normal text-[color:var(--color-text-secondary)]">
          {s.label || 'At least 12 characters. A sentence you will remember works well.'}
        </span>
      </label>

      <label className="flex flex-col gap-2 text-[15px] font-medium text-white">
        Confirm password
        <input
          name="confirm"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={12}
          placeholder="Repeat password"
          className={authInputCls}
        />
      </label>

      {state?.error && (
        <p role="alert" className="rounded-[4px] border border-red-400/30 bg-red-400/10 px-3 py-2 text-[14px] text-red-200">
          {state.error}
        </p>
      )}
      {state?.notice && (
        <p role="status" className="rounded-[4px] border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[14px] text-amber-200">
          {state.notice}
        </p>
      )}

      <button type="submit" disabled={pending} className={authButtonCls}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? 'Creating account…' : inviteToken ? 'Create account & join' : 'Create free account'}
      </button>
    </form>
  )
}
