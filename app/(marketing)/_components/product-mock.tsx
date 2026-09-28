import { Building2, Handshake, Search, Workflow } from 'lucide-react'

/**
 * A product-forward hero: the Owner Leads table as it really looks, with
 * fictional rows. A real screenshot would carry real owners' phone numbers
 * onto a public page, so this is drawn in JSX and stays in sync with the
 * app's own palette.
 */
const ROWS = [
  { owner: 'M. Borg', site: 'homesinmalta.com', where: 'Sliema', phone: '+356 79•• •••1', airbnb: 'Match', fresh: 'bg-emerald-500' },
  { owner: 'C. Vella', site: 'propertiesfromowner.com', where: 'St Julian’s', phone: '+356 99•• •••4', airbnb: '—', fresh: 'bg-emerald-500' },
  { owner: 'J. Camilleri', site: 'maltapark.com', where: 'Mellieħa', phone: '+356 79•• •••8', airbnb: 'Match', fresh: 'bg-lime-500' },
  { owner: 'A. Farrugia', site: 'homesinmalta.com', where: 'Gżira', phone: '+356 77•• •••2', airbnb: '—', fresh: 'bg-amber-500' },
  { owner: 'R. Grech', site: 'propertiesfromowner.com', where: 'Marsaskala', phone: '+356 79•• •••6', airbnb: 'Match', fresh: 'bg-emerald-500' },
]

const NAV = [
  { icon: Search, label: 'Collect Data' },
  { icon: Workflow, label: 'Workflows' },
  { icon: Building2, label: 'Owner Leads', active: true },
  { icon: Handshake, label: 'PM Prospects' },
]

export function ProductMock() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-primary)] shadow-[0_30px_80px_-30px_rgba(26,26,26,0.35)]"
    >
      <div className="flex h-8 items-center gap-1.5 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-border-strong)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-border-strong)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-border-strong)]" />
        <span className="ml-3 rounded bg-[color:var(--color-bg-primary)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-secondary)]">
          app.leadengine · Owner Leads
        </span>
      </div>
      <div className="flex">
        <aside className="hidden w-40 shrink-0 flex-col gap-1 border-r border-[color:var(--color-border)] p-3 sm:flex">
          <p className="mb-2 truncate text-[11px] font-semibold">Property Management ▾</p>
          {NAV.map(n => (
            <span
              key={n.label}
              className={[
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]',
                n.active ? 'bg-[color:var(--color-bg-secondary)] font-medium' : 'text-[color:var(--color-text-secondary)]',
              ].join(' ')}
            >
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </span>
          ))}
        </aside>
        <div className="min-w-0 flex-1 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold">Owner Leads</p>
              <p className="text-[10px] text-[color:var(--color-text-secondary)]">
                98 leads · 71 with a phone number · filtered: has phone
              </p>
            </div>
            <span className="rounded-md bg-[color:var(--color-accent)] px-2.5 py-1 text-[11px] font-medium">
              Scrape selected sources
            </span>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-[color:var(--color-border)]">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[color:var(--color-bg-secondary)] text-[10px] uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                <tr>
                  <th className="px-2.5 py-1.5 font-medium">Owner</th>
                  <th className="hidden px-2.5 py-1.5 font-medium md:table-cell">Source</th>
                  <th className="px-2.5 py-1.5 font-medium">Location</th>
                  <th className="px-2.5 py-1.5 font-medium">Phone</th>
                  <th className="px-2.5 py-1.5 font-medium">Airbnb</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {ROWS.map(r => (
                  <tr key={r.owner}>
                    <td className="flex items-center gap-1.5 px-2.5 py-1.5 font-medium">
                      <span className={`h-1.5 w-1.5 rounded-full ${r.fresh}`} />
                      {r.owner}
                    </td>
                    <td className="hidden px-2.5 py-1.5 text-[color:var(--color-text-secondary)] md:table-cell">{r.site}</td>
                    <td className="px-2.5 py-1.5">{r.where}</td>
                    <td className="px-2.5 py-1.5 tabular-nums">{r.phone}</td>
                    <td className="px-2.5 py-1.5">
                      {r.airbnb === 'Match' ? (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                          Match
                        </span>
                      ) : (
                        <span className="text-[color:var(--color-text-secondary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
