import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BedDouble,
  Brain,
  Building2,
  Coins,
  KeyRound,
  Radar,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react'
import { Faq } from './_components/faq'
import { Pricing } from './_components/pricing'
import { ProductMock } from './_components/product-mock'

export const metadata: Metadata = {
  title: 'Lead Engine — turn public websites into qualified leads',
  description:
    'Scrape the sources that matter for your market, qualify them with AI, and hand your team a list worth calling. Property owners in Malta, affiliate sites worldwide. Start with 100 free credits.',
}

const PROOF = [
  { n: '8,294', label: 'licensed short-lets mapped from the official register' },
  { n: '1,560', label: 'Airbnb listings cross-matched to owners' },
  { n: '18', label: 'property sources harvested for one market' },
  { n: '85k+', label: 'search results processed by the affiliate engine' },
]

const SERVICES = [
  {
    icon: Building2,
    title: 'Property owner leads',
    body: 'Owners who list without an agent — name, phone and listing in one row — from direct-from-owner sites, Maltapark classifieds and the MTA short-let register. Filter to “has phone” and start calling.',
  },
  {
    icon: BedDouble,
    title: 'Short-let & Airbnb intelligence',
    body: 'A real-browser Airbnb crawl, cross-matched against your leads and the licence register, surfaces self-managing hosts — the warmest audience for a property-management pitch.',
  },
  {
    icon: Radar,
    title: 'Affiliate & search intelligence',
    body: 'Google and Bing results per keyword and country, with paid ads, one profile per website, and AI that judges relevance and affiliate status before you spend a minute on it.',
  },
  {
    icon: Workflow,
    title: 'Workflows',
    body: 'Save the sources, keyword and cross-match you run every week as a recipe. One click reruns the whole sequence and merges only what is new.',
  },
  {
    icon: KeyRound,
    title: 'Bring your own sources & keys',
    body: 'Describe any JSON listings API in a short YAML file and it becomes a source. Connect your own Apify account and the expensive crawls cost you a third of the credits.',
  },
  {
    icon: Users,
    title: 'Teams & workspaces',
    body: 'Invite teammates, set roles, transfer ownership, switch between workspaces. Every credit is on a ledger, every action is on an activity log.',
  },
]

const STEPS = [
  {
    n: '1',
    title: 'Pick your sources',
    body: 'Tick the sites for your market — or upload your own. New workspaces get 100 credits, enough for a full pilot batch.',
  },
  {
    n: '2',
    title: 'We collect and qualify',
    body: 'Our scrapers run on the server, dedupe every website into one profile, keep verdicts fresh with expiry, and let AI screen out the noise.',
  },
  {
    n: '3',
    title: 'Your team works the list',
    body: 'Filter, sort, cross-match, mark what is not relevant. Save the run as a workflow and repeat it next week in one click.',
  },
]

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-14 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] px-3 py-1 text-[12px] text-[color:var(--color-text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Scrape → qualify → reach
          </p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-tight md:text-[44px]">
            Turn public websites into leads worth calling.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[color:var(--color-text-secondary)]">
            Lead Engine scrapes the sources that matter for your market, removes the noise with AI, and
            hands your team a clean list — with the phone number, the listing, and where else the
            owner shows up. Built for property managers in Malta and affiliate teams anywhere.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-5 text-[14px] font-semibold text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)]"
            >
              Start free — 100 credits
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-[12px] text-[color:var(--color-text-secondary)]">
              No card needed · 2-minute setup · guided tour included
            </span>
          </div>
        </div>
        <ProductMock />
      </section>

      {/* Proof */}
      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 md:grid-cols-4">
          {PROOF.map(p => (
            <div key={p.n}>
              <p className="text-[26px] font-semibold tabular-nums leading-none">{p.n}</p>
              <p className="mt-1.5 text-[12px] leading-snug text-[color:var(--color-text-secondary)]">{p.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What it is */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">What it is</p>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight">
              One engine, two markets, zero spreadsheets.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-[color:var(--color-text-secondary)]">
              We built Lead Engine to run our own outbound: first to find casino-affiliate websites
              across Europe, then to find every property owner in Malta worth a management offer.
              The same machinery — scrapers, one profile per website, AI screening, workflows — now
              runs as a service for your team.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[color:var(--color-border)] p-4">
              <Building2 className="h-5 w-5" />
              <p className="mt-2 text-[14px] font-semibold">For property managers & agencies</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">
                Owners listing without an agent, licensed short-lets, self-managing Airbnb hosts — the
                three audiences of a Malta management business, collected and cross-matched.
              </p>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] p-4">
              <Radar className="h-5 w-5" />
              <p className="mt-2 text-[14px] font-semibold">For affiliate & partnership teams</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">
                Every site that ranks for your keywords in your countries, judged by AI for relevance
                and affiliate status, with the brand links it pushes and how to reach the owner.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="scroll-mt-16 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">Services</p>
          <h2 className="mt-2 max-w-2xl text-[26px] font-semibold leading-tight">Everything between “who should we contact?” and a dialled number.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(s => (
              <div key={s.title} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-accent)]/40">
                  <s.icon className="h-4.5 w-4.5" />
                </span>
                <p className="mt-3 text-[15px] font-semibold">{s.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[color:var(--color-text-secondary)]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">How it works</p>
        <h2 className="mt-2 text-[26px] font-semibold leading-tight">Three steps. You own the first and the last.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map(s => (
            <div key={s.n} className="relative rounded-xl border border-[color:var(--color-border)] p-5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--color-accent)] text-[13px] font-semibold">
                {s.n}
              </span>
              <p className="mt-3 text-[15px] font-semibold">{s.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[color:var(--color-text-secondary)]">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5 md:grid-cols-3">
          <div className="flex items-start gap-3">
            <Brain className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-[13px] leading-relaxed">
              <strong>Our work, not yours:</strong> scrapers that adapt when a site changes, one record
              per website so nothing is counted twice, verdicts that expire and re-check themselves.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Coins className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-[13px] leading-relaxed">
              <strong>Predictable cost:</strong> every run is priced in credits before it starts, every
              credit is on a ledger, and a run that fails is not a run you pay for twice.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-[13px] leading-relaxed">
              <strong>Sustainable outreach:</strong> public data only, one profile per site, and never a
              bulk automation against login-gated platforms.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-16 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">Pricing</p>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight">Start free. Pay for the runs you make.</h2>
            <p className="mt-2 text-[14px] text-[color:var(--color-text-secondary)]">
              A monthly plan that includes credits, and top-ups that never expire. Switch currency any time.
            </p>
          </div>
          <div className="mt-8">
            <Pricing />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">FAQ</p>
          <h2 className="mt-2 text-[26px] font-semibold leading-tight">Questions we get before the first scrape.</h2>
        </div>
        <div className="mt-8">
          <Faq />
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-[color:var(--color-border)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-16 text-center">
          <h2 className="text-[28px] font-semibold leading-tight">Your first pilot batch is 100 credits away.</h2>
          <p className="max-w-xl text-[14px] text-[color:var(--color-text-secondary)]">
            Create a workspace, take the 60-second tour, run the two direct-from-owner sources and
            have contactable owners on screen before your coffee is cold.
          </p>
          <Link
            href="/signup"
            className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-6 text-[14px] font-semibold transition-colors hover:bg-[color:var(--color-accent-hover)]"
          >
            Create your free account
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  )
}
