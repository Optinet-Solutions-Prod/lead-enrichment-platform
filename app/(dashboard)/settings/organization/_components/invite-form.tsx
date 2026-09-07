'use client'

import { useActionState, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { createInviteAction, type InviteState } from '../actions'

const initialState: InviteState = null

export function InviteForm() {
  const [state, formAction, pending] = useActionState(createInviteAction, initialState)
  const [copied, setCopied] = useState(false)

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — the link is selectable text below.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Email to invite
          <input
            name="email"
            type="email"
            required
            placeholder="teammate@company.com"
            className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-secondary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Role
          <select
            name="role"
            defaultValue="member"
            className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-2 py-2 text-[13px] text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create invite link'}
        </button>
      </form>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{state.error}</p>
      )}

      {state?.link && (
        <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] px-3 py-2">
          <p className="text-[12px] text-[color:var(--color-text-secondary)]">
            Invite link for {state.email} — shown once, share it with them directly:
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all text-[12px] text-[color:var(--color-text-primary)]">
              {state.link}
            </code>
            <button
              type="button"
              onClick={() => copyLink(state.link!)}
              aria-label="Copy invite link"
              className="rounded border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-primary)]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
