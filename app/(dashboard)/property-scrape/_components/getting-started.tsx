import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, Rocket } from 'lucide-react'

/**
 * Activation checklist — computed from REAL org state server-side (no
 * localStorage drift). Renders nothing once everything is done, so it
 * quietly retires itself for activated workspaces.
 */

export type ChecklistItem = {
  key: string
  label: string
  detail: string
  done: boolean
  href: string
}

export function GettingStarted({ items }: { items: ChecklistItem[] }) {
  const remaining = items.filter(i => !i.done)
  if (remaining.length === 0) return null
  const doneCount = items.length - remaining.length

  return (
    <details
      open={doneCount < 2}
      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <Rocket className="h-4 w-4 text-[color:var(--color-accent-hover)]" />
        <span className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
          Getting started
        </span>
        <span className="ml-auto text-[12px] tabular-nums text-[color:var(--color-text-secondary)]">
          {doneCount}/{items.length} done
        </span>
      </summary>
      <ul className="flex flex-col gap-1 px-4 pb-3">
        {items.map(item => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="group flex items-start gap-2 rounded-md px-1 py-1.5 hover:bg-[color:var(--color-bg-secondary)]"
            >
              {item.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-text-secondary)]" />
              )}
              <span className="min-w-0">
                <span
                  className={[
                    'flex items-center gap-1 text-[13px]',
                    item.done
                      ? 'text-[color:var(--color-text-secondary)] line-through'
                      : 'font-medium text-[color:var(--color-text-primary)]',
                  ].join(' ')}
                >
                  {item.label}
                  {!item.done && (
                    <ArrowRight className="h-3 w-3 text-[color:var(--color-text-secondary)] transition-transform group-hover:translate-x-0.5" />
                  )}
                </span>
                {!item.done && (
                  <span className="block text-[12px] text-[color:var(--color-text-secondary)]">
                    {item.detail}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}
