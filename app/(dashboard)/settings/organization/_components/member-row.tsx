'use client'

import { useActionState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import {
  removeMemberAction,
  setMemberRoleAction,
  type ActionState,
} from '../actions'

const initialState: ActionState = null

type Props = {
  userId: string
  email: string
  displayName: string | null
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
  /** Whether the VIEWER may manage this row (admin+, and never the owner row). */
  canManage: boolean
  /** Only the owner may change roles (the RPC enforces it too). */
  canChangeRole: boolean
  isSelf: boolean
}

export function MemberRow({
  userId,
  email,
  displayName,
  role,
  joinedAt,
  canManage,
  canChangeRole,
  isSelf,
}: Props) {
  const [removeState, removeAction, removePending] = useActionState(
    removeMemberAction,
    initialState,
  )
  const [roleState, roleAction, rolePending] = useActionState(
    setMemberRoleAction,
    initialState,
  )
  const error = removeState?.error ?? roleState?.error

  return (
    <tr className="border-t border-[color:var(--color-border)]">
      <td className="px-3 py-2">
        <div className="text-[13px] text-[color:var(--color-text-primary)]">
          {displayName || email.split('@')[0]}
          {isSelf && (
            <span className="ml-1 text-[11px] text-[color:var(--color-text-secondary)]">
              (you)
            </span>
          )}
        </div>
        <div className="text-[11px] text-[color:var(--color-text-secondary)]">{email}</div>
        {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
      </td>
      <td className="px-3 py-2 align-top">
        {role === 'owner' || !canChangeRole ? (
          <span className="inline-block rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] capitalize text-[color:var(--color-text-secondary)]">
            {role}
          </span>
        ) : (
          <form action={roleAction} className="inline-flex items-center gap-1">
            <input type="hidden" name="user_id" value={userId} />
            <select
              name="role"
              defaultValue={role}
              disabled={rolePending}
              onChange={e => e.currentTarget.form?.requestSubmit()}
              className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-1.5 py-0.5 text-[12px] text-[color:var(--color-text-primary)] disabled:opacity-50"
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            {rolePending && <Loader2 className="h-3 w-3 animate-spin" />}
          </form>
        )}
      </td>
      <td className="px-3 py-2 align-top text-[12px] tabular-nums text-[color:var(--color-text-secondary)]">
        {new Date(joinedAt).toLocaleDateString()}
      </td>
      <td className="px-3 py-2 text-right align-top">
        {canManage && role !== 'owner' && !isSelf && (
          <form
            action={removeAction}
            onSubmit={e => {
              if (!confirm(`Remove ${email} from the organization?`)) e.preventDefault()
            }}
            className="inline"
          >
            <input type="hidden" name="user_id" value={userId} />
            <button
              type="submit"
              disabled={removePending}
              aria-label={`Remove ${email}`}
              className="rounded border border-[color:var(--color-border)] p-1 text-[color:var(--color-text-secondary)] hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              {removePending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </form>
        )}
      </td>
    </tr>
  )
}
