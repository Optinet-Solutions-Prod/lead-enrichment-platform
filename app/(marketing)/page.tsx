import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  BedDouble,
  Brain,
  Building2,
  CalendarClock,
  Coins,
  KeyRound,
  Radar,
  Search,
  Send,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react'
import { Faq } from './_components/faq'
import { Pricing } from './_components/pricing'
import { ProductMock } from './_components/product-mock'

export const metadata: Metadata = {
  title: 'Lead Engine — from lead to outreach to follow-up, in one place',
  description:
    'Find the websites and listings already ranking in your market, get the person behind them, qualify with AI, track every conversation and never miss a follow-up. Start with 100 free credits.',
}

const PROOF = [
  { n: '8,294', label: 'licensed short-lets mapped from the official register' },
  { n: '1,560', label: 'Airbnb listings cross-matched to owners' },
  { n: '18', label: 'property sources harvested for one market' },
  { n: '85k+', label: 'search results processed by the discovery engine' },
]

const JOURNEY = [
  {
    icon: Search,
    stage: 'Find',
    title: 'The people already visible in your market',
    body: 'Owners listing property without an agent. Websites ranking for your keywords in your countries. Every result becomes one record with the listing or page it was found on.',
  },
  {
    icon: Brain,
    stage: 'Qualify',
    title: 'Noise out, before you spend a minute',
    body: 'One profile per website, AI that judges relevance to the keyword, obvious non-fits flagged automatically, and cross-matches (Airbnb, licence register) that tell you who is really worth a call.',
  },
  {
    icon: Send,
    stage: 'Reach',
    title: 'Contact details and context in the same row',
    body: 'Phone, email, contact page, socials — with the source. Mark each lead contacted, replied, won or not now, keep a note, and hand the list to a teammate without a spreadsheet.',
  },
  {
    icon: CalendarClock,
    stage: 'Monitor',
    title: 'Know when to follow up and what changed',
    body: 'Follow-up reminders on the day, an outreach pulse on your home page, workflows that rerun weekly and merge only what is new, and verdicts that expire and re-check themselves.',
  },
]

const INDUSTRIES = [
  {
    name: 'Property management & letting agencies',
    find: 'owners listing without an agent, licensed short-lets, self-managing Airbnb hosts',
    proven: true,
  },
  { name: 'VPN & privacy apps', find: 'review sites, “best VPN for…” pages and streaming-unblock guides ranking in each country' },
  { name: 'Web hosting & domains', find: 'hosting comparisons, WordPress blogs and tutorial sites that already recommend providers' },
  { name: 'B2B SaaS', find: 'software directories, alternatives pages and niche newsletters in your category' },
  { name: 'Fintech, brokers & exchanges', find: 'comparison sites, finance educators and calculators ranking for money keywords' },
  { name: 'E-commerce & DTC brands', find: 'product reviewers, gift guides and coupon publishers in your niche' },
  { name: 'Cybersecurity & antivirus', find: 'security blogs, IT communities and “is it safe” pages by market' },
  { name: 'Online education & courses', find: 'course reviewers, study blogs and career-change communities' },
  { name: 'Travel & booking', find: 'destination guides, itinerary blogs and local-experience publishers' },
  { name: 'Insurance & loan comparison', find: 'finance publishers and local advisors ranking for quote keywords' },
]

