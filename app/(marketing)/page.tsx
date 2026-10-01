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
import { PipelineExplorer } from './_components/pipeline-explorer'
import { Pricing } from './_components/pricing'

export const metadata: Metadata = {
  title: 'Lead Engine — type a keyword, meet the sites that rank for it and the people behind them',
  description:
    'Run a real Google scrape without an account: the sites ranking for your keyword in any of 32 countries, which ones are affiliates, their contact details and a first outreach draft — in about a minute.',
}

const CONTACT = 'mailto:admin@optinetsolutions.com?subject=Lead%20Engine'

const INDUSTRIES = [
  'VPN & privacy',
  'Web hosting',
  'B2B SaaS',
  'Fintech & brokers',
  'Cybersecurity',
  'E-commerce & DTC',
  'Online education',
  'Travel & booking',
  'Insurance & loans',
  'Fitness & supplements',
]

const PLATFORM = [
  {
    icon: Search,
    title: 'Find',
    body: 'Every site ranking for your keywords, in the country you pick. Organic and paid, desktop and mobile, one profile per website.',
  },
  {
    icon: Brain,
    title: 'Classify',
    body: 'Relevant or noise, affiliate or operator, and the brands each site already promotes, resolved from its own links.',
  },
  {
    icon: AtSign,
    title: 'Contacts',
    body: 'Emails, phones, contact forms and socials from the site itself, each with the page it was found on.',
  },
  {
    icon: Send,
    title: 'Outreach',
    body: 'A first draft per site, then a status, a note and a follow-up date on every lead, shared with the team.',
  },
  {
    icon: CalendarClock,
    title: 'Monitor',
    body: 'Keywords rerun on a schedule, new sites merge in, and verdicts re-check themselves before they go stale.',
  },
]

const JOURNEYS = [
  {
    eyebrow: 'Self-serve',
    title: 'Start with 100 free credits.',
    body: 'For growth and partnership teams who want the list today. Every page unlocked, no card needed.',
    cta: { label: 'Sign up free', href: '/signup' },
    art: 'from-[#13ef93]/30 to-[#149afb]/10',
    icon: Radar,
  },
  {
    eyebrow: 'Bring your own keys',
    title: 'Run at your own cost.',
    body: 'Connect your Apify and OpenAI keys for cheaper, heavier runs that bill straight to your accounts.',
    cta: { label: 'Connect your keys', href: '/signup' },
    art: 'from-[#149afb]/30 to-[#7f39ff]/10',
    icon: KeyRound,
  },
  {
    eyebrow: 'Done with you',
    title: 'Markets mapped for you.',
    body: 'For brands entering several countries at once. We set up the keywords, sources and follow-up rhythm with you.',
    cta: { label: 'Talk to us', href: CONTACT },
    art: 'from-[#ffadd8]/25 to-[#7f39ff]/10',
    icon: Users,
  },
]

const SERVICES = [
  {
    icon: Radar,
    title: 'Affiliate & publisher discovery',
    body: 'Keyword × country × engine in one batch. The map of who owns your search results, with positions and frequency.',
  },
  {
    icon: Brain,
    title: 'Classification with evidence',
    body: 'Relevance, affiliate-or-not with the reason, and the brands each site promotes. Verdicts expire on a schedule.',
  },
  {
    icon: AtSign,
    title: 'Contact enrichment',
    body: 'Filter to “has contacts” and your outreach list is ready, every detail traceable to its source page.',
  },
  {
    icon: Workflow,
    title: 'Our work, not yours',
    body: 'Proxies, CAPTCHAs, mobile-versus-desktop result sets and de-duplication across batches. You paste keywords.',
  },
  {
    icon: Coins,
    title: 'Predictable cost',
    body: 'Runs are priced in credits before they start. Outreach tracking is free on every plan.',
  },
  {
    icon: ShieldCheck,
    title: 'Sustainable outreach',
    body: 'Public business data only, personal messages from your own accounts, never bulk automation on gated platforms.',
  },
]

function SectionTitle({ lead, accent, sub, ruled = false }: { lead: string; accent: string; sub?: string; ruled?: boolean }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <div className="flex items-center justify-center gap-6">
        {ruled && <span aria-hidden className="dg-rule hidden max-w-[260px] md:block" />}
        <h2 className="text-[34px] font-bold leading-[1.15] text-white md:text-[48px]">
          {lead} <span className="dg-gradient-text">{accent}</span>
        </h2>
        {ruled && <span aria-hidden className="dg-rule hidden max-w-[260px] md:block" />}
      </div>
      {sub && <p className="mt-4 text-[16px] leading-relaxed text-white/85 md:text-[18px]">{sub}</p>}
    </div>
  )
}

