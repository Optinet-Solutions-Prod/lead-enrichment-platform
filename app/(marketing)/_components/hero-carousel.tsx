'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, AtSign, ChevronLeft, ChevronRight, Play, Search, Send, Sparkles } from 'lucide-react'

/** Scroll to the live demo and hand it focus. Shared with the demo's own CTAs. */
export function goToDemo() {
  const el = document.getElementById('demo')
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  window.dispatchEvent(new CustomEvent('lead-engine:focus-demo'))
}

const SLIDES = [
  {
    eyebrow: 'Live demo · no account needed',
    icon: Sparkles,
    title: 'Type a keyword. Meet the sites that rank for it — and the people behind them.',
    body: 'Lead Engine searches Google as a local in 32 countries, tells you which results are affiliates, pulls their contact details and drafts the first message. Try it right here, in about a minute.',
  },
  {
    eyebrow: '1 · Find',
    icon: Search,
    title: 'Every website ranking for your keywords, in the market you pick.',
    body: 'Organic results and page-one ads, one profile per website, never counted twice. Desktop or mobile, any of 32 countries.',
  },
  {
    eyebrow: '2 · Classify and get contacts',
    icon: AtSign,
    title: 'Affiliate or not? Reachable or not? Answered before you spend a minute.',
    body: 'A verdict with the evidence behind it, plus emails, phones, socials and contact forms — each with the page it was found on.',
  },
  {
    eyebrow: '3 · Reach and follow up',
    icon: Send,
    title: 'Email or SMS from the same screen, then never lose the thread.',
    body: 'A status, a note and a follow-up date on every lead, shared with the whole team. Nobody pitches the same site twice.',
  },
]

const INTERVAL_MS = 7000

export function HeroCarousel() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setIndex(i => (i + 1) % SLIDES.length), INTERVAL_MS)
    return () => clearInterval(id)
  }, [paused])

  const slide = SLIDES[index]!
  const Icon = slide.icon

  return (
    <section
      className="relative overflow-hidden border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-[color:var(--color-accent)]/40 blur-3xl"
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 pb-14 pt-12 lg:pt-20">
        <div key={index} className="animate-[fadeIn_.4s_ease-out] lg:max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-1 text-[12px] text-[color:var(--color-text-secondary)]">
            <Icon className="h-3.5 w-3.5" />
            {slide.eyebrow}
          </p>
          <h1 className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-tight md:text-[46px]">{slide.title}</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[color:var(--color-text-secondary)] md:text-[16px]">
            {slide.body}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={goToDemo}
              className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[color:var(--color-text-primary)] px-6 text-[15px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Play className="h-4 w-4" />
              Try it now
            </button>
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center gap-2 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-primary)] px-5 text-[14px] font-medium text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-secondary)]"
            >
              Create a free account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-[12px] text-[color:var(--color-text-secondary)]">
              Real Google results · nothing is sent from the demo
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => setIndex(i => (i - 1 + SLIDES.length) % SLIDES.length)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2" role="tablist" aria-label="Slides">
            {SLIDES.map((s, i) => (
              <button
                key={s.eyebrow}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={[
                  'h-2 rounded-full transition-all',
                  i === index ? 'w-8 bg-[color:var(--color-text-primary)]' : 'w-2 bg-[color:var(--color-border-strong)]',
                ].join(' ')}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => setIndex(i => (i + 1) % SLIDES.length)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-1 text-[11px] tabular-nums text-[color:var(--color-text-secondary)]">
            {index + 1} / {SLIDES.length}
          </span>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
    </section>
  )
}
