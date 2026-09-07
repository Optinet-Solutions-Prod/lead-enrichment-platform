import { ExternalLink } from 'lucide-react'
import type { MaltaparkListingRow } from '../_lib/queries'

type Props = {
  rows: MaltaparkListingRow[]
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : '—'
}

export function MaltaparkListingsTable({ rows }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
            <th className="px-3 py-2">Photo</th>
            <th className="px-3 py-2">Listing</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2">Listing ID</th>
            <th className="px-3 py-2">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.listing_id} className="border-t border-[color:var(--color-border)]">
              <td className="px-3 py-2">
                {r.thumbnail_url ? (
                  // Plain <img>: external host, tiny thumbs — not worth next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbnail_url}
                    alt=""
                    loading="lazy"
                    className="h-10 w-14 rounded object-cover"
                  />
                ) : (
                  <div className="h-10 w-14 rounded bg-[color:var(--color-bg-secondary)]" />
                )}
              </td>
              <td className="max-w-96 px-3 py-2">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[color:var(--color-text-primary)] underline-offset-2 hover:underline"
                >
                  <span className="truncate">{r.title ?? `Listing ${r.listing_id}`}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-[color:var(--color-text-secondary)]" />
                </a>
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[color:var(--color-text-primary)]">
                {r.price_text ?? '—'}
              </td>
              <td className="px-3 py-2 tabular-nums text-[color:var(--color-text-secondary)]">
                {r.listing_id}
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[color:var(--color-text-secondary)]">
                {fmtDate(r.last_seen_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
