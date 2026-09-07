import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { applyFilters, applySorts } from '@/lib/filters/apply'
import { AIRBNB_LISTINGS_COLUMNS } from '@/lib/filters/columns-airbnb'
import { parseFilters, parseSorts } from '@/lib/filters/serialize'
import { clampPageSize } from '@/lib/page-size'
import { createServiceClient } from '@/lib/supabase/service'
import { AdvancedFilters } from '../_components/advanced-filters'
import { Pagination } from '../_components/pagination'
import { SortHeader } from '../_components/sort-header'

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

type SearchParams = Record<string, string | string[] | undefined>

const DEFAULT_PAGE_SIZE = 50
/** Soft cap when the pagination UI's "All" (size=0) sentinel is picked. */
const ALL_ROWS_CAP = 10_000
const MAX_CHIPS = 20

const SEARCHABLE_COLUMNS = ['title', 'host_name', 'locality']

/** Strip PostgREST `.or()` syntax chars plus ILIKE wildcards so user input
 *  is treated literally (mirrors /leads). */
function sanitize(q: string): string {
  return q.replace(/[,()*%_\\]/g, '').trim()
}

export default async function AirbnbListingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const locFilter = typeof sp.loc === 'string' ? sp.loc.trim() : ''
  const q = typeof sp.q === 'string' ? sp.q : ''
  const filters = parseFilters(sp.f)
  const sorts = parseSorts(sp.s)
  const sort = typeof sp.sort === 'string' ? sp.sort : ''
  const order: 'asc' | 'desc' = sp.order === 'desc' ? 'desc' : 'asc'
  const page = clampInt(sp.page, 1, 1_000_000, 1)
  const size = clampPageSize(sp.size, DEFAULT_PAGE_SIZE)

  const svc = createServiceClient()
  // Typed as plain `string` so supabase-js doesn't parse the literal into a
  // deep generic (TS2589 when the builder is threaded through applyFilters).
  const cols: string =
    'id, airbnb_id, url, title, host_name, locality, price_text, room_type, scraped_at'
  let query = svc.from('airbnb_listings').select(cols, { count: 'exact' })
  if (locFilter) query = query.eq('locality', locFilter)

  const cleanQ = sanitize(q)
  if (cleanQ.length > 0) {
    const or = SEARCHABLE_COLUMNS.map(c => `${c}.ilike.%${cleanQ}%`).join(',')
    query = query.or(or)
  }

  // Advanced filter rows (`?f=col:op:val`). Validated against the registry.
  if (filters.length > 0) {
    query = applyFilters(query, filters, AIRBNB_LISTINGS_COLUMNS)
  }

  // Sort priority: multi-sort popover (`?s=`) beats the single-column
  // header sort (`?sort=&order=`), which beats the page default.
  if (sorts.length > 0) {
    query = applySorts(query, sorts, AIRBNB_LISTINGS_COLUMNS)
  } else if (sort) {
    query = applySorts(query, [{ col: sort, dir: order }], AIRBNB_LISTINGS_COLUMNS)
  } else {
    query = query.order('locality', { ascending: true })
  }
  // Stable tiebreaker so `.range()` pagination never shuffles equal rows.
  query = query.order('id', { ascending: true })

  if (size === 0) {
    query = query.range(0, ALL_ROWS_CAP - 1)
  } else {
    const from = Math.max(0, (page - 1) * size)
    query = query.range(from, from + size - 1)
  }

  const [{ data, count, error }, { data: locRows }] = await Promise.all([
    query,
    // Locality chips (always across the FULL table, not the filtered view).
    svc.from('airbnb_listings').select('locality'),
  ])
  if (error) throw new Error(`Failed to load Airbnb listings: ${error.message}`)
  const rows = (data ?? []) as unknown as ListingRow[]
  const filteredTotal = count ?? 0

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

      <AdvancedFilters columns={AIRBNB_LISTINGS_COLUMNS} preserve={['loc']} />

      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              <th className="px-3 py-2"><SortHeader columnKey="title" label="Listing" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="host_name" label="Host" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="locality" label="Locality" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="price_text" label="Price" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="room_type" label="Room type" sortable /></th>
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

      <Pagination page={page} size={size} total={filteredTotal} />
    </div>
  )
}

function clampInt(
  raw: string | string[] | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof raw !== 'string') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}
