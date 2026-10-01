'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { goToDemo } from './hero-carousel'

/**
 * Step list on the left, a sample website profile on the right that fills in
 * as you walk the steps. Example data, labelled as such.
 */
const STEPS = [
  {
    key: 'search',
    title: 'Keyword and market',
    body: 'Type a keyword, pick one of 32 countries. We search Google as a local would, desktop and mobile, organic and paid.',
    lines: [1, 2, 3],
  },
  {
    key: 'relevance',
    title: 'AI relevance check',
    body: 'Every result is judged against the keyword. Off-topic pages are shown but never opened, so nothing is wasted on noise.',
    lines: [4],
  },
  {
    key: 'crawl',
    title: 'Crawl the relevant sites',
    body: 'Only the sites that passed are opened and read, home page first, then the pages that matter.',
    lines: [5],
  },
  {
    key: 'kind',
    title: 'Affiliate or operator',
    body: 'Is it a review or comparison site, a brand’s own site, or a publisher? Decided with the reasoning attached.',
    lines: [6],
  },
  {
    key: 'brands',
    title: 'Brands endorsed and CTA links',
    body: 'Which brands it promotes, through which tracking and review links. That is the pitch: who they already work with.',
    lines: [7, 8],
  },
  {
    key: 'contacts',
    title: 'Contact details',
    body: 'Emails, phones, contact page and socials, each from the site’s own pages with the source kept.',
    lines: [9, 10, 11, 12],
  },
  {
    key: 'outreach',
    title: 'Outreach and monitoring',
    body: 'Draft the first email or SMS, set a status and a follow-up date. Keywords rerun on a schedule and new sites are merged in.',
    lines: [13, 14],
  },
] as const

// One profile, shown as the record the workspace keeps. Each line belongs to the step that produces it.
const PROFILE: Array<[string, string]> = [
  ['{', ''],
  ['  "keyword"', '"best vpn for streaming",'],
  ['  "country"', '"GB",'],
  ['  "site"', '"example-vpn-reviews.com",'],
  ['  "relevant"', 'true,'],
  ['  "crawled_pages"', '4,'],
  ['  "kind"', '"affiliate",'],
  ['  "endorses"', '["NordVPN", "Surfshark", "ExpressVPN"],'],
  ['  "cta_links"', '14,'],
  ['  "contacts"', '{'],
  ['    "email"', '"partners@example-vpn-reviews.com",'],
  ['    "contact_page"', '"/contact",'],
  ['    "socials"', '["x", "linkedin"] },'],
  ['  "outreach"', '"contacted",'],
  ['  "next_check"', '"in 7 days"'],
  ['}', ''],
]

export function PipelineExplorer() {
  const [active, setActive] = useState(0)
  const lit = new Set<number>(STEPS.slice(0, active + 1).flatMap(s => [...s.lines]))
  const current = new Set<number>(STEPS[active]!.lines)

  return (
    <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
      <div>
        <ol className="relative flex flex-col">
          <span aria-hidden className="absolute bottom-3 left-[7px] top-3 w-px bg-white/15" />
          {STEPS.map((s, i) => {
            const on = i === active
            return (
              <li key={s.key} className="relative">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-expanded={on}
                  className="flex w-full items-center gap-4 py-2.5 text-left"
                >
                  <span
                    aria-hidden
                    className={[
                      'relative z-10 h-[15px] w-[15px] shrink-0 rounded-full border-2 transition-colors',
                      i <= active ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]' : 'border-white/40 bg-[#0b0b0c]',
                    ].join(' ')}
                  />
                  <span className={['flex-1 text-[18px] font-semibold transition-colors', on ? 'text-white' : 'text-white/60 hover:text-white'].join(' ')}>
                    {s.title}
                  </span>
                  <ChevronDown className={['h-4 w-4 shrink-0 text-white/50 transition-transform', on ? 'rotate-180' : ''].join(' ')} />
                </button>
                {on && <p className="pb-3 pl-[31px] text-[15px] leading-relaxed text-[color:var(--color-text-secondary)]">{s.body}</p>}
              </li>
            )
          })}
        </ol>
        <button type="button" onClick={goToDemo} className="dg-btn dg-btn-primary mt-6 min-h-12 px-6 text-[16px]">
          Try it now
        </button>
      </div>

      <div className="dg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <span className="text-[13px] font-medium text-white">Website profile</span>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--color-accent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent)]" /> Example
          </span>
        </div>
        <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-[1.75] md:text-[14px]">
          {PROFILE.map(([k, v], i) => {
            const show = i === 0 || i === PROFILE.length - 1 || lit.has(i)
            const now = current.has(i)
            return (
              <div
                key={i}
                className={[
                  '-mx-5 px-5 transition-colors',
                  now ? 'bg-[color:var(--color-accent)]/10' : '',
                  show ? '' : 'opacity-25',
                ].join(' ')}
              >
                <span className={v ? 'text-[#79affa]' : 'text-white/70'}>{k}</span>
                {v && <span className="text-white/50">: </span>}
                <span className={v.startsWith('"') || v.startsWith('[') ? 'text-[#a1f9d4]' : 'text-[#ffadd8]'}>{v}</span>
              </div>
            )
          })}
        </pre>
      </div>
    </div>
  )
}
