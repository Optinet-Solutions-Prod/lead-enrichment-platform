import type { ExistingState } from '../_lib/query'

/**
 * "Already exists?" — one badge saying WHERE a lead's website is already
 * known, not a pair of yes/no columns.
 *
 * Only the state goes on the badge; the detail and the last-checked time
 * live in the tooltip. A row whose check has never run says "never checked"
 * — it must not imply the answer is current.
 */
const STYLES: Record<ExistingState, { label: string; cls: string; detail: string }> = {
  // Reserved for an external source (CRM / billing). Nothing produces it yet.
  external: {
    label: 'Known account',
    cls: 'bg-sky-100 text-sky-800',
    detail: 'Already an account in an external system',
  },
  system: {
    label: 'In system',
    cls: 'bg-amber-100 text-amber-800',
    detail: 'An earlier scrape already found this website',
  },
  new: {
    label: 'New',
    cls: 'bg-emerald-100 text-emerald-800',
    detail: 'Not seen before this scrape — a genuinely new lead',
  },
}

export function ExistsBadge({
  state,
  checkedAt,
}: {
  state: ExistingState
  checkedAt: string | null
}) {
  const s = STYLES[state]
  const when = checkedAt ? `first seen ${new Date(checkedAt).toLocaleString()}` : 'never checked'
  return (
    <span
      title={`${s.detail} · ${when}`}
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  )
}
