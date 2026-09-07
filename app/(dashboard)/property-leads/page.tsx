import Link from 'next/link'
import { ExternalLink, Mail, Phone } from 'lucide-react'
import { applyFilters, applySorts } from '@/lib/filters/apply'
import { PROPERTY_LEADS_COLUMNS } from '@/lib/filters/columns-property-leads'
import { parseFilters, parseSorts } from '@/lib/filters/serialize'
import { clampPageSize } from '@/lib/page-size'
import { createServiceClient } from '@/lib/supabase/service'
import { AdvancedFilters } from '../_components/advanced-filters'
import { PageIntro } from '../_components/page-intro'
import { Pagination } from '../_components/pagination'
import { SortHeader } from '../_components/sort-header'

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

type SearchParams = Record<string, string | string[] | undefined>

const DEFAULT_PAGE_SIZE = 50
/** Soft cap when the pagination UI's "All" (size=0) sentinel is picked. */
const ALL_ROWS_CAP = 10_000

const SEARCHABLE_COLUMNS = [
  'title',
  'location',
  'owner_name',
  'contact_phone',
  'contact_email',
  'source_site',
]

/** Strip PostgREST `.or()` syntax chars plus ILIKE wildcards so user input
 *  is treated literally (mirrors /leads). */
function sanitize(q: string): string {
  return q.replace(/[,()*%_\\]/g, '').trim()
}

export default async function PropertyLeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const siteFilter =
    typeof sp.site === 'string' ? sp.site.trim().toLowerCase() : ''
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
    'id, source_site, listing_url, title, price_text, location, owner_name, contact_phone, contact_email, contact_type, notes, scraped_at, airbnb_url, airbnb_match_basis'
  let query = svc.from('property_leads').select(cols, { count: 'exact' })
  if (siteFilter) query = query.eq('source_site', siteFilter)

  const cleanQ = sanitize(q)
  if (cleanQ.length > 0) {
    const or = SEARCHABLE_COLUMNS.map(c => `${c}.ilike.%${cleanQ}%`).join(',')
    query = query.or(or)
  }

  // Advanced filter rows (`?f=col:op:val`). Validated against the registry.
  if (filters.length > 0) {
    query = applyFilters(query, filters, PROPERTY_LEADS_COLUMNS)
  }

  // Sort priority: multi-sort popover (`?s=`) beats the single-column
  // header sort (`?sort=&order=`), which beats the page default.
  if (sorts.length > 0) {
    query = applySorts(query, sorts, PROPERTY_LEADS_COLUMNS)
  } else if (sort) {
    query = applySorts(query, [{ col: sort, dir: order }], PROPERTY_LEADS_COLUMNS)
  } else {
    query = query.order('source_site', { ascending: true })
  }
  // Stable tiebreaker so `.range()` pagination never shuffles equal rows.
  query = query.order('id', { ascending: true })

  if (size === 0) {
    query = query.range(0, ALL_ROWS_CAP - 1)
  } else {
    const from = Math.max(0, (page - 1) * size)
    query = query.range(from, from + size - 1)
  }

  const [
    { data, count, error },
    { data: siteRows },
    { count: phoneCount },
    { count: emailCount },
  ] = await Promise.all([
    query,
    // Per-site chips (always across the FULL table, not the filtered view).
    svc.from('property_leads').select('source_site'),
    svc
      .from('property_leads')
      .select('id', { head: true, count: 'exact' })
      .not('contact_phone', 'is', null)
      .neq('contact_phone', ''),
    svc
      .from('property_leads')
      .select('id', { head: true, count: 'exact' })
      .not('contact_email', 'is', null)
      .neq('contact_email', ''),
  ])
  if (error) throw new Error(`Failed to load property leads: ${error.message}`)
  const rows = (data ?? []) as unknown as LeadRow[]
  const filteredTotal = count ?? 0

  const siteCounts = new Map<string, number>()
  for (const r of (siteRows ?? []) as { source_site: string }[]) {
    siteCounts.set(r.source_site, (siteCounts.get(r.source_site) ?? 0) + 1)
  }
  const sites = [...siteCounts.entries()].sort((a, b) => b[1] - a[1])
  const total = (siteRows ?? []).length
  const withPhone = phoneCount ?? 0
  const withEmail = emailCount ?? 0

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageIntro
        title="Owner Leads"
        tier="Tier 2"
        tagline="Malta property owners you can contact TODAY — names, phone numbers and emails, mostly people listing their own property without an agent. This is your outreach list."
        sourceLine={`scraped from ${sites.length} direct-from-owner sites and classifieds (HomesInMalta, PropertiesFromOwner, Maltapark ad text, the MTA hotel register, and a one-off 17-site harvest) — run fresh pulls from Collect Data`}
        statsLine={
          siteFilter
            ? `showing ${filteredTotal.toLocaleString()} from ${siteFilter}`
            : `${total.toLocaleString()} leads · ${withPhone} with phone · ${withEmail} with email`
        }
        relations={[
          { href: '/property-scrape', label: 'Collect more leads' },
          { href: '/airbnb-listings', label: 'Airbnb column cross-matches these listings' },
        ]}
        learnMore={
          <>
            <p>
              <strong>Where each row comes from:</strong> the source column names the website
              it was scraped from; click a chip below to see one site&apos;s leads. Phone
              numbers were published by the owners themselves in their listings — on
              &quot;by owner&quot; sites they&apos;re in the listing data, on Maltapark we
              mine them from the ad text (the official reveal is captcha-gated).
            </p>
            <p>
              <strong>The Airbnb column:</strong> we compared every lead against our Airbnb
              harvest. A red &quot;On Airbnb&quot; badge is a strong match; amber
              &quot;Possible&quot; means the host&apos;s first name + locality line up —
              verify before assuming. We also checked all street addresses against the
              official licence register: none of these leads are licensed short-lets, which
              makes sense — most are selling, not hosting.
            </p>
            <p>
              <strong>What to do with it (plan steps 1–2):</strong> filter to leads with a
              phone, pick 30–50, and run a personal outreach round — call or WhatsApp,
              pitching management for their property. Track who responds before scaling.
            </p>
          </>
        }
      />

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

      <AdvancedFilters columns={PROPERTY_LEADS_COLUMNS} preserve={['site']} />

      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
        <table className="w-full min-w-[1080px] text-left text-[13px]">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              <th className="px-3 py-2"><SortHeader columnKey="source_site" label="Source" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="title" label="Listing" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="price_text" label="Price" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="location" label="Location" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="owner_name" label="Owner / Lister" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="contact_phone" label="Phone" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="contact_email" label="Email" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="contact_type" label="Type" sortable /></th>
              <th className="px-3 py-2"><SortHeader columnKey="airbnb_match_basis" label="Airbnb" sortable /></th>
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
                <td className="px-3 py-2">
                  {r.listing_url ? (
                    <a
                      href={r.listing_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                    >
                      <span title={r.title ?? r.listing_url ?? undefined} className="inline-block max-w-[22rem] truncate align-bottom">{r.title ?? r.listing_url}</span>
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
                  <span title={r.location ?? undefined} className="inline-block max-w-[14rem] truncate align-bottom">{r.location ?? '—'}</span>
                </td>
                <td className="px-3 py-2 text-[color:var(--color-text-primary)]">
                  <span title={r.owner_name ?? undefined} className="inline-block max-w-[12rem] truncate align-bottom">{r.owner_name ?? '—'}</span>
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
