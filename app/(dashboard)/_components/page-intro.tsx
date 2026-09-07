import Link from 'next/link'
import { ArrowRight, Info } from 'lucide-react'
import type { ReactNode } from 'react'

type Relation = { href: string; label: string }

type Props = {
  title: string
  /** One plain sentence: what this page IS, in the user's words. */
  tagline: string
  /** Meny's source tier, when the page maps to one (badge next to the title). */
  tier?: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Derived'
  /** One line: where the data comes from + how it gets here. */
  sourceLine: string
  /** Live stats line rendered by the page (counts, freshness). */
  statsLine?: string
  /** Links to the pages this data feeds or is fed by. */
  relations?: Relation[]
  /** Expandable detail: how it's collected, what columns mean, playbook. */
  learnMore?: ReactNode
}

/**
 * Shared explainer header for the property-data pages. Every page answers the
 * same four questions in the same place: what is this, where did it come
 * from, what's it connected to, and what do I do with it — so moving between
 * pages never loses the thread. The deep dive lives behind a native
 * <details> so the header stays two lines tall for daily use.
 */
export function PageIntro({
  title,
  tagline,
  tier,
  sourceLine,
  statsLine,
  relations = [],
  learnMore,
}: Props) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          {title}
        </h1>
        {tier && (
          <span
            className={[
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              tier === 'Tier 1'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : tier === 'Tier 2'
                  ? 'border-sky-300 bg-sky-50 text-sky-800'
                  : tier === 'Tier 3'
                    ? 'border-violet-300 bg-violet-50 text-violet-800'
                    : 'border-amber-300 bg-amber-50 text-amber-800',
            ].join(' ')}
            title="Source tier from the Malta property-owner research plan"
          >
            {tier}
          </span>
        )}
      </div>

      <p className="max-w-3xl text-[13px] text-[color:var(--color-text-primary)]">{tagline}</p>
      <p className="max-w-3xl text-[12px] text-[color:var(--color-text-secondary)]">
        <span className="font-medium text-[color:var(--color-text-primary)]">Data source:</span>{' '}
        {sourceLine}
        {statsLine && <> · {statsLine}</>}
      </p>

      {relations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {relations.map(r => (
            <Link
              key={r.href + r.label}
              href={r.href}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[12px] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)] hover:text-[color:var(--color-text-primary)]"
            >
              {r.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      )}

      {learnMore && (
        <details className="group max-w-3xl rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]/50 open:bg-[color:var(--color-bg-secondary)]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)] [&::-webkit-details-marker]:hidden">
            <Info className="h-3.5 w-3.5" />
            About this data — how we got it and what to do with it
          </summary>
          <div className="flex flex-col gap-2 px-3 pb-3 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)] [&_strong]:text-[color:var(--color-text-primary)]">
            {learnMore}
          </div>
        </details>
      )}
    </header>
  )
}
