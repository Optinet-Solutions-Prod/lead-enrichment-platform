import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  AtSign,
  Brain,
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
import { HeroCarousel } from './_components/hero-carousel'
import { LiveDemo } from './_components/live-demo'
import { Pricing } from './_components/pricing'

export const metadata: Metadata = {
  title: 'Lead Engine — type a keyword, meet the sites that rank for it and the people behind them',
  description:
    'Run a real Google scrape without an account: the sites ranking for your keyword in any of 32 countries, which ones are affiliates, their contact details and a first outreach draft — in about a minute.',
}

const JOURNEY = [
  {
    icon: Search,
    stage: 'Scrape',
    title: 'Every site and creator ranking for your keywords',
    body: 'Paste a keyword list, pick a country and language, choose Google or a creator platform. Desktop and mobile results, organic and paid, land as one profile per website — never counted twice.',
  },
  {
    icon: Brain,
    stage: 'Classify',
    title: 'Relevant? An affiliate? Promoting whom?',
    body: 'Each site is read and scored: on-keyword or noise, affiliate or brand, and which programmes it already promotes through its tracking links. Platforms and known non-affiliates drop out automatically.',
  },
  {
    icon: AtSign,
    stage: 'Contacts',
    title: 'The person behind the site, with provenance',
    body: 'Emails, phone numbers, contact forms, Telegram, WhatsApp, Discord, X, LinkedIn, Instagram and Facebook — each with the page it was found on and a confidence score.',
  },
  {
    icon: Send,
    stage: 'Outreach',
    title: 'Status, note and next step on every row',
    body: 'Mark a site contacted, replied, won or not now, keep the note beside the contact, and share one list with the team. No spreadsheet, no double-contacting.',
  },
  {
    icon: CalendarClock,
    stage: 'Monitor',
    title: 'Know when to follow up and what changed',
    body: 'Follow-up reminders on the day. Workflows that rerun your keywords weekly and merge only what is new. Verdicts and contact checks that expire and re-run themselves.',
  },
]

const INDUSTRIES = [
  { name: 'VPN & privacy', find: '“best VPN for…” reviewers, streaming-unblock guides and privacy YouTubers in each country' },
  { name: 'Web hosting & domains', find: 'hosting comparisons, WordPress tutorial blogs and speed-test publishers' },
  { name: 'B2B SaaS & productivity', find: 'software directories, alternatives pages, newsletter writers and tool reviewers' },
  { name: 'Fintech, brokers & exchanges', find: 'comparison sites, finance educators, calculators and trading channels' },
  { name: 'Cybersecurity & antivirus', find: 'security blogs, IT communities and “is it safe” pages by market' },
  { name: 'E-commerce & DTC brands', find: 'product reviewers, gift guides, coupon publishers and TikTok creators' },
  { name: 'Online education & courses', find: 'course reviewers, study blogs and career-change communities' },
  { name: 'Travel & booking', find: 'destination guides, itinerary blogs and local-experience publishers' },
  { name: 'Insurance & loan comparison', find: 'finance publishers and local advisors ranking for quote keywords' },
  { name: 'Health, fitness & supplements', find: 'fitness creators, nutrition blogs and product comparison sites' },
]

const SERVICES = [
  {
    icon: Radar,
    title: 'Affiliate & publisher discovery',
    body: 'Keyword × country × engine, in one batch. Every ranking website becomes a profile with its keywords, positions, countries and how often it appears — the map of who owns your search results.',
  },
  {
    icon: Brain,
    title: 'Classification',
    body: 'Relevance to the keyword, affiliate-or-not with the reason, and the brands a site already promotes, resolved from its outbound tracking links. Verdicts expire on a schedule so the picture stays current.',
  },
  {
    icon: AtSign,
    title: 'Contact enrichment',
    body: 'Emails, phones, contact forms and socials pulled from the site itself, each with source page and confidence. Filter to “has contacts” and your outreach list is ready.',
  },
  {
    icon: Users,
    title: 'Creator & channel discovery',
    body: 'The same search on YouTube, TikTok, Twitch, Kick, Snapchat and Telegram, plus Facebook’s Ad Library to see who is already advertising in your niche. Scored, with contacts.',
  },
  {
    icon: Send,
    title: 'Outreach tracking & monitoring',
    body: 'Status, note and follow-up date on every site. A pulse of contacted, replied, won and due-today on your home page. Workflows rerun weekly and merge only what is new.',
  },
  {
    icon: KeyRound,
    title: 'Your keys, your team, your workspaces',
    body: 'Connect your own API keys for cheaper runs. Invite teammates, set roles, transfer ownership. Run more than one brand? Separate workspaces; data never crosses.',
  },
]

export default function LandingPage() {
  return (
    <>
      <HeroCarousel />

      <LiveDemo />

      {/* The journey */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">What it is</p>
        <h2 className="mt-2 max-w-2xl text-[26px] font-semibold leading-tight">
          Not a scraper. The whole road from a search result to a partner you are talking to.
        </h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[color:var(--color-text-secondary)]">
          Affiliate networks show you who applied. Discovery tools stop at a list of domains.
          Outreach tools start from a list you already have. Lead Engine is the five steps in
          between — the demo above is the first three of them, live.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
            Any brand that grows through partners, publishers and creators.
          </h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[color:var(--color-text-secondary)]">
            If your competitors are being reviewed, compared and recommended on websites and
            channels you have never contacted, those are your next affiliates. Ten markets where
            that is the whole game:
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {INDUSTRIES.map(ind => (
              <div key={ind.name} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
                <p className="text-[13px] font-semibold leading-snug">{ind.name}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">
                  <span className="font-medium text-[color:var(--color-text-primary)]">Find:</span> {ind.find}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-16">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">Services</p>
        <h2 className="mt-2 max-w-2xl text-[26px] font-semibold leading-tight">Everything between “who is ranking for this?” and “when do I follow up?”</h2>
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
            <Workflow className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-[13px] leading-relaxed">
              <strong>Our work, not yours:</strong> proxies, CAPTCHAs, mobile-vs-desktop result sets,
              dedupe across batches, and verdicts that re-check themselves. You paste keywords.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Coins className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-[13px] leading-relaxed">
              <strong>Predictable cost:</strong> keyword searches are metered by a daily quota, source
              runs are priced in credits before they start, and outreach tracking is free on every plan.
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

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-16 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="mx-auto max-w-6xl px-5 py-16">
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
      <section className="border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-16 text-center">
          <h2 className="text-[28px] font-semibold leading-tight">Liked the demo? The real thing keeps the list.</h2>
          <p className="max-w-xl text-[14px] text-[color:var(--color-text-secondary)]">
            Create a workspace with 100 free credits, run more pages in 32 countries, and send the
            outreach for real — with a status and a follow-up date on every lead.
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
