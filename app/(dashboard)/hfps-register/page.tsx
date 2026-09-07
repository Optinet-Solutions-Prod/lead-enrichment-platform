import { createServiceClient } from '@/lib/supabase/service'

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

type SearchParams = Promise<{ q?: string }>

const MAX_ROWS = 200

export default async function HfpsRegisterPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim()

  const svc = createServiceClient()
  const { count: total } = await svc
    .from('hfps_register')
    .select('ref', { count: 'exact', head: true })

  let query = svc
    .from('hfps_register')
    .select('ref, island, establishment, house_no, street, town, bedrooms, beds')
    .order('town', { ascending: true })
    .order('street', { ascending: true })
    .limit(MAX_ROWS)
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`
    query = query.or(
      `town.ilike.${like},street.ilike.${like},establishment.ilike.${like},ref.ilike.${like}`,
    )
  }
  const { data, error } = await query
  if (error) throw new Error(`Failed to load HFPS register: ${error.message}`)
  const rows = (data ?? []) as RegRow[]

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          Licensed Short-Lets (MTA HFPS Register)
        </h1>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          {(total ?? 0).toLocaleString()} licensed holiday-premises addresses across Malta and
          Gozo — the official register every legal Airbnb-style rental must be on. Used to
          cross-match Property Leads addresses.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search town, street, premises name, or licence ref…"
          className="w-full max-w-md rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-secondary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
        />
        <button
          type="submit"
          className="rounded-md border border-[color:var(--color-border)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-secondary)]"
        >
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              <th className="px-3 py-2">Licence</th>
              <th className="px-3 py-2">Premises</th>
              <th className="px-3 py-2">No.</th>
              <th className="px-3 py-2">Street</th>
              <th className="px-3 py-2">Town</th>
              <th className="px-3 py-2">Island</th>
              <th className="px-3 py-2">Beds</th>
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
      {rows.length === MAX_ROWS && (
        <p className="text-[12px] text-[color:var(--color-text-secondary)]">
          Showing the first {MAX_ROWS} — refine the search to see specific entries.
        </p>
      )}
    </div>
  )
}
