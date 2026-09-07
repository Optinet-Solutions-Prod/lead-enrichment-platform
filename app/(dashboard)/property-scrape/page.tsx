import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { RunForm } from './_components/run-form'

export const dynamic = 'force-dynamic'
// The on-demand scrapes do bounded external HTTP work (source APIs, detail
// pages, the MTA CSVs) — give them room past the default serverless budget.
export const maxDuration = 60

export default async function PropertyScrapePage() {
  const svc = createServiceClient()
  const [{ count: leads }, { count: listings }, { count: register }] = await Promise.all([
    svc.from('property_leads').select('id', { count: 'exact', head: true }),
    svc.from('airbnb_listings').select('id', { count: 'exact', head: true }),
    svc.from('hfps_register').select('ref', { count: 'exact', head: true }),
  ])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          Property Scrape
        </h1>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Pull fresh property-owner leads from the Malta sources. Runs happen right here on
          the server (Airbnb runs on Apify) and merge into your datasets — re-running only
          adds listings you haven&apos;t seen.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 text-[12px]">
        <Link
          href="/property-leads"
          className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)]"
        >
          Property Leads ({(leads ?? 0).toLocaleString()})
        </Link>
        <Link
          href="/airbnb-listings"
          className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)]"
        >
          Airbnb Listings ({(listings ?? 0).toLocaleString()})
        </Link>
        <Link
          href="/hfps-register"
          className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)]"
        >
          Short-Let Register ({(register ?? 0).toLocaleString()})
        </Link>
        <Link
          href="/pm-prospects"
          className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)]"
        >
          PM Prospects
        </Link>
      </div>

      <RunForm />
    </div>
  )
}
