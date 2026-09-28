/**
 * Outreach status vocabulary — shared by the DB enum, the editor and the
 * filters. Plain data, safe in client components.
 */
export const OUTREACH_STATUSES = [
  { value: 'new', label: 'New', tone: 'idle' },
  { value: 'contacted', label: 'Contacted', tone: 'info' },
  { value: 'replied', label: 'Replied', tone: 'warn' },
  { value: 'won', label: 'Won', tone: 'good' },
  { value: 'not_now', label: 'Not now', tone: 'muted' },
  { value: 'lost', label: 'Lost', tone: 'bad' },
] as const

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]['value']

export const OUTREACH_STATUS_VALUES: OutreachStatus[] = OUTREACH_STATUSES.map(s => s.value)

export function isOutreachStatus(v: unknown): v is OutreachStatus {
  return typeof v === 'string' && (OUTREACH_STATUS_VALUES as string[]).includes(v)
}

/** Statuses that mean "we are still working this one". */
export const OPEN_STATUSES: OutreachStatus[] = ['new', 'contacted', 'replied', 'not_now']

export const STATUS_TONE_CLS: Record<(typeof OUTREACH_STATUSES)[number]['tone'], string> = {
  idle: 'border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] text-[color:var(--color-text-secondary)]',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  good: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  muted: 'border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-primary)]',
  bad: 'border-rose-300 bg-rose-50 text-rose-900',
}

/** Today as YYYY-MM-DD in UTC — follow-up dates are stored as plain dates. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
