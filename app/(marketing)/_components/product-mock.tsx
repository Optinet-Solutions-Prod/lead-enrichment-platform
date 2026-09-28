import { Search, Sparkles, Table2, Workflow } from 'lucide-react'

/**
 * A product-forward hero: the partner-sites list as it really looks, with
 * fictional rows. A real screenshot would carry real publishers' contact
 * details onto a public page, so this is drawn in JSX and stays in sync
 * with the app's own palette.
 */
const ROWS = [
  { site: 'vpnvergleich24.de', kw: 'bester vpn · DE', relevant: true, brands: 3, contacts: 'email · TG', status: 'Replied', tone: 'bg-sky-100 text-sky-800' },
  { site: 'lesmeilleursvpn.fr', kw: 'meilleur vpn · FR', relevant: true, brands: 5, contacts: 'email · LI', status: 'Contacted', tone: 'bg-amber-100 text-amber-800' },
  { site: 'streamsafe.co.uk', kw: 'vpn for streaming · UK', relevant: true, brands: 2, contacts: 'form', status: 'New', tone: 'bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-secondary)]' },
  { site: 'privacynerd.it', kw: 'migliori vpn · IT', relevant: true, brands: 4, contacts: 'email · X', status: 'Won', tone: 'bg-emerald-100 text-emerald-800' },
  { site: 'topvpnlist.es', kw: 'mejor vpn · ES', relevant: true, brands: 1, contacts: 'email', status: 'New', tone: 'bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-secondary)]' },
]

const NAV = [
  { icon: Search, label: 'Scrape' },
  { icon: Workflow, label: 'Workflows' },
  { icon: Table2, label: 'Leads' },
  { icon: Sparkles, label: 'Partners (AI)', active: true },
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
          app.leadengine · Partners (AI)
        </span>
      </div>
      <div className="flex">
        <aside className="hidden w-12 shrink-0 flex-col gap-1 border-r border-[color:var(--color-border)] p-2 sm:flex 2xl:w-40 2xl:p-3">
          <p className="mb-2 hidden truncate text-[11px] font-semibold 2xl:block">Acme VPN ▾</p>
          <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-accent)] text-[11px] font-semibold 2xl:hidden">A</span>
          {NAV.map(n => (
            <span
              key={n.label}
              className={[
                'flex items-center justify-center gap-2 rounded-md px-2 py-1.5 text-[11px] 2xl:justify-start',
                n.active ? 'bg-[color:var(--color-bg-secondary)] font-medium' : 'text-[color:var(--color-text-secondary)]',
              ].join(' ')}
            >
              <n.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden 2xl:inline">{n.label}</span>
            </span>
          ))}
        </aside>
        <div className="min-w-0 flex-1 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold">Partner sites found by AI</p>
              <p className="text-[10px] text-[color:var(--color-text-secondary)]">
                412 screened · 138 affiliates · 96 with contacts · 4 follow-ups due today
              </p>
            </div>
            <span className="rounded-md bg-[color:var(--color-accent)] px-2.5 py-1 text-[11px] font-medium">
              New keyword batch
            </span>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-[color:var(--color-border)]">
            <table className="w-full table-fixed text-left text-[11px]">
              <thead className="bg-[color:var(--color-bg-secondary)] text-[10px] uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                <tr>
                  <th className="w-[42%] px-2.5 py-1.5 font-medium">Website · keyword</th>
                  <th className="w-[15%] px-2 py-1.5 font-medium">Brands</th>
                  <th className="w-[21%] px-2 py-1.5 font-medium">Contacts</th>
                  <th className="w-[22%] px-2 py-1.5 font-medium">Outreach</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {ROWS.map(r => (
                  <tr key={r.site}>
                    <td className="px-2.5 py-1.5">
                      <span className="flex items-center gap-1.5 truncate font-medium">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span className="truncate">{r.site}</span>
                      </span>
                      <span className="block truncate pl-3 text-[10px] text-[color:var(--color-text-secondary)]">{r.kw}</span>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{r.brands}</td>
                    <td className="truncate px-2 py-1.5 text-[color:var(--color-text-secondary)]">{r.contacts}</td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.tone}`}>{r.status}</span>
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
