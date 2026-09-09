import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, ShieldCheck } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getCreditsBalance } from '@/lib/credits'
import { getOrgContext } from '@/lib/orgs/context'
import { listSourceDefs } from '@/lib/sources/custom'
import { SOURCE_TEMPLATE_YAML } from '@/lib/sources/template'
import { createServiceClient } from '@/lib/supabase/service'
import { ManageSources } from './_components/manage-sources'
import { RunForm } from './_components/run-form'

export const dynamic = 'force-dynamic'
// The on-demand scrapes do bounded external HTTP work (source APIs, detail
// pages, the MTA CSVs) — give them room past the default serverless budget.
export const maxDuration = 60

/** The four datasets, in the order data flows through them. */
const FLOW = [
  {
    href: '/property-leads',
    label: 'Owner Leads',
    desc: 'owners with a phone/email you can contact',
  },
  { href: '/hfps-register', label: 'Short-Let Register', desc: 'every licensed short-let address' },
  { href: '/airbnb-listings', label: 'Airbnb Listings', desc: 'live host + listing inventory' },
  { href: '/pm-prospects', label: 'PM Prospects', desc: 'self-managing hosts (derived)' },
]

export default async function PropertyScrapePage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/welcome')
  const svc = createServiceClient()
  const [
    { count: leads },
    { count: leadsWithPhone },
    { count: listings },
    { count: register },
    { count: prospects },
  ] = await Promise.all([
    svc.from('property_leads').select('id', { count: 'exact', head: true }).eq('org_id', ctx.orgId),
    svc
      .from('property_leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.orgId)
      .not('contact_phone', 'is', null),
    svc.from('airbnb_listings').select('id', { count: 'exact', head: true }).eq('org_id', ctx.orgId),
    svc.from('hfps_register').select('ref', { count: 'exact', head: true }),
    svc.from('airbnb_pm_prospects').select('host_id', { count: 'exact', head: true }).eq('org_id', ctx.orgId),
  ])

  const [customDefs, balance] = await Promise.all([
    listSourceDefs(ctx.orgId),
    getCreditsBalance(ctx.orgId),
  ])
  const canManage = ctx.orgRole === 'owner' || ctx.orgRole === 'admin'
  const customSources = customDefs.map(d => ({
    key: d.key,
    name: d.definition.name,
    blurb: d.definition.description ?? new URL(d.definition.request.url).hostname,
  }))

  const phoneLeads = leadsWithPhone ?? 0
  const pilotReady = phoneLeads >= 30

  const steps = [
    {
      n: 1,
      title: 'Build the pilot batch',
      body: `Collect 30–50 owners with real contact details from the direct-from-owner sites below. You have ${phoneLeads} with a phone number.`,
      done: pilotReady,
      cta: pilotReady
        ? { href: '/property-leads?f=contact_phone%3Anotempty', label: 'Open your contactable owners' }
        : null,
    },
    {
      n: 2,
      title: 'Test outreach',
      body: 'Send a small, personal round (call / WhatsApp / email from the Owner Leads page) and track who replies — validate the message before scaling.',
      done: false,
      cta: { href: '/property-leads?f=contact_phone%3Anotempty', label: 'Pick owners to contact' },
    },
    {
      n: 3,
      title: 'Scale with the register + Airbnb',
      body: `Once the pitch works, go wide: ${(register ?? 0).toLocaleString()} licensed short-let addresses (direct mail) and ${(prospects ?? 0).toLocaleString()} self-managing Airbnb hosts (profile outreach).`,
      done: false,
      cta: { href: '/pm-prospects', label: 'See PM Prospects' },
    },
  ]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <header>
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          Malta Owner Pipeline
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[color:var(--color-text-primary)]">
          Everything here serves one goal: <strong>find Malta property owners and win them as
          property-management clients.</strong> This page collects the data; the pages in the
          sidebar are where you review it and work it.
        </p>
      </header>

      {/* The plan — Meny's research playbook with live progress */}
      <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
          The plan (from the owner-research study)
        </h2>
        <ol className="mt-3 flex flex-col gap-3">
          {steps.map(s => (
            <li key={s.n} className="flex items-start gap-3">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-text-secondary)]" />
              )}
              <div>
                <p className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
                  {s.n}. {s.title}
                </p>
                <p className="text-[12px] text-[color:var(--color-text-secondary)]">{s.body}</p>
                {s.cta && (
                  <Link
                    href={s.cta.href}
                    className="mt-1 inline-flex items-center gap-1 text-[12px] text-[color:var(--color-text-primary)] underline underline-offset-2"
                  >
                    {s.cta.label}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 flex items-start gap-2 rounded-md bg-[color:var(--color-bg-secondary)] px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Ground rule: contact-gated platforms (Maltapark logins, Airbnb messaging) get
          personal, sustainable outreach — never automated bulk reveals. It protects the
          business long-term.
        </p>
      </section>

      {/* How the data flows */}
      <section>
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
          Where each dataset lives
        </h2>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Scrapes on this page fill the four datasets below. Each page explains its own data
          under “About this data”.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {FLOW.map(f => (
            <Link
              key={f.href}
              href={f.href}
              className="group rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-3 hover:bg-[color:var(--color-bg-secondary)]"
            >
              <p className="flex items-center gap-1 text-[13px] font-medium text-[color:var(--color-text-primary)]">
                {f.label}
                <ArrowRight className="h-3 w-3 text-[color:var(--color-text-secondary)] transition-transform group-hover:translate-x-0.5" />
              </p>
              <p className="text-[12px] text-[color:var(--color-text-secondary)]">{f.desc}</p>
              <p className="mt-1 text-[12px] tabular-nums text-[color:var(--color-text-primary)]">
                {f.href === '/property-leads' && `${(leads ?? 0).toLocaleString()} leads · ${phoneLeads} with phone`}
                {f.href === '/hfps-register' && `${(register ?? 0).toLocaleString()} licensed addresses`}
                {f.href === '/airbnb-listings' && `${(listings ?? 0).toLocaleString()} listings harvested`}
                {f.href === '/pm-prospects' && `${(prospects ?? 0).toLocaleString()} prospects`}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* The scrapers, organized by source tier */}
      <section>
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
          Collect fresh data
        </h2>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Runs happen right here on the server (Airbnb runs on Apify’s browsers) and{' '}
          <strong className="text-[color:var(--color-text-primary)]">merge</strong> into the
          datasets — re-running only adds listings you haven&apos;t seen.
        </p>
        <div className="mt-3">
          <RunForm customSources={customSources} balance={balance} />
        </div>
      </section>

      {/* Bring-your-own JSON-API sources (org-scoped YAML defs) */}
      <ManageSources
        templateYaml={SOURCE_TEMPLATE_YAML}
        sources={customDefs.map(d => ({
          key: d.key,
          name: d.definition.name,
          description: d.definition.description ?? null,
        }))}
        canManage={canManage}
      />
    </div>
  )
}
