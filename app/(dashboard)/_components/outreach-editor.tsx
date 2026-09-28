'use client'

import { useActionState, useRef, useState } from 'react'
import { CalendarClock, Check, Loader2, StickyNote } from 'lucide-react'
import { OUTREACH_STATUSES, STATUS_TONE_CLS, type OutreachStatus } from '@/lib/outreach'
import { setOutreachAction, type OutreachState } from '../_actions/outreach'

const initial: OutreachState = null

type Props = {
  kind: 'lead' | 'website'
  id: number
  status: OutreachStatus
  nextFollowUpAt: string | null
  note: string | null
  contactedAt?: string | null
  /** Table-cell layout: one line, note behind a toggle. */
  compact?: boolean
}

/**
 * Status + follow-up + note, saved on every change. All three fields are in
 * every submit (the note rides along as a hidden input while collapsed), so
 * changing the status never wipes the date or the note.
 */
export function OutreachEditor({ kind, id, status, nextFollowUpAt, note, contactedAt, compact = false }: Props) {
  const [state, action, pending] = useActionState(setOutreachAction, initial)
  const [noteOpen, setNoteOpen] = useState(!compact && Boolean(note))
  const [noteText, setNoteText] = useState(note ?? '')
  const formRef = useRef<HTMLFormElement>(null)
  const submit = () => formRef.current?.requestSubmit()

  const tone = OUTREACH_STATUSES.find(s => s.value === status)?.tone ?? 'idle'
  const overdue = nextFollowUpAt !== null && nextFollowUpAt < new Date().toISOString().slice(0, 10) && status !== 'won' && status !== 'lost'

  return (
    <form ref={formRef} action={action} className={compact ? 'flex flex-col gap-1' : 'flex flex-col gap-2'}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      {!noteOpen && <input type="hidden" name="note" value={noteText} />}

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          name="status"
          defaultValue={status}
          disabled={pending}
          onChange={submit}
          aria-label="Outreach status"
          className={`min-h-8 rounded-full border px-2 text-[11px] font-medium capitalize ${STATUS_TONE_CLS[tone]} disabled:opacity-60`}
        >
          {OUTREACH_STATUSES.map(s => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <label
          className={[
            'inline-flex min-h-8 items-center gap-1 rounded-md border px-1.5 text-[11px]',
            overdue
              ? 'border-rose-300 bg-rose-50 text-rose-800'
              : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)]',
          ].join(' ')}
          title={overdue ? 'Follow-up overdue' : 'Next follow-up'}
        >
          <CalendarClock className="h-3 w-3 shrink-0" />
          <input
            type="date"
            name="next_follow_up_at"
            defaultValue={nextFollowUpAt ?? ''}
            disabled={pending}
            onChange={submit}
            aria-label="Next follow-up date"
            className="w-[7.5rem] bg-transparent text-[11px] text-[color:var(--color-text-primary)] focus:outline-none"
          />
        </label>

        {compact && (
          <button
            type="button"
            onClick={() => setNoteOpen(v => !v)}
            aria-label={noteOpen ? 'Hide note' : noteText ? 'Edit note' : 'Add note'}
            title={noteText || 'Add a note'}
            className={[
              'inline-flex h-8 w-8 items-center justify-center rounded-md border',
              noteText
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
            ].join(' ')}
          >
            <StickyNote className="h-3.5 w-3.5" />
          </button>
        )}
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--color-text-secondary)]" />}
        {!pending && state?.ok && <Check className="h-3.5 w-3.5 text-emerald-600" />}
      </div>

      {(noteOpen || !compact) && (
        <div className="flex flex-col gap-1">
          <textarea
            name="note"
            value={noteText}
            onChange={e => setNoteText(e.currentTarget.value)}
            rows={compact ? 2 : 3}
            maxLength={2000}
            placeholder="What was said, what to do next…"
            className="w-full min-w-[16rem] rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-2 py-1.5 text-[12px] focus:border-[color:var(--color-accent)] focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-8 items-center gap-1 rounded-md bg-[color:var(--color-accent)] px-2.5 text-[11px] font-medium hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
            >
              Save note
            </button>
            {compact && (
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                className="text-[11px] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
              >
                Close
              </button>
            )}
            {contactedAt && (
              <span className="ml-auto text-[10px] text-[color:var(--color-text-secondary)]">
                first contact {new Date(contactedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}

      {state?.error && <p className="text-[11px] text-red-700">{state.error}</p>}
    </form>
  )
}
