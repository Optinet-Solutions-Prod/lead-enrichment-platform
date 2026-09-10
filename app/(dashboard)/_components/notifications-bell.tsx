'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Bell, Check } from 'lucide-react'
import { markAllReadAction } from '../_actions/notifications'

export type BellItem = {
  id: number
  title: string
  body: string | null
  href: string | null
  created_at: string
  read_at: string | null
}

type Props = {
  unread: number
  items: BellItem[]
  /** Anchor the dropdown panel to this side of the button. */
  align?: 'left' | 'right'
  tourTarget?: boolean
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function NotificationsBell({ unread, items, align = 'right', tourTarget = false }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications — ${unread} unread` : 'Notifications'}
        {...(tourTarget ? { 'data-tour': 'bell' } : {})}
        onClick={() => setOpen(v => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-bg-secondary)] hover:text-[color:var(--color-text-primary)]"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={[
            'absolute top-full z-50 mt-1 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-3 py-2">
            <span className="text-[12px] font-semibold text-[color:var(--color-text-primary)]">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => markAllReadAction())}
                className="inline-flex items-center gap-1 text-[11px] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)] disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-[color:var(--color-text-secondary)]">
              Nothing yet — finished runs, low balance and team events show up here.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map(n => {
                const inner = (
                  <>
                    <span className="flex items-start gap-2">
                      {!n.read_at && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-accent-hover)]" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium text-[color:var(--color-text-primary)]">
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="block truncate text-[11px] text-[color:var(--color-text-secondary)]">
                            {n.body}
                          </span>
                        )}
                        <span className="block text-[10px] text-[color:var(--color-text-secondary)]/80">
                          {timeAgo(n.created_at)}
                        </span>
                      </span>
                    </span>
                  </>
                )
                const cls =
                  'block border-b border-[color:var(--color-border)] px-3 py-2 last:border-b-0 hover:bg-[color:var(--color-bg-secondary)]'
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link href={n.href} className={cls} onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    ) : (
                      <div className={cls}>{inner}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
