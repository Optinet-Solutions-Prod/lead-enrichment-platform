'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { switchOrgAction } from '../_actions/org'

type OrgOption = { id: string; name: string; role: string }

type Props = {
  orgs: OrgOption[]
  activeOrgId: string
  /** Collapsed sidebar renders the letter mark elsewhere; hide the control. */
  showLabels: boolean
}

/**
 * Workspace switcher in the sidebar header. Renders as plain text when the
 * user belongs to a single org; becomes a dropdown from two memberships up.
 * Switching posts to a server action (set_active_org + session refresh), so
 * the whole app — nav modules, data scoping, JWT claims — follows.
 */
export function OrgSwitcher({ orgs, activeOrgId, showLabels }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const active = orgs.find(o => o.id === activeOrgId) ?? orgs[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!showLabels || !active) return null

  if (orgs.length < 2) {
    return (
      <span className="truncate text-[13px] font-semibold tracking-wide text-[color:var(--color-text-primary)]">
        {active?.name ?? 'Dashboard'}
      </span>
    )
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Switch workspace"
        className="flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-semibold tracking-wide text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-secondary)]"
      >
        <span className="truncate">{active.name}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-text-secondary)]" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-1 shadow-lg"
        >
          <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-text-secondary)]">
            Your workspaces
          </p>
          {orgs.map(o => (
            <form key={o.id} action={switchOrgAction}>
              <input type="hidden" name="org_id" value={o.id} />
              <button
                type="submit"
                role="option"
                aria-selected={o.id === active.id}
                disabled={o.id === active.id}
                className={[
                  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px]',
                  o.id === active.id
                    ? 'bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-primary)]'
                    : 'text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)] hover:text-[color:var(--color-text-primary)]',
                ].join(' ')}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.name}</span>
                  <span className="block text-[10px] capitalize text-[color:var(--color-text-secondary)]">
                    {o.role}
                  </span>
                </span>
                {o.id === active.id && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  )
}
