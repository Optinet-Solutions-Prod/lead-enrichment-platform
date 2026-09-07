import { ShoppingBag } from 'lucide-react'
import type { MaltaparkListingSummary } from '../_lib/queries'

type Props = {
  jobId: string
  summary: MaltaparkListingSummary
}

/** Summary header for a Maltapark job. Listings are captured in one pass
 *  (no scoring / phase-2), so unlike the social panels there's no action
 *  button — just the count and what it means. */
export function MaltaparkListingsPanel({ summary }: Props) {
  return (
    <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-[color:var(--color-text-secondary)]" />
          <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
            Maltapark listings
          </h2>
          <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] tabular-nums text-[color:var(--color-text-secondary)]">
            {summary.total.toLocaleString()}
          </span>
        </div>
      </div>
      <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
        Listings matching this keyword on maltapark.com. Re-running the scrape
        refreshes titles, prices, and last-seen timestamps for listings that are
        still live.
      </p>
    </section>
  )
}
