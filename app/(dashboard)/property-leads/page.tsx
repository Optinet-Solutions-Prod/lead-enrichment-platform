import Link from 'next/link'
import { ExternalLink, Mail, Phone } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

type LeadRow = {
  id: number
  source_site: string
  listing_url: string | null
  title: string | null
  price_text: string | null
  location: string | null
  owner_name: string | null
  contact_phone: string | null
  contact_email: string | null
  contact_type: 'owner' | 'agency' | 'unknown'
  notes: string | null
  scraped_at: string
  airbnb_url: string | null
  airbnb_match_basis: string | null
}

type SearchParams = Promise<{ site?: string }>

const MAX_ROWS = 500

export default async function PropertyLeadsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams
  const siteFilter = (sp.site ?? '').trim().toLowerCase()

  const svc = createServiceClient()
  let query = svc
    .from('property_leads')
    .select(
      'id, source_site, listing_url, title, price_text, location, owner_name, contact_phone, contact_email, contact_type, notes, scraped_at, airbnb_url, airbnb_match_basis',
    )
    .order('source_site', { ascending: true })
    .order('id', { ascending: true })
    .limit(MAX_ROWS)
  if (siteFilter) query = query.eq('source_site', siteFilter)
  const { data, error } = await query
  if (error) throw new Error(`Failed to load property leads: ${error.message}`)
  const rows = (data ?? []) as LeadRow[]

  // Per-site chips (always across the FULL table, not the filtered view).
  const { data: siteRows } = await svc.from('property_leads').select('source_site')
  const siteCounts = new Map<string, number>()
  for (const r of (siteRows ?? []) as { source_site: string }[]) {
    siteCounts.set(r.source_site, (siteCounts.get(r.source_site) ?? 0) + 1)
  }
  const sites = [...siteCounts.entries()].sort((a, b) => b[1] - a[1])
  const total = (siteRows ?? []).length
  const withPhone = rows.filter(r => r.contact_phone).length
  const withEmail = rows.filter(r => r.contact_email).length

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          Property Leads
        </h1>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Harvested Malta property-owner leads across{' '}
          {sites.length.toLocaleString()} sources · {total.toLocaleString()} leads
          {siteFilter && ` · showing ${rows.length.toLocaleString()} from ${siteFilter}`}
          {!siteFilter && ` · ${withPhone} with phone · ${withEmail} with email`}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-1">
        <Link
          href="/property-leads"
          className={[
            'rounded-full border px-2.5 py-1 text-[12px]',
            !siteFilter
              ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/15 text-[color:var(--color-text-primary)]'
              : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)]',
          ].join(' ')}
        >
          All ({total})
        </Link>
        {sites.map(([site, count]) => (
          <Link
            key={site}
            href={`/property-leads?site=${encodeURIComponent(site)}`}
            className={[
              'rounded-full border px-2.5 py-1 text-[12px]',
              siteFilter === site
                ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/15 text-[color:var(--color-text-primary)]'
                : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)]',
            ].join(' ')}
          >
            {site} ({count})
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Listing</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Owner / Lister</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Airbnb</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[color:var(--color-text-secondary)]">
                  No property leads{siteFilter ? ` for ${siteFilter}` : ''} yet.
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-[color:var(--color-border)] align-top">
                <td className="whitespace-nowrap px-3 py-2 text-[color:var(--color-text-secondary)]">
                  {r.source_site}
                </td>
                <td className="max-w-80 px-3 py-2">
                  {r.listing_url ? (
                    <a
                      href={r.listing_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                    >
                      <span className="truncate">{r.title ?? r.listing_url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-[color:var(--color-text-secondary)]" />
                    </a>
                  ) : (
                    <span className="text-[color:var(--color-text-primary)]">{r.title ?? '—'}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[color:var(--color-text-primary)]">
                  {r.price_text ?? '—'}
                </td>
                <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">
                  {r.location ?? '—'}
                </td>
                <td className="px-3 py-2 text-[color:var(--color-text-primary)]">
                  {r.owner_name ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {r.contact_phone ? (
                    <a
                      href={`tel:${r.contact_phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1 text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                    >
                      <Phone className="h-3 w-3 text-[color:var(--color-text-secondary)]" />
                      {r.contact_phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.contact_email ? (
                    <a
                      href={`mailto:${r.contact_email}`}
                      className="inline-flex items-center gap-1 text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                    >
                      <Mail className="h-3 w-3 text-[color:var(--color-text-secondary)]" />
                      {r.contact_email}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={[
                      'inline-block rounded-full border px-2 py-0.5 text-[11px] capitalize',
                      r.contact_type === 'owner'
                        ? 'border-green-300 bg-green-50 text-green-800'
                        : r.contact_type === 'agency'
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)]',
                    ].join(' ')}
                  >
                    {r.contact_type}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.airbnb_url ? (
                    <a
                      href={r.airbnb_url}
                      target="_blank"
                      rel="noreferrer"
                      title={
                        r.airbnb_match_basis === 'licence'
                          ? 'Matched by Malta tourism licence number — strong match'
                          : 'Candidate match: host first name + locality — verify manually'
                      }
                      className={[
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                        r.airbnb_match_basis === 'licence'
                          ? 'border-rose-300 bg-rose-50 text-rose-800'
                          : 'border-amber-300 bg-amber-50 text-amber-800',
                      ].join(' ')}
                    >
                      {r.airbnb_match_basis === 'licence' ? 'On Airbnb' : 'Possible'}
                      <ExternalLink className="h-3 w-3" />
                    </a>
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
  )
}
