import Link from 'next/link'
import { ArrowRight, CalendarClock, Phone } from 'lucide-react'

export type DueLead = {
  id: number
  owner_name: string | null
  location: string | null
  contact_phone: string | null
  next_follow_up_at: string | null
  outreach_status: string
}

export type OutreachCounts = { contacted: number; replied: number; won: number; due: number }

/**
 * The monitoring half of "lead → outreach → monitor": where the pipeline
 * stands and who is due a follow-up, on the home page, every visit.
 */
export function OutreachPulse({ counts, due, dueHref }: { counts: OutreachCounts; due: DueLead[]; dueHref: string }) {
  if (counts.contacted === 0 && counts.due === 0) return null

  return (
    <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">Outreach pulse</h2>
        <p className="text-[12px] tabular-nums text-[color:var(--color-text-secondary)]">
          {counts.contacted} contacted · {counts.replied} replied · {counts.won} won
        </p>
      </div>

      {counts.due > 0 ? (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-rose-800">
            <CalendarClock className="h-3.5 w-3.5" />
            {counts.due} follow-up{counts.due === 1 ? '' : 's'} due today or overdue
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {due.map(l => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-md bg-[color:var(--color-bg-secondary)] px-3 py-1.5 text-[12px]">
                <span className="font-medium text-[color:var(--color-text-primary)]">{l.owner_name ?? 'Unnamed owner'}</span>
                {l.location && <span className="text-[color:var(--color-text-secondary)]">· {l.location}</span>}
                <span className="rounded-full border border-[color:var(--color-border)] px-1.5 py-0.5 text-[10px] capitalize text-[color:var(--color-text-secondary)]">
                  {l.outreach_status.replace('_', ' ')}
                </span>
                {l.contact_phone && (
                  <a href={`tel:${l.contact_phone.replace(/\s+/g, '')}`} className="ml-auto inline-flex items-center gap-1 underline-offset-2 hover:underline">
                    <Phone className="h-3 w-3" />
                    {l.contact_phone}
                  </a>
                )}
                <span className="text-[11px] tabular-nums text-rose-800">{l.next_follow_up_at}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-[12px] text-[color:var(--color-text-secondary)]">No follow-ups due. Set one on any lead and it shows up here on the day.</p>
      )}

      <Link href={dueHref} className="mt-3 inline-flex items-center gap-1 text-[12px] underline underline-offset-2">
        Open the outreach list
        <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  )
}