export default function LandingPage() {
  return (
    <>
      <HeroCarousel />

      {/* Industries strip, in the place of a customer logo wall */}
      <section id="industries" className="scroll-mt-16 border-b border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <p className="text-center text-[18px] font-semibold text-[#828180] md:text-[20px]">
            Built for brands that grow through partners, publishers and creators
          </p>
          <div className="mt-8 grid grid-cols-2 border-l border-t border-white/10 sm:grid-cols-3 lg:grid-cols-5">
            {INDUSTRIES.map(name => (
              <div
                key={name}
                className="flex min-h-[84px] items-center justify-center border-b border-r border-white/10 px-3 text-center font-display text-[15px] font-semibold text-white/80 md:text-[17px]"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      <LiveDemo />

      {/* Platform: one tile per step of the journey */}
      <section id="platform" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <SectionTitle lead="Our" accent="platform" sub="One workspace from a search result to a partner you are talking to." ruled />
          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
            {PLATFORM.map(p => (
              <div key={p.title} className="flex flex-col items-center text-center lg:items-start lg:text-left">
                <span className="dg-tile">
                  <p.icon className="h-6 w-6" strokeWidth={2.2} />
                </span>
                <h3 className="mt-5 text-[20px] font-bold text-white">{p.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--color-text-secondary)]">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The pipeline, step by step */}
      <section id="how" className="scroll-mt-16 border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <SectionTitle
            lead="A single pipeline from"
            accent="keyword to partner"
            sub="Instead of stitching a scraper, a spreadsheet, an enrichment tool and an inbox together, Lead Engine runs the whole road in one place, and the demo above runs the first six steps live."
          />
          <PipelineExplorer />
        </div>
      </section>

      {/* Three ways in */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <SectionTitle lead="Choose how you" accent="get started" sub="Pick the path that fits your team and your volume." />
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {JOURNEYS.map(j => (
              <div key={j.eyebrow} className="dg-card flex flex-col overflow-hidden bg-[#101014]">
                <div className={`flex h-40 items-center justify-center bg-gradient-to-br ${j.art}`}>
                  <span className="flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-[#0b0b0c]/70 shadow-[0_0_40px_rgba(19,239,147,0.15)]">
                    <j.icon className="h-8 w-8 text-white" />
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-8">
                  <p className="text-[17px] font-bold text-white">{j.eyebrow}</p>
                  <p className="mt-2 text-[17px] font-bold text-white">{j.title}</p>
                  <p className="mt-3 flex-1 text-[16px] leading-relaxed text-white/80">{j.body}</p>
                  <div className="mt-8">
                    {j.cta.href.startsWith('mailto:') ? (
                      <a href={j.cta.href} className="dg-btn dg-btn-primary min-h-12 px-5">
                        {j.cta.label}
                      </a>
                    ) : (
                      <Link href={j.cta.href} className="dg-btn dg-btn-primary min-h-12 px-5">
                        {j.cta.label}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Everything in the workspace */}
      <section id="services" className="scroll-mt-16 border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            <div>
              <h2 className="text-[34px] font-bold leading-[1.15] text-white md:text-[48px]">
                Everything that <span className="dg-gradient-text">scales</span> with you
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-[color:var(--color-text-secondary)] md:text-[18px]">
                From the first keyword to a team working several markets: the same workspace, the same profiles, no data crossing between brands.
              </p>
              <Link href="/signup" className="dg-btn dg-btn-glow mt-8 min-h-12 px-6 text-[16px]">
                Open a workspace <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {SERVICES.map(s => (
                <div key={s.title} className="dg-card p-6">
                  <s.icon className="h-6 w-6 text-[color:var(--color-accent)]" />
                  <h3 className="mt-4 text-[18px] font-bold text-white">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--color-text-secondary)]">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-16 border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <SectionTitle
            lead="Start free."
            accent="Pay for the runs you make."
            sub="A monthly plan that includes credits, and top-ups that never expire. Outreach tracking is free on every plan."
          />
          <div className="mt-12">
            <Pricing />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <SectionTitle lead="Questions before the" accent="first scrape" />
          <div className="mt-12">
            <Faq />
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="dg-hero border-t border-white/10">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-5 py-24 text-center">
          <h2 className="text-[32px] font-bold leading-[1.15] text-white md:text-[44px]">Find your next partners with one keyword</h2>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-white/85 md:text-[18px]">
            Create a workspace with 100 free credits, run more pages in 32 countries, and keep every lead with a status and a follow-up date.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/signup" className="dg-btn dg-btn-primary min-h-12 px-6 text-[16px]">
              Sign up for free
            </Link>
            <a href={CONTACT} className="dg-btn dg-btn-secondary min-h-12 px-6 text-[16px]">
              Get a walkthrough
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