const SERVICES = [
  {
    icon: Building2,
    title: 'Property owner leads',
    body: 'Owners who list without an agent — name, phone and listing in one row — from direct-from-owner sites, classifieds and the official short-let register. Filter to “has phone” and start calling.',
  },
  {
    icon: BedDouble,
    title: 'Short-let & Airbnb intelligence',
    body: 'A real-browser Airbnb crawl, cross-matched against your leads and the licence register, surfaces self-managing hosts — the warmest audience for a management pitch.',
  },
  {
    icon: Radar,
    title: 'Partner & publisher discovery',
    body: 'Every site ranking for your keywords in your countries, one profile each, judged by AI for relevance and for which brands it already promotes — with the owner’s contact details.',
  },
  {
    icon: Send,
    title: 'Outreach tracking',
    body: 'Status, note and next follow-up on every lead. Click-to-call and click-to-email from the row; a follow-ups-due list on the home page every morning.',
  },
  {
    icon: Workflow,
    title: 'Workflows & monitoring',
    body: 'Save the sources, keyword and cross-match you run every week as a recipe. One click reruns it, merges only what is new, and notifies the team when it finishes.',
  },
  {
    icon: KeyRound,
    title: 'Your sources, your keys, your team',
    body: 'Describe any JSON listings API in a short YAML file and it becomes a source. Connect your own API keys for cheaper crawls. Invite teammates, set roles, switch workspaces.',
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
            Find → qualify → reach → monitor
          </p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-tight md:text-[44px]">
            Find the right people. Reach them. Never miss the follow-up.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[color:var(--color-text-secondary)]">
            Lead Engine turns the websites and listings already ranking in your market into a
            working outreach list — the person behind each one, an AI relevance check, a status on
            every conversation and a reminder on the day it is due. From first lead to closed
            conversation, in one place.
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

      {/* The journey */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">What it is</p>
        <h2 className="mt-2 max-w-2xl text-[26px] font-semibold leading-tight">
          Not a scraper. The whole road from a name on a website to a conversation you are tracking.
        </h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[color:var(--color-text-secondary)]">
          Discovery tools stop at a list. Outreach tools start from one you already have. Lead
          Engine is the four steps in between, built to run our own outbound first.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {JOURNEY.map((j, i) => (
            <div key={j.stage} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--color-accent)]">
                  <j.icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  {i + 1} · {j.stage}
                </span>
              </div>
              <p className="mt-3 text-[15px] font-semibold leading-snug">{j.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[color:var(--color-text-secondary)]">{j.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section id="industries" className="scroll-mt-16 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">Who it’s for</p>
          <h2 className="mt-2 max-w-2xl text-[26px] font-semibold leading-tight">
            Any business whose next customer or partner is already visible on a website.
          </h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[color:var(--color-text-secondary)]">
            If the people you want are listing, publishing, ranking or reviewing in public, Lead
            Engine can find them, tell you which ones matter, and keep the conversation on track.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {INDUSTRIES.map(ind => (
              <div
                key={ind.name}
                className={[
                  'rounded-xl border bg-[color:var(--color-bg-primary)] p-4',
                  ind.proven ? 'border-[color:var(--color-accent-hover)] ring-1 ring-[color:var(--color-accent-hover)]' : 'border-[color:var(--color-border)]',
                ].join(' ')}
              >
                <p className="flex items-start gap-1.5 text-[13px] font-semibold leading-snug">
                  {ind.proven && <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                  {ind.name}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">
                  <span className="font-medium text-[color:var(--color-text-primary)]">Find:</span> {ind.find}
                </p>
                {ind.proven && (
                  <p className="mt-2 text-[11px] font-medium text-emerald-700">Live today — Malta, with real data</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">Services</p>
        <h2 className="mt-2 max-w-2xl text-[26px] font-semibold leading-tight">Everything between “who should we contact?” and “when do I follow up?”</h2>
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
              credit is on a ledger, and outreach tracking is free on every plan.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-[13px] leading-relaxed">
              <strong>Sustainable outreach:</strong> public data only, personal messages from your own
              accounts, and never a bulk automation against login-gated platforms.
            </p>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">Built for the team, not the tab</p>
            <h2 className="mt-2 text-[24px] font-semibold leading-tight">One list, everyone on it.</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-[color:var(--color-text-secondary)]">
              Invite the people who do the calling. Everyone sees the same statuses, notes and
              follow-ups; nobody double-contacts an owner. Roles, ownership transfer and separate
              workspaces per business are built in, and every credit and every change is logged.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [Users, 'Roles & invites', 'Owner, admin, member — invite by link, transfer ownership when someone leaves.'],
              [Workflow, 'Workspaces', 'Run more than one business? Switch between them; data never crosses.'],
              [CalendarClock, 'Follow-up pulse', 'Contacted, replied, won and due-today counts on the home page.'],
              [Coins, 'Ledger', 'Every credit spent, every gift, every top-up, with a reason.'],
            ].map(([Icon, t, b]) => {
              const I = Icon as typeof Users
              return (
                <div key={t as string} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
                  <I className="h-4.5 w-4.5" />
                  <p className="mt-2 text-[13px] font-semibold">{t as string}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">{b as string}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">Pricing</p>
          <h2 className="mt-2 text-[26px] font-semibold leading-tight">Start free. Pay for the runs you make.</h2>
          <p className="mt-2 text-[14px] text-[color:var(--color-text-secondary)]">
            A monthly plan that includes credits, and top-ups that never expire. Outreach tracking
            is free on every plan. Switch currency any time.
          </p>
        </div>
        <div className="mt-8">
          <Pricing />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">FAQ</p>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight">Questions we get before the first scrape.</h2>
          </div>
          <div className="mt-8">
            <Faq />
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-16 text-center">
          <h2 className="text-[28px] font-semibold leading-tight">Your first pilot batch is 100 credits away.</h2>
          <p className="max-w-xl text-[14px] text-[color:var(--color-text-secondary)]">
            Create a workspace, take the 60-second tour, run your first sources and have people worth
            contacting — with a place to track every reply — before your coffee is cold.
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
