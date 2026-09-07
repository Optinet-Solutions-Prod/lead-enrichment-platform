import { ExternalLink, Sparkles } from 'lucide-react'
import { applyFilters, applySorts } from '@/lib/filters/apply'
import { PM_PROSPECTS_COLUMNS } from '@/lib/filters/columns-pm-prospects'
import { parseFilters, parseSorts } from '@/lib/filters/serialize'
import { clampPageSize } from '@/lib/page-size'
import { createServiceClient } from '@/lib/supabase/service'
import { AdvancedFilters } from '../_components/advanced-filters'
import { PageIntro } from '../_components/page-intro'
import { Pagination } from '../_components/pagination'
import { SortHeader } from '../_components/sort-header'

export const dynamic = 'force-dynamic'

type ProspectRow = {
  host_id: string
  host_name: string
  listings_count: number
  purest: boolean
  localities: (string | null)[]
  sample_listing_url: string | null
  host_profile_url: string
}

type SearchParams = Record<string, string | string[] | undefined>

const DEFAULT_PAGE_SIZE = 50
/** Soft cap when the pagination UI's "All" (size=0) sentinel is picked. */
const ALL_ROWS_CAP = 10_000

/** Strip ILIKE wildcards (and PostgREST syntax chars) so user input is
 *  treated literally (mirrors /leads). */
function sanitize(q: string): string {
  return q.replace(/[,()*%_\\]/g, '').trim()
}

/** Normalize Maltese town spellings so the register (SAN PAWL IL BAHAR) and
 *  Airbnb (St Paul's Bay) aggregate into one market row. */
function townKey(raw: string | null): string {
  if (!raw) return '—'
  let n = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(malta|gozo)\b/g, '')
    .trim()
  const aliases: Record<string, string> = {
    'st pauls bay': 'san pawl il bahar',
    'saint pauls bay': 'san pawl il bahar',
    bugibba: 'san pawl il bahar',
    qawra: 'san pawl il bahar',
    'st julians': 'san giljan',
    'saint julians': 'san giljan',
    paceville: 'san giljan',
    'il mellieha': 'mellieha',
    marsascala: 'marsaskala',
    'haz zebbug': 'zebbug',
    victoria: 'rabat (gozo)',
    'ir rabat': 'rabat',
  }
  n = aliases[n] ?? n
  return n || '—'
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, c => c.toUpperCase())
}

