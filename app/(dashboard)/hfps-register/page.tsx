import { applyFilters, applySorts } from '@/lib/filters/apply'
import { HFPS_COLUMNS } from '@/lib/filters/columns-hfps'
import { parseFilters, parseSorts } from '@/lib/filters/serialize'
import { clampPageSize } from '@/lib/page-size'
import { createServiceClient } from '@/lib/supabase/service'
import { AdvancedFilters } from '../_components/advanced-filters'
import { PageIntro } from '../_components/page-intro'
import { Pagination } from '../_components/pagination'
import { SortHeader } from '../_components/sort-header'

export const dynamic = 'force-dynamic'

type RegRow = {
  ref: string
  island: string | null
  establishment: string | null
  house_no: string | null
  street: string | null
  town: string | null
  bedrooms: number | null
  beds: number | null
}

type SearchParams = Record<string, string | string[] | undefined>

const DEFAULT_PAGE_SIZE = 50
/** Soft cap when the pagination UI's "All" (size=0) sentinel is picked. */
const ALL_ROWS_CAP = 10_000

const SEARCHABLE_COLUMNS = ['town', 'street', 'establishment', 'ref']

/** Strip PostgREST `.or()` syntax chars plus ILIKE wildcards so user input
 *  is treated literally (mirrors /leads and this page's original search). */
function sanitize(q: string): string {
  return q.replace(/[,()*%_\\]/g, '').trim()
}

export default async function HfpsRegisterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const filters = parseFilters(sp.f)
  const sorts = parseSorts(sp.s)
  const sort = typeof sp.sort === 'string' ? sp.sort : ''
  const order: 'asc' | 'desc' = sp.order === 'desc' ? 'desc' : 'asc'
  const page = clampInt(sp.page, 1, 1_000_000, 1)
  const size = clampPageSize(sp.size, DEFAULT_PAGE_SIZE)

  const svc = createServiceClient()

  // Typed as plain `string` so supabase-js doesn't parse the literal into a
  // deep generic (TS2589 when the builder is threaded through applyFilters).
  const cols: string = 'ref, island, establishment, house_no, street, town, bedrooms, beds'
  let query = svc.from('hfps_register').select(cols, { count: 'exact' })

  const cleanQ = sanitize(q)
  if (cleanQ.length > 0) {
    const like = `%${cleanQ}%`
    query = query.or(SEARCHABLE_COLUMNS.map(c => `${c}.ilike.${like}`).join(','))
  }

  // Advanced filter rows (`?f=col:op:val`). Validated against the registry.
  if (filters.length > 0) {
    query = applyFilters(query, filters, HFPS_COLUMNS)
  }

  // Sort priority: multi-sort popover (`?s=`) beats the single-column
  // header sort (`?sort=&order=`), which beats the page default.
  if (sorts.length > 0) {
    query = applySorts(query, sorts, HFPS_COLUMNS)
  } else if (sort) {
    query = applySorts(query, [{ col: sort, dir: order }], HFPS_COLUMNS)
  } else {
    query = query
      .order('town', { ascending: true })
      .order('street', { ascending: true })
  }
  // Stable tiebreaker (the PK is `ref` — no id column) so `.range()`
  // pagination never shuffles equal rows.
  query = query.order('ref', { ascending: true })

  if (size === 0) {
    query = query.range(0, ALL_ROWS_CAP - 1)
  } else {
    const from = Math.max(0, (page - 1) * size)
    query = query.range(from, from + size - 1)
  }

  const [{ data, count, error }, { count: total }] = await Promise.all([
    query,
    // Whole-register count for the header, independent of any filter.
    svc.from('hfps_register').select('ref', { count: 'exact', head: true }),
  ])
  if (error) throw new Error(`Failed to load HFPS register: ${error.message}`)
  const rows = (data ?? []) as unknown as RegRow[]
  const filteredTotal = count ?? 0

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageIntro
        title="Short-Let Register"
        tier="Tier 1"
        tagline="The Malta Tourism Authority's official register of licensed holiday premises. Every address here is a legally operating short-let — which means every row is a confirmed target customer for property management."
        sourceLine="downloaded from mta.com.mt's public licence CSVs (HFPS Malta + Gozo) — refresh it any time from Collect Data"
        statsLine={`${(total ?? 0).toLocaleString()} licensed premises`}
        relations={[
          { href: '/property-scrape', label: 'Refresh the register' },
          { href: '/airbnb-listings', label: 'Airbnb listings showing a licence match here' },
          { href: '/pm-prospects', label: 'Town supply feeds the market map' },
        ]}
        learnMore={
          <>
            <p>
              <strong>What&apos;s in a row:</strong> licence ref, premises name, full street
              address, town, island and bed count. The register does NOT publish phone
              numbers or emails — the government keeps those private.
            </p>
            <p>
              <strong>How to use it (plan step 3 — scale):</strong> this is the
              highest-quality volume list: 8,000+ verified operator addresses. The clean
              channels are direct mail to the premises address, and enrichment — matching an
              address or premises name against Owner Leads, Airbnb, Maltapark or Facebook to
              find the operator&apos;s name and number.
            </p>
            <p>
              <strong>Quality note:</strong> multiple flats in one block often share a house
              number with different premises names — that&apos;s one operator with several
              licences, a particularly good prospect.
            </p>
          </>
        }
      />

      <AdvancedFilters columns={HFPS_COLUMNS} />

      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              <th className="px-3 py-2"><SortHeader columnKey="ref" label="Licence" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="establishment" label="Premises" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="house_no" label="No." sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="street" label="Street" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="town" label="Town" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="island" label="Island" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="beds" label="Beds" sortable /></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[color:var(--color-text-secondary)]">
                  {q ? `No register entries match “${q}”.` : 'Register is empty.'}
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.ref} className="border-t border-[color:var(--color-border)]">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px] text-[color:var(--color-text-secondary)]">
                  {r.ref}
                </td>
                <td className="px-3 py-2 text-[color:var(--color-text-primary)]">
                  {r.establishment ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[color:var(--color-text-secondary)]">
                  {r.house_no ?? '—'}
                </td>
                <td className="px-3 py-2 text-[color:var(--color-text-primary)]">
                  {r.street ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[color:var(--color-text-secondary)]">
                  {r.town ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[color:var(--color-text-secondary)]">
                  {r.island ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[color:var(--color-text-secondary)]">
                  {r.beds ?? '—'}
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
