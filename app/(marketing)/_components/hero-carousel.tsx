'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, Play, Sparkles } from 'lucide-react'

/** Scroll to the live demo and hand it focus. Shared with the demo's own CTAs. */
export function goToDemo() {
  const el = document.getElementById('demo')
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  window.dispatchEvent(new CustomEvent('lead-engine:focus-demo'))
}

// The headline stays put; the line under it rotates through the journey.
const SLIDES = [
  'Lead Engine searches Google as a local in 32 countries, tells you which results are affiliates, pulls the brands they endorse and their contact details, and drafts the first message.',
  'Find: every website ranking for your keywords in the market you pick, organic and paid, one profile per site.',
  'Classify: relevant or noise, affiliate or operator, and which brands it already promotes, with the evidence.',
  'Reach and follow up: email or SMS from the same screen, with a status and a follow-up date on every lead.',
]

const INTERVAL_MS = 6500

export function HeroCarousel() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setIndex(i => (i + 1) % SLIDES.length), INTERVAL_MS)
    return () => clearInterval(id)
  }, [paused])

  return (
    <section
      className="dg-hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      <div className="mx-auto flex min-h-[620px] max-w-5xl flex-col items-center justify-center px-5 py-24 text-center md:min-h-[680px]">
        <button
          type="button"
          onClick={goToDemo}
          className="group inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/40 bg-white/5 px-5 py-3 text-[15px] font-medium text-white backdrop-blur transition-colors hover:border-white/70 md:text-[17px]"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-[color:var(--color-accent)]" />
          <span className="truncate">Live demo, no account needed</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--color-accent)] transition-transform group-hover:translate-x-0.5" />
        </button>

        <h1 className="mt-8 text-[38px] font-bold leading-[1.1] text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.35)] sm:text-[48px] md:text-[60px]">
          Type a keyword. Meet the sites that rank for it, and the people behind them.
        </h1>

        <p
          key={index}
          className="mt-6 min-h-[5.25em] max-w-3xl animate-[dgFade_.45s_ease-out] text-[17px] leading-relaxed text-white/90 md:min-h-[3.5em] md:text-[19px]"
          aria-live="polite"
        >
          {SLIDES[index]}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button type="button" onClick={goToDemo} className="dg-btn dg-btn-primary min-h-12 px-6 text-[16px]">
            <Play className="h-4 w-4" />
            Try it now
          </button>
          <Link href="/signup" className="dg-btn dg-btn-glow min-h-12 px-6 text-[16px]">
            Sign up free
          </Link>
        </div>

        <div className="mt-10 flex items-center gap-2" role="tablist" aria-label="What Lead Engine does">
          {SLIDES.map((s, i) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className="flex h-6 items-center"
            >
              <span className={['block h-1.5 rounded-full transition-all', i === index ? 'w-8 bg-white' : 'w-1.5 bg-white/40'].join(' ')} />
            </button>
          ))}
        </div>
      </div>
      <style>{`@keyframes dgFade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
    </section>
  )
}
