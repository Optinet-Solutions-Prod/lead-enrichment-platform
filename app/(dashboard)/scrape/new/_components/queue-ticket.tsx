'use client'

import Link from 'next/link'
import { CalendarClock, Plus, Table2, Ticket } from 'lucide-react'
import { Flag } from '../../../_components/flag'
import {
  ENRICHMENT_STAGES,
  dayLabel,
  engineDef,
  langName,
  utcDay,
  type ScrapeDraft,
} from '../_lib/wizard-helpers'

/** What the scrape page already knows about the queue, passed down so the
 *  ticket can say how busy the runner is rather than guess. */
export type QueueEstimate = {
  /** Ready-to-run jobs already queued for this country. */
  pendingInCountry: number
  /** Jobs running on this country right now. */
  runningInCountry: number
  /** Workers this country can use at once. */
  capacity: number
  /** Minutes until a job joining the back of this country's queue starts. */
  etaMinutes: number | null
  /** Ready-to-run jobs across the whole fleet. */
  totalPending: number
}

export type TicketInfo = {
  draft: ScrapeDraft
  countryName: string
  estimate: QueueEstimate | null
  /** Reference shown on the stub. A real batch number replaces this once the
   *  job completes. */
  reference: string
  /** How many of this submit's jobs the server started straight away. */
  startedNow: number | null
}

/**
 * Confirmation shown after a scrape is submitted, built like a cloakroom
 * ticket: what is happening is the whole point, everything else is the stub.
 */
export function QueueTicket({ info, onCreateAnother }: { info: TicketInfo; onCreateAnother: () => void }) {
  const { draft, countryName, reference, startedNow } = info
  const def = engineDef(draft.search_engine)
  const scheduled = draft.mode === 'schedule' && draft.scheduled_at
  const running = !scheduled && (startedNow === null || startedNow > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-primary)] shadow-sm">
        {/* Stub head */}
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-secondary)] px-5 py-3">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text-secondary)]">
            <Ticket className="h-3.5 w-3.5" />
            Scrape ticket
          </span>
          <span className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">{reference}</span>
        </div>

        {/* Stacked on a phone; from `lg` the stub sits beside the detail so a
            wide screen is not mostly empty either side of a narrow column. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-stretch">
        {/* The status */}
        <div className="flex flex-col items-center gap-1 px-5 pb-5 pt-6 text-center lg:justify-center lg:border-r lg:border-dashed lg:border-[color:var(--color-border-strong)]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-text-secondary)]">
            {scheduled ? 'Scheduled' : 'Status'}
          </span>
          {scheduled ? (
            <>
              <span className="inline-flex items-center gap-2 text-[34px] font-semibold leading-tight tracking-tight text-[color:var(--color-text-primary)]">
                <CalendarClock className="h-7 w-7 text-[color:var(--color-text-secondary)]" />
                {new Date(draft.scheduled_at!).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-[12.5px] text-[color:var(--color-text-secondary)]">
                It starts then, and spends {dayLabel(utcDay(draft.scheduled_at!)).toLowerCase()}&rsquo;s quota.
              </span>
            </>
          ) : (
            <>
              <span className="text-[44px] font-semibold leading-none tracking-tight text-[color:var(--color-text-primary)]">
                {running ? 'Running' : 'Queued'}
              </span>
              <span className="text-[12.5px] text-[color:var(--color-text-secondary)]">
                {running
                  ? `${def?.label ?? 'Google'} is being searched for ${countryName} now — about a minute per keyword.`
                  : 'It starts on the next refresh of the scraping table.'}
              </span>
            </>
          )}
          <span
            className={[
              'mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium',
              scheduled ? 'bg-sky-100 text-sky-800' : running ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-900',
            ].join(' ')}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${scheduled ? 'bg-sky-600' : running ? 'bg-blue-600' : 'bg-amber-600'}`} />
            {scheduled ? 'Scheduled' : running ? 'Running' : 'Pending'}
          </span>

          {/* Straight under the status, where the hand already is. */}
          <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
            <Link
              href="/scrape"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[color:var(--color-text-primary)] px-5 py-3.5 text-[14px] font-semibold text-white hover:opacity-90"
            >
              <Table2 className="h-[18px] w-[18px]" /> Watch it in the table
            </Link>
            <button
              type="button"
              onClick={onCreateAnother}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-primary)] px-5 py-3.5 text-[14px] font-semibold text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-secondary)]"
            >
              <Plus className="h-[18px] w-[18px]" /> Create another scrape
            </button>
          </div>
        </div>

        {/* Perforation — the lg layout uses the vertical rule instead. */}
        <div className="relative h-0 border-t border-dashed border-[color:var(--color-border-strong)] lg:hidden">
          <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-[color:var(--color-bg-secondary)]" />
          <span className="absolute -right-2 -top-2 h-4 w-4 rounded-full bg-[color:var(--color-bg-secondary)]" />
        </div>

        {/* Stub detail */}
        <div className="min-w-0">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-[12.5px] sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          <Field label="Expected" value={scheduled ? 'Starts at the scheduled time' : 'About a minute per keyword, then enrichment'} />
          <Field label="Keywords queued" value={`${draft.keywords.length}`} />
          <Field label="Source" value={def?.label ?? draft.search_engine} />
          <Field label="Country" value={<span className="inline-flex items-center gap-1.5"><Flag code={draft.country_code} />{countryName}</span>} />
          <Field label="Language" value={langName(draft.language)} />
          <Field label="Pages" value={`${draft.pages} per keyword`} />
          {def?.kind === 'serp' && (
            <Field label="Device" value={draft.view_mode === 'mobile' ? 'Mobile' : 'Desktop'} />
          )}
          {def?.kind === 'serp' && (
            <Field
              label="Enrichment"
              value={draft.with_enrichment || draft.enrichment_stages.length > 0 ? draft.enrichment_stages.map(k => ENRICHMENT_STAGES.find(s => s.key === k)?.label ?? k).join(', ') : 'None'}
            />
          )}
          {def?.kind === 'social' && (
            <Field label="Keep" value={draft.top_n_by_follower === null ? 'All accounts' : `Top ${draft.top_n_by_follower} by followers`} />
          )}
        </dl>

        {draft.keywords.length > 0 && (
          <div className="border-t border-[color:var(--color-border)] px-5 py-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-text-secondary)]">Keywords</div>
            <ul className="flex flex-wrap gap-1">
              {draft.keywords.map(k => (
                <li key={k} className="rounded-full bg-[color:var(--color-bg-secondary)] px-2 py-0.5 text-[12px] text-[color:var(--color-text-primary)]">
                  {k}
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--color-text-secondary)]">{label}</dt>
      <dd className="mt-0.5 text-[color:var(--color-text-primary)]">{value}</dd>
    </div>
  )
}