export default async function PmProspectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q : ''
  const filters = parseFilters(sp.f)
  const sorts = parseSorts(sp.s)
  const sort = typeof sp.sort === 'string' ? sp.sort : ''
  const order: 'asc' | 'desc' = sp.order === 'desc' ? 'desc' : 'asc'
  const page = clampInt(sp.page, 1, 1_000_000, 1)
  const size = clampPageSize(sp.size, DEFAULT_PAGE_SIZE)

  const svc = createServiceClient()
  let query = svc.from('airbnb_pm_prospects').select('*', { count: 'exact' })

  const cleanQ = sanitize(q)
  if (cleanQ.length > 0) {
    query = query.ilike('host_name', `%${cleanQ}%`)
  }

  // Advanced filter rows (`?f=col:op:val`). Validated against the registry.
  if (filters.length > 0) {
    query = applyFilters(query, filters, PM_PROSPECTS_COLUMNS)
  }

  // Sort priority: multi-sort popover (`?s=`) beats the single-column
  // header sort (`?sort=&order=`), which beats the page default.
  if (sorts.length > 0) {
    query = applySorts(query, sorts, PM_PROSPECTS_COLUMNS)
  } else if (sort) {
    query = applySorts(query, [{ col: sort, dir: order }], PM_PROSPECTS_COLUMNS)
  } else {
    query = query
      .order('listings_count', { ascending: false })
      .order('host_name', { ascending: true })
  }
  // Stable tiebreaker so `.range()` pagination never shuffles equal rows.
  query = query.order('host_id', { ascending: true })

  if (size === 0) {
    query = query.range(0, ALL_ROWS_CAP - 1)
  } else {
    const from = Math.max(0, (page - 1) * size)
    query = query.range(from, from + size - 1)
  }

  const [
    { data: prospectsRaw, count, error },
    { count: purestTotal },
    { data: hfpsTowns },
    { data: abLocs },
  ] = await Promise.all([
    query,
    svc
      .from('airbnb_pm_prospects')
      .select('host_id', { head: true, count: 'exact' })
      .eq('purest', true),
    svc.from('hfps_register').select('town'),
    svc.from('airbnb_listings').select('locality'),
  ])
  if (error) throw new Error(`Failed to load PM prospects: ${error.message}`)
  const prospects = (prospectsRaw ?? []) as ProspectRow[]
  const total = count ?? 0
  const purestCount = purestTotal ?? 0

  // Town-level market map: licensed short-let supply vs harvested Airbnb activity.
  const market = new Map<string, { licensed: number; airbnb: number }>()
  for (const r of (hfpsTowns ?? []) as { town: string | null }[]) {
    const k = townKey(r.town)
    const m = market.get(k) ?? { licensed: 0, airbnb: 0 }
    m.licensed++
    market.set(k, m)
  }
  for (const r of (abLocs ?? []) as { locality: string | null }[]) {
    const k = townKey(r.locality)
    const m = market.get(k) ?? { licensed: 0, airbnb: 0 }
    m.airbnb++
    market.set(k, m)
  }
  const marketRows = [...market.entries()]
    .filter(([k]) => k !== '—')
    .sort((a, b) => b[1].licensed - a[1].licensed)
    .slice(0, 25)
  const maxLicensed = Math.max(1, ...marketRows.map(([, v]) => v.licensed))

  return (
    <div className="flex flex-col gap-6 p-4">
      <PageIntro
        title="PM Prospects"
        tier="Derived"
        tagline="Self-managing Airbnb hosts — owners running 1–4 listings themselves, with no agency in between. These are the people most likely to buy property management."
        sourceLine="computed automatically from Airbnb Listings: hosts are grouped by profile, then operators with 5+ listings and lettings-brand names (your competitors) are filtered out. Recomputes on every Airbnb crawl you ingest"
        statsLine={`${total.toLocaleString()} prospects · ${purestCount.toLocaleString()} solo hosts (1–2 listings)`}
        relations={[
          { href: '/airbnb-listings', label: 'The raw Airbnb data behind this' },
          { href: '/property-scrape', label: 'Run a fresh Airbnb crawl' },
        ]}
        learnMore={
          <>
            <p>
              <strong>Why this filter:</strong> big hosts (Haven &amp; Keys, ThreeSIXTY,
              Shortletsmalta…) are property managers already — competitors, not customers. A
              host with one or two listings (the green <em>solo host</em> badge) is almost
              certainly an owner doing check-ins and cleaning themselves.
            </p>
            <p>
              <strong>How to contact them:</strong> the profile link opens their Airbnb page —
              outreach goes through Airbnb messaging, so keep it personal and paced (bulk
              solicitation breaks Airbnb&apos;s rules and gets accounts flagged). Airbnb only
              shows first names and localities, never phones or addresses.
            </p>
            <p>
              <strong>The market map below</strong> compares each town&apos;s licensed
              short-let supply (official register — complete) with our Airbnb sample: the
              towns at the top are where a PM offer has the most doors to knock on.
            </p>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <AdvancedFilters columns={PM_PROSPECTS_COLUMNS} />

        <section className="overflow-x-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                <th className="px-3 py-2"><SortHeader columnKey="host_name" label="Host" sortable /></th>
                <th className="px-3 py-2"><SortHeader columnKey="listings_count" label="Listings" sortable /></th>
                <th className="px-3 py-2">Localities</th>
                <th className="px-3 py-2">Links</th>
              </tr>
            </thead>
            <tbody>
              {prospects.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-[color:var(--color-text-secondary)]">
                    No prospects yet — run an Airbnb harvest first.
                  </td>
                </tr>
              )}
              {prospects.map(p => (
                <tr key={p.host_id} className="border-t border-[color:var(--color-border)] align-top">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-[color:var(--color-text-primary)]">
                      {p.host_name}
                      {p.purest && (
                        <span
                          title="1–2 listings — clearest self-managed owner"
                          className="inline-flex items-center gap-0.5 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          solo host
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[color:var(--color-text-primary)]">
                    {p.listings_count}
                  </td>
                  <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">
                    {p.localities.filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <a
                      href={p.host_profile_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                    >
                      profile <ExternalLink className="h-3 w-3 text-[color:var(--color-text-secondary)]" />
                    </a>
                    {p.sample_listing_url && (
                      <>
                        {' · '}
                        <a
                          href={p.sample_listing_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[color:var(--color-text-secondary)] underline-offset-2 hover:underline"
                        >
                          listing <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <Pagination page={page} size={size} total={total} />
      </div>

      <section>
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
          Market map — where short-let supply concentrates
        </h2>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Licensed HFPS premises per town (official register, complete) next to the Airbnb
          listings we harvested (sample). High-supply towns are where PM outreach lands best.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                <th className="px-3 py-2">Town</th>
                <th className="px-3 py-2">Licensed short-lets</th>
                <th className="px-3 py-2 w-1/3">Supply</th>
                <th className="px-3 py-2">Airbnb (harvested)</th>
              </tr>
            </thead>
            <tbody>
              {marketRows.map(([town, v]) => (
                <tr key={town} className="border-t border-[color:var(--color-border)]">
                  <td className="px-3 py-2 text-[color:var(--color-text-primary)]">
                    {titleCase(town)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[color:var(--color-text-primary)]">
                    {v.licensed.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-bg-secondary)]">
                      <span
                        className="block h-full rounded-full bg-[color:var(--color-accent)]"
                        style={{ width: `${Math.round((v.licensed / maxLicensed) * 100)}%` }}
                      />
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[color:var(--color-text-secondary)]">
                    {v.airbnb.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
