import Link from 'next/link'
import {
  ArrowRight,
  BedDouble,
  Building2,
  Coins,
  Handshake,
  LifeBuoy,
  MapPinned,
  Play,
  Search,
  TicketPercent,
  Workflow,
} from 'lucide-react'
import { redirect } from 'next/navigation'
import { getBillingEnabled } from '@/lib/billing'
import { CREDIT_COSTS } from '@/lib/credits'
import { getOrgContext } from '@/lib/orgs/context'

export const dynamic = 'force-dynamic'

/** User-facing help for the SaaS product. The old build-internals doc this
 *  replaces lives on in git history; per-page "About this data" intros stay
 *  as the contextual layer. */
export default async function HelpPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/welcome')
  const isProperty = ctx.modules.includes('property')
  const billingEnabled = await getBillingEnabled()

  const journey = [
    {
      icon: Search,
      title: '1 · Collect Data',
      href: '/property-scrape',
      body: 'Tick sources and scrape. Direct-from-owner sites give a name + phone per listing; Maltapark mines phones from ad text; the MTA register and Airbnb crawl fill the market datasets.',
    },
    {
      icon: Building2,
      title: '2 · Owner Leads',
      href: '/property-leads',
      body: 'Every owner with contact details, deduplicated per listing. Filter to owners with a phone and start personal outreach — call, WhatsApp, email.',
    },
    {
      icon: MapPinned,
      title: '3 · Short-Let Register & Airbnb',
      href: '/hfps-register',
      body: 'The official licence register (every legal short-let address) and the live Airbnb inventory. Reference layers the prospect list is built from.',
    },
    {
      icon: Handshake,
      title: '4 · PM Prospects',
      href: '/pm-prospects',
      body: 'Self-managing Airbnb hosts — people running 1–4 listings without an agency. The warmest audience for a property-management pitch.',
    },
    {
      icon: Workflow,
      title: '5 · Workflows',
      href: '/pipeline',
      body: 'Save your go-to combination (sources + keyword + Airbnb cross-match) as a recipe and run the whole thing with one click.',
    },
  ]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <header>
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          Help &amp; Docs
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[color:var(--color-text-primary)]">
          How the platform fits together, what things cost, and where to get help. Every data
          page also explains itself under “About this data”.
        </p>
      </header>

      {isProperty && (
        <Link
          href="/property-scrape?tour=1"
          className="flex items-center gap-3 rounded-lg border border-[color:var(--color-accent-hover)] bg-[color:var(--color-bg-primary)] p-4 ring-1 ring-[color:var(--color-accent-hover)] transition-colors hover:bg-[color:var(--color-bg-secondary)]"
        >
          <Play className="h-5 w-5 shrink-0 text-[color:var(--color-accent-hover)]" />
          <span>
            <span className="block text-[14px] font-medium text-[color:var(--color-text-primary)]">
              Take the 60-second tour
            </span>
            <span className="block text-[12px] text-[color:var(--color-text-secondary)]">
              A step-by-step walkthrough of the whole pipeline — skippable any time, restart it
              here whenever you like.
            </span>
          </span>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-[color:var(--color-text-secondary)]" />
        </Link>
      )}

      {isProperty && (
        <section>
          <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
            The journey in five steps
          </h2>
          <div className="mt-2 flex flex-col gap-2">
            {journey.map(j => (
              <Link
                key={j.title}
                href={j.href}
                className="group flex items-start gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-3 hover:bg-[color:var(--color-bg-secondary)]"
              >
                <j.icon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-text-secondary)]" />
                <span>
                  <span className="flex items-center gap-1 text-[13px] font-medium text-[color:var(--color-text-primary)]">
                    {j.title}
                    <ArrowRight className="h-3 w-3 text-[color:var(--color-text-secondary)] transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="block text-[12px] text-[color:var(--color-text-secondary)]">
                    {j.body}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {billingEnabled && (
        <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
          <h2 className="flex items-center gap-2 text-[14px] font-medium text-[color:var(--color-text-primary)]">
            <Coins className="h-4 w-4" />
            Credits in one paragraph
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">
            Every scrape debits your organization&apos;s balance up-front: {CREDIT_COSTS.source_run}{' '}
            credit per source run, {CREDIT_COSTS.mta_refresh} for a licence-register refresh,{' '}
            {CREDIT_COSTS.airbnb_start_byo} for an Airbnb crawl on your own Apify key (
            {CREDIT_COSTS.airbnb_start_platform} on the platform key), cross-matching is free.
            New workspaces start with 100 free credits. Balance, price list, packs and the full
            ledger live under{' '}
            <Link href="/settings/billing" className="underline underline-offset-2">
              Billing &amp; Credits
            </Link>
            .
          </p>
        </section>
      )}

      <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
        <h2 className="flex items-center gap-2 text-[14px] font-medium text-[color:var(--color-text-primary)]">
          <TicketPercent className="h-4 w-4" />
          Bring your own sources &amp; integrations
        </h2>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">
          <li>
            <strong className="text-[color:var(--color-text-primary)]">Custom sources:</strong> any
            JSON API that lists properties can become a source — download the YAML template on{' '}
            <Link href="/property-scrape" className="underline underline-offset-2">Collect Data</Link>,
            map the fields, upload.
          </li>
          <li>
            <strong className="text-[color:var(--color-text-primary)]">Integrations:</strong> connect
            your own third-party accounts (Apify first) under{' '}
            <Link href="/settings/integrations" className="underline underline-offset-2">Integrations</Link>{' '}
            — credentials stay per-organization and are only used server-side.
          </li>
          <li>
            <strong className="text-[color:var(--color-text-primary)]">Team:</strong> invite
            teammates, change roles, or transfer ownership under{' '}
            <Link href="/settings/organization" className="underline underline-offset-2">Team &amp; Users</Link>.
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
        <h2 className="flex items-center gap-2 text-[14px] font-medium text-[color:var(--color-text-primary)]">
          <LifeBuoy className="h-4 w-4" />
          Stuck? Talk to a human
        </h2>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Email{' '}
          <a
            href="mailto:admin@optinetsolutions.com?subject=Lead%20Engine%20support"
            className="underline underline-offset-2 hover:text-[color:var(--color-text-primary)]"
          >
            admin@optinetsolutions.com
          </a>{' '}
          and include the page you were on plus what you expected to happen. There&apos;s also a
          feedback button on the bottom-right of every page — screenshots welcome.
        </p>
      </section>

      {!isProperty && (
        <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
          <h2 className="flex items-center gap-2 text-[14px] font-medium text-[color:var(--color-text-primary)]">
            <BedDouble className="h-4 w-4" />
            Affiliate workspace
          </h2>
          <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
            This workspace runs the affiliate toolkit: search-result scraping under{' '}
            <Link href="/scrape" className="underline underline-offset-2">Scrape</Link>, results under{' '}
            <Link href="/leads" className="underline underline-offset-2">Leads</Link>, captcha clearing
            under Interactive Checkpoints, and per-country browser profiles under Country Profiles.
          </p>
        </section>
      )}
    </div>
  )
}
