import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

type ListingRow = {
  id: number
  airbnb_id: string | null
  url: string | null
  title: string | null
  host_name: string | null
  locality: string | null
  price_text: string | null
  room_type: string | null
  scraped_at: string
}

type SearchParams = Promise<{ loc?: string }>

const MAX_ROWS = 600
const MAX_CHIPS = 20

export default async function AirbnbListingsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams
  const locFilter = (sp.loc ?? '').trim()

  const svc = createServiceClient()
  let query = svc
    .from('airbnb_listings')
    .select('id, airbnb_id, url, title, host_name, locality, price_text, room_type, scraped_at')
    .order('locality', { ascending: true })
    .order('id', { ascending: true })
    .limit(MAX_ROWS)
  if (locFilter) query = query.eq('locality', locFilter)
  const { data, error } = await query
  if (error) throw new Error(`Failed to load Airbnb listings: ${error.message}`)
  const rows = (data ?? []) as ListingRow[]

  const { data: locRows } = await svc.from('airbnb_listings').select('locality')
  const locCounts = new Map<string, number>()
  for (const r of (locRows ?? []) as { locality: string | null }[]) {
    const key = r.locality ?? '—'
    locCounts.set(key, (locCounts.get(key) ?? 0) + 1)
  }
  const total = (locRows ?? []).length
  const locs = [...locCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CHIPS)

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          Airbnb Listings (Malta)
        </h1>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          {total.toLocaleString()} listings harvested via Apify · host names + localities feed
          the Property Leads cross-match. Airbnb hides exact addresses and host surnames.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-1">
        <Link
          href="/airbnb-listings"
          className={[
            'rounded-full border px-2.5 py-1 text-[12px]',
            !locFilter
              ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/15 text-[color:var(--color-text-primary)]'
              : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)]',
          ].join(' ')}
        >
          All ({total})
        </Link>
        {locs.map(([loc, count]) => (
          <Link
            key={loc}
            href={`/airbnb-listings?loc=${encodeURIComponent(loc)}`}
            className={[
              'rounded-full border px-2.5 py-1 text-[12px]',
              locFilter === loc
                ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/15 text-[color:var(--color-text-primary)]'
                : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)]',
            ].join(' ')}
          >
            {loc} ({count})
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              <th className="px-3 py-2">Listing</th>
              <th className="px-3 py-2">Host</th>
              <th className="px-3 py-2">Locality</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Room type</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[color:var(--color-text-secondary)]">
                  No Airbnb listings{locFilter ? ` in ${locFilter}` : ''} harvested yet.
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-[color:var(--color-border)] align-top">
                <td className="max-w-96 px-3 py-2">
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                    >
                      <span className="truncate">{r.title ?? `Listing ${r.airbnb_id}`}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-[color:var(--color-text-secondary)]" />
                    </a>
                  ) : (
                    <span>{r.title ?? '—'}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[color:var(--color-text-primary)]">
                  {r.host_name ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[color:var(--color-text-secondary)]">
                  {r.locality ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[color:var(--color-text-primary)]">
                  {r.price_text ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[color:var(--color-text-secondary)]">
                  {r.room_type ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === MAX_ROWS && (
        <p className="text-[12px] text-[color:var(--color-text-secondary)]">
          Showing the first {MAX_ROWS} — narrow by locality to see the rest.
        </p>
      )}
    </div>
  )
}
