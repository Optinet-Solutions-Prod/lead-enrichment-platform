'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  BadgeCheck,
  Check,
  CircleDashed,
  ExternalLink,
  Globe,
  Heart,
  Link2,
  Loader2,
  Mail,
  MessageSquareText,
  Phone,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react'

/**
 * The landing-page demo: a real Google scrape for a keyword in a country, a
 * relevance check on every result, the relevant sites opened and classified
 * (affiliate · operator · publisher), the brands they endorse and their CTA
 * links, their contacts, and an outreach draft for any of them — all without
 * an account. The server keeps the run in `demo_runs`; this drives it by
 * polling.
 */

type Verdict = 'affiliate' | 'not_affiliate' | 'unclear' | 'unknown'
type Relevance = 'relevant' | 'off_topic' | 'unknown'
type Kind = 'affiliate' | 'operator' | 'publisher' | 'unknown'
type Brand = { name: string; host: string; links: number }
type Lead = {
  id: number
  /** The keyword this site ranked for. */
  keyword?: string
  domain: string
  url: string
  title: string
  snippet: string | null
  type: 'Organic' | 'PPC'
  position: number
  relevance: Relevance
  relevanceReason: string | null
  siteDescription: string | null
  market: string | null
  enriched: boolean
  skipped: boolean
  fetchError: string | null
  kind: Kind
  verdict: Verdict
  confidence: string | null
  score: number | null
  indicators: string[]
  brands: Brand[]
  ctaLinks: number
  contacts: {
    emails: string[]
    phones: string[]
    socials: Array<{ platform: string; url: string }>
    contactPage: string | null
    forms: number
  } | null
}
type Run = {
  id: string
  ai: boolean
  status: 'searching' | 'enriching' | 'done' | 'failed'
  keyword: string
  keywords?: string[]
  country_code: string
  results: Lead[]
  total: number
  enriched: number
  error: string | null
}

const COUNTRIES = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'MT', name: 'Malta' },
  { code: 'SE', name: 'Sweden' },
  { code: 'PL', name: 'Poland' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
]

const PRESETS = [
  { key: 'vpn', label: 'VPN brand', keywords: ['best vpn for streaming', 'best vpn 2026', 'vpn deals'], country: 'GB', blurb: 'Who reviews VPNs in the UK' },
  { key: 'casino', label: 'Casino brand', keywords: ['online casino', 'beste online casinos', 'casino bonus'], country: 'DE', blurb: 'Review and bonus sites an operator recruits' },
  { key: 'hosting', label: 'Web hosting', keywords: ['best web hosting for small business', 'best wordpress hosting', 'web hosting comparison'], country: 'US', blurb: 'Hosting comparison publishers' },
  { key: 'saas', label: 'B2B SaaS', keywords: ['best crm for small business', 'best project management software', 'hubspot alternatives'], country: 'US', blurb: 'Software reviewers and directories' },
  { key: 'fitness', label: 'Fitness & supplements', keywords: ['best protein powder', 'best creatine', 'protein powder review'], country: 'GB', blurb: 'Fitness creators and comparison sites' },
]

const POLL_MS = 3000
const GIVE_UP_MS = 4 * 60 * 1000

function countryName(code: string): string {
  return COUNTRIES.find(c => c.code === code)?.name ?? code
}

function siteName(lead: Lead): string {
  const t = lead.title.replace(/\s*[|–—-]\s*.*$/, '').trim()
  return (t.length >= 3 && t.length <= 40 ? t : lead.domain).replace(/^www\./, '')
}

/** The scorer was tuned on one vertical; its evidence strings say so. The
 *  demo speaks about the visitor's niche instead. */
function evidenceLabel(indicator: string): string {
  return indicator
    .replace(/\s*-\s*STRONG AFFILIATE SIGNAL$/i, '')
    .replace(/outbound casino links/gi, 'outbound partner links')
    .replace(/casino/gi, 'niche')
}

function relevanceChip(r: Relevance) {
  if (r === 'off_topic') return { label: 'Off-topic · not opened', cls: 'bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-secondary)]' }
  if (r === 'relevant') return { label: 'Relevant', cls: 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30' }
  return null
}

function kindChip(lead: Lead) {
  if (lead.skipped) return { label: 'Platform · not a partner', cls: 'bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-secondary)]' }
  if (lead.relevance === 'off_topic') return null
  if (!lead.enriched) return { label: 'Not opened in the demo', cls: 'bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-secondary)]' }
  if (lead.fetchError) return { label: 'Site blocked the visit', cls: 'bg-amber-400/15 text-amber-200' }
  switch (lead.kind) {
    case 'affiliate':
      return { label: 'Affiliate', cls: 'bg-emerald-400/15 text-emerald-300' }
    case 'operator':
      return { label: 'Operator · a brand’s own site', cls: 'bg-violet-400/15 text-violet-300' }
    case 'publisher':
      return { label: 'Publisher', cls: 'bg-sky-400/15 text-sky-300' }
    default:
      return { label: 'Unclear', cls: 'bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-secondary)]' }
  }
}

/** “one”, “two” and “three” — the run's keywords for headings. */
function kwLabel(run: Pick<Run, 'keyword' | 'keywords'>): string {
  const ks = (run.keywords && run.keywords.length ? run.keywords : [run.keyword]).map(k => `“${k}”`)
  return ks.length <= 1 ? ks.join('') : `${ks.slice(0, -1).join(', ')} and ${ks[ks.length - 1]}`
}

function emailDraft(lead: Lead, keyword: string, country: string) {
  const name = siteName(lead)
  const kind = lead.kind === 'affiliate' ? 'partner site' : 'publication'
  const brands = lead.brands.slice(0, 2).map(b => b.name)
  const mention = brands.length > 0 ? ` I see you already work with ${brands.join(' and ')} —` : ''
  return {
    subject: `Partnership idea for ${lead.domain}`,
    body:
      `Hi ${name} team,\n\n` +
      `I came across ${lead.domain} while looking at who ranks for “${keyword}” in ${countryName(country)}.` +
      `${mention} a ${kind} like yours is exactly the kind of site we partner with.\n\n` +
      `Would you be open to a quick call this week about a partnership? Happy to share our programme terms up front.\n\n` +
      `Best regards,\n[Your name]`,
  }
}

function smsDraft(lead: Lead, keyword: string, country: string) {
  return `Hi ${siteName(lead)}, saw ${lead.domain} ranking for “${keyword}” in ${countryName(country)}. We'd love to talk about a partnership — can I email you the details? [Your name]`
}

const hasContact = (l: Lead) =>
  !!l.contacts && (l.contacts.emails.length > 0 || l.contacts.phones.length > 0 || l.contacts.socials.length > 0 || !!l.contacts.contactPage)

export function LiveDemo() {
  const [keywords, setKeywords] = useState<string[]>([...PRESETS[0]!.keywords])
  const setKeywordAt = (i: number, v: string) => setKeywords(prev => prev.map((k, j) => (j === i ? v : k)))
  const usableKeywords = keywords.map(k => k.trim()).filter(k => k.length >= 2)
  const [country, setCountry] = useState(PRESETS[0]!.country)
  const [preset, setPreset] = useState<string | null>(PRESETS[0]!.key)
  const [run, setRun] = useState<Run | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The hero's "Try it now" lands here and hands over focus.
  useEffect(() => {
    const onFocus = () => inputRef.current?.focus()
    window.addEventListener('lead-engine:focus-demo', onFocus)
    return () => window.removeEventListener('lead-engine:focus-demo', onFocus)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current)
    pollRef.current = null
  }, [])

  const poll = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/demo/${id}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const next = (await res.json()) as Run
        setRun(next)
        if (next.status === 'done') {
          setModalOpen(true)
          return
        }
        if (next.status === 'failed') return
      } catch {
        /* transient — keep polling */
      }
      if (startedAt !== null && Date.now() - startedAt > GIVE_UP_MS) {
        setError('This is taking longer than usual. The results will still land — try refreshing in a minute, or run it again.')
        return
      }
      pollRef.current = setTimeout(() => void poll(id), POLL_MS)
    },
    [startedAt],
  )

  useEffect(() => () => stopPolling(), [stopPolling])

  // Elapsed seconds since the run started, shown while Google is slow to answer.
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (startedAt === null || !run || (run.status !== 'searching' && run.status !== 'enriching')) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt, run])

  async function start() {
    stopPolling()
    setError(null)
    setRun(null)
    setModalOpen(false)
    setStarting(true)
    try {
      const res = await fetch('/api/demo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: usableKeywords, country }),
      })
      const body = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !body.id) {
        setError(body.error ?? 'Could not start the demo. Try again in a moment.')
        return
      }
      setStartedAt(Date.now())
      setElapsed(0)
      setRun({ id: body.id, ai: false, status: 'searching', keyword: usableKeywords[0] ?? '', keywords: usableKeywords, country_code: country, results: [], total: 0, enriched: 0, error: null })
      pollRef.current = setTimeout(() => void poll(body.id!), 1500)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setStarting(false)
    }
  }

  const active = run !== null && (run.status === 'searching' || run.status === 'enriching')
  const results = run?.results ?? []
  const relevant = results.filter(l => l.relevance !== 'off_topic' && !l.skipped)
  const toOpen = relevant.slice(0, 8)
  const opened = toOpen.filter(l => l.enriched).length
  const affiliates = results.filter(l => l.kind === 'affiliate').length
  const withContacts = results.filter(hasContact).length
  const brandsFound = new Set(results.flatMap(l => l.brands.map(b => b.host))).size

  const steps: Array<{ label: string; state: 'todo' | 'doing' | 'done' }> = run
    ? [
        {
          label:
            run.status === 'searching'
              ? `Searching Google as someone in ${countryName(run.country_code)}${elapsed >= 15 ? ` · ${elapsed}s — Google is slow to answer for some countries; this can take up to a minute` : ''}`
              : `Searched Google as someone in ${countryName(run.country_code)}`,
          state: run.status === 'searching' ? 'doing' : 'done',
        },
        {
          label:
            run.status === 'searching'
              ? `${run.ai ? 'AI is checking' : 'Checking'} which results are about ${kwLabel(run)}`
              : `${relevant.length} of ${run.total} results are about ${kwLabel(run)}${run.ai ? ' (AI judged)' : ''}`,
          state: run.status === 'searching' ? 'todo' : 'done',
        },
        {
          label:
            run.status === 'searching'
              ? `Opening the relevant sites${run.ai ? ' — the AI decides' : ''}: affiliate, operator or publisher?`
              : `Opening the relevant sites · ${opened}/${toOpen.length} classified${run.ai ? ' by AI' : ''}`,
          state: run.status === 'searching' ? 'todo' : run.status === 'enriching' ? 'doing' : 'done',
        },
        {
          label:
            run.status === 'done'
              ? `${affiliates} affiliates · ${brandsFound} brands endorsed · ${withContacts} with contacts`
              : 'Extracting the brands endorsed, their CTA links and the contact details',
          state: run.status === 'done' ? 'done' : run.status === 'enriching' && opened > 0 ? 'doing' : 'todo',
        },
      ]
    : []

  return (
    <section id="demo" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-[color:var(--color-accent)]">
            <Sparkles className="h-3.5 w-3.5" /> Live demo
          </p>
          <h2 className="mt-3 text-[34px] font-bold leading-[1.15] md:text-[48px]">
            Go on, try it. <span className="dg-gradient-text">Your keyword, live.</span>
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[color:var(--color-text-secondary)] md:text-[18px]">
            One page of Google for each of your three keywords. An AI judge checks every result against its keyword, the relevant
            sites are opened and classified as affiliate, operator or publisher, the brands they endorse and their
            contacts are pulled, and an outreach draft is ready. Nothing is sent from the demo.
          </p>
        </div>

        <div className="dg-card mx-auto mt-10 max-w-4xl p-4 shadow-[0_0_80px_-20px_rgba(20,154,251,0.35)] sm:p-6">
          {/* presets */}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">Start from an example</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {PRESETS.map(p => {
              const on = preset === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setPreset(p.key)
                    setKeywords([...p.keywords])
                    setCountry(p.country)
                  }}
                  aria-pressed={on}
                  className={[
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    on
                      ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10'
                      : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-secondary)]',
                  ].join(' ')}
                >
                  <span className="block text-[13px] font-medium">{p.label}</span>
                  <span className="block text-[11px] text-[color:var(--color-text-secondary)]">{p.blurb}</span>
                </button>
              )
            })}
          </div>

          {/* form */}
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_190px_auto]"
            onSubmit={e => {
              e.preventDefault()
              if (!starting && !active) void start()
            }}
          >
            <fieldset className="col-span-full flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
              <legend className="mb-1">Keywords · up to three, searched together</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {keywords.map((k, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 focus-within:border-[color:var(--color-accent-hover)]"
                  >
                    <Search className="h-4 w-4 shrink-0" />
                    <input
                      ref={i === 0 ? inputRef : undefined}
                      value={k}
                      onChange={e => {
                        setKeywordAt(i, e.target.value)
                        setPreset(null)
                      }}
                      maxLength={80}
                      aria-label={`Keyword ${i + 1}`}
                      placeholder={i === 0 ? 'e.g. best vpn for streaming' : 'optional'}
                      className="min-h-11 w-full bg-transparent text-[14px] text-[color:var(--color-text-primary)] outline-none placeholder:text-[color:var(--color-text-secondary)]"
                    />
                  </span>
                ))}
              </div>
            </fieldset>
            <span className="hidden sm:block" />
            <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
              Country
              <span className="flex items-center gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3">
                <Globe className="h-4 w-4 shrink-0" />
                <select
                  value={country}
                  onChange={e => {
                    setCountry(e.target.value)
                    setPreset(null)
                  }}
                  className="min-h-11 w-full bg-transparent text-[14px] text-[color:var(--color-text-primary)] outline-none"
                >
                  {COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={starting || active || usableKeywords.length === 0}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md dg-btn dg-btn-primary px-5 text-[14px] sm:w-auto"
              >
                {starting || active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {starting ? 'Starting…' : active ? 'Running…' : 'Run demo scrape'}
              </button>
            </div>
          </form>

          <p className="mt-3 text-[12px] text-[color:var(--color-text-secondary)]">
            Results show what each site publishes on its own pages. Demo runs are deleted after 24 hours and nothing is sent.{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-[color:var(--color-text-primary)]">
              Privacy policy
            </Link>
          </p>

          {error && (
            <p data-demo-error className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[13px] text-amber-200">{error}</p>
          )}

          {/* progress */}
          {run && (
            <div className="mt-5 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold">
                  {kwLabel(run)} · {countryName(run.country_code)}
                </p>
                {run.status === 'done' && (
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-accent)] px-3 py-1.5 text-[13px] font-semibold text-[#0b0b0c] hover:bg-[color:var(--color-accent-hover)]"
                  >
                    View results <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <ol className="mt-3 flex flex-col gap-2">
                {steps.map(s => (
                  <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
                    {s.state === 'done' ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : s.state === 'doing' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[color:var(--color-text-secondary)]" />
                    ) : (
                      <CircleDashed className="h-5 w-5 text-[color:var(--color-border-strong)]" />
                    )}
                    <span className={s.state === 'todo' ? 'text-[color:var(--color-text-secondary)]' : ''}>{s.label}</span>
                  </li>
                ))}
              </ol>
              {run.status === 'failed' && (
                <p className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-[13px] text-red-300">
                  {run.error ?? 'The demo did not finish.'}
                </p>
              )}
              {run.status === 'enriching' && results.length > 0 && (
                <p className="mt-3 text-[12px] text-[color:var(--color-text-secondary)]">
                  Opening: {toOpen.slice(0, 5).map(l => l.domain).join(' · ')}
                  {toOpen.length > 5 ? ' …' : ''}
                </p>
              )}
            </div>
          )}

          <p className="mt-4 text-[11.5px] text-[color:var(--color-text-secondary)]">
            The demo runs one page per keyword and opens up to 10 relevant sites. In your workspace: more pages, 32
            countries, AI relevance and brand checks, weekly reruns and outreach that actually sends.
          </p>
        </div>
      </div>

      {run && modalOpen && <ResultsModal run={run} onClose={() => setModalOpen(false)} />}
    </section>
  )
}

// ---------------------------------------------------------------- results ----

type Compose = { lead: Lead; channel: 'email' | 'sms' } | null

function ResultsModal({ run, onClose }: { run: Run; onClose: () => void }) {
  const [compose, setCompose] = useState<Compose>(null)
  const [sent, setSent] = useState<Record<number, 'email' | 'sms'>>({})
  const [hearts, setHearts] = useState<Set<number>>(new Set())
  const [confirmation, setConfirmation] = useState<{ lead: Lead; channel: 'email' | 'sms'; to: string } | null>(null)
  const firstButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (compose || confirmation) {
          setCompose(null)
          setConfirmation(null)
        } else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    firstButton.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [compose, confirmation, onClose])

  // Ranked by usefulness, not by Google position: confirmed affiliates with
  // a complete crawl first, then the other fully crawled sites, and the rest
  // (blocked, not opened, off-topic, platforms) folded away at the bottom.
  const groups = useMemo(() => rankLeads(run.results), [run.results])
  const leads = run.results
  const [showOthers, setShowOthers] = useState(false)
  const relevant = leads.filter(l => l.relevance !== 'off_topic' && !l.skipped).length
  const affiliates = leads.filter(l => l.kind === 'affiliate').length
  const operators = leads.filter(l => l.kind === 'operator').length
  const withContacts = leads.filter(hasContact).length

  const toggleHeart = (id: number) =>
    setHearts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Results for ${(run.keywords ?? [run.keyword]).join(', ')}`}
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[color:var(--color-bg-secondary)] sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-[color:var(--color-border-strong)] sm:shadow-2xl"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--color-border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              Live results · page one of Google · {countryName(run.country_code)}
            </p>
            <h3 className="mt-0.5 truncate text-[20px] font-semibold leading-tight">{kwLabel(run)}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
              <Stat label="results" value={leads.length} />
              <Stat label="relevant" value={relevant} tone="good" />
              <Stat label="affiliates" value={affiliates} tone="good" />
              {operators > 0 && <Stat label={operators === 1 ? 'operator' : 'operators'} value={operators} tone="violet" />}
              <Stat label="with contacts" value={withContacts} tone="good" />
              {hearts.size > 0 && <Stat label="in your list" value={hearts.size} tone="accent" />}
            </div>
            {leads.length > 0 && leads.length < 8 && (
              <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-amber-200">
                Google showed only {leads.length} result{leads.length === 1 ? '' : 's'} on page one for this search in {countryName(run.country_code)}.
                Some topics, gambling above all, are filtered hard by Google in many countries. A broader phrase, or the local
                language, usually returns a full page.
              </p>
            )}
          </div>
          <button
            ref={firstButton}
            type="button"
            onClick={onClose}
            aria-label="Close results"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {confirmation ? (
            <Confirmation
              lead={confirmation.lead}
              channel={confirmation.channel}
              to={confirmation.to}
              onBack={() => setConfirmation(null)}
            />
          ) : compose ? (
            <ComposeView
              lead={compose.lead}
              channel={compose.channel}
              keyword={compose.lead.keyword || run.keyword}
              country={run.country_code}
              onBack={() => setCompose(null)}
              onSend={to => {
                setSent(prev => ({ ...prev, [compose.lead.id]: compose.channel }))
                setHearts(prev => new Set(prev).add(compose.lead.id))
                setConfirmation({ lead: compose.lead, channel: compose.channel, to })
                setCompose(null)
              }}
            />
          ) : (
            <div className="flex flex-col gap-5">
              {groups.affiliates.length > 0 && (
                <Group title="Affiliates" hint="Fully crawled and confirmed — the ones to pitch" count={groups.affiliates.length} tone="good">
                  {groups.affiliates.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      hearted={hearts.has(lead.id)}
                      sentVia={sent[lead.id] ?? null}
                      onToggleHeart={() => toggleHeart(lead.id)}
                      onEmail={() => setCompose({ lead, channel: 'email' })}
                      onSms={() => setCompose({ lead, channel: 'sms' })}
                    />
                  ))}
                </Group>
              )}
              {groups.crawled.length > 0 && (
                <Group title="Also crawled" hint="Operators and publishers in the same market" count={groups.crawled.length} tone="muted">
                  {groups.crawled.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      hearted={hearts.has(lead.id)}
                      sentVia={sent[lead.id] ?? null}
                      onToggleHeart={() => toggleHeart(lead.id)}
                      onEmail={() => setCompose({ lead, channel: 'email' })}
                      onSms={() => setCompose({ lead, channel: 'sms' })}
                    />
                  ))}
                </Group>
              )}
              {groups.affiliates.length === 0 && groups.crawled.length === 0 && leads.length > 0 && (
                <p className="rounded-md border border-dashed border-[color:var(--color-border-strong)] p-6 text-center text-[13px] text-[color:var(--color-text-secondary)]">
                  None of the page-one results could be crawled and confirmed. The rest are below.
                </p>
              )}
              {groups.others.length > 0 && (
                <div className="rounded-xl border border-dashed border-[color:var(--color-border-strong)]">
                  <button
                    type="button"
                    onClick={() => setShowOthers(v => !v)}
                    aria-expanded={showOthers}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] hover:bg-[color:var(--color-bg-secondary)]"
                  >
                    <span>
                      <span className="font-medium">{groups.others.length} other result{groups.others.length === 1 ? '' : 's'}</span>
                      <span className="text-[color:var(--color-text-secondary)]"> — {othersSummary(groups.others)}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-[color:var(--color-text-secondary)]">{showOthers ? 'Hide' : 'Show'}</span>
                  </button>
                  {showOthers && (
                    <div className="grid gap-3 border-t border-dashed border-[color:var(--color-border-strong)] p-4 md:grid-cols-2">
                      {groups.others.map(lead => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          hearted={hearts.has(lead.id)}
                          sentVia={sent[lead.id] ?? null}
                          onToggleHeart={() => toggleHeart(lead.id)}
                          onEmail={() => setCompose({ lead, channel: 'email' })}
                          onSms={() => setCompose({ lead, channel: 'sms' })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {leads.length === 0 && (
                <p className="rounded-md border border-dashed border-[color:var(--color-border-strong)] p-6 text-center text-[13px] text-[color:var(--color-text-secondary)]">
                  Google returned no results for this keyword in {countryName(run.country_code)}. Try another phrase.
                </p>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] px-5 py-3">
          <p className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--color-text-secondary)]">
            <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
            {hearts.size > 0
              ? `${hearts.size} in your relevant list. Keep them, add follow-up dates and send for real in your workspace.`
              : 'Tap the heart on the sites worth a conversation, draft an email or SMS — then keep it all in a free workspace.'}
          </p>
          <Link
            href="/signup"
            className="inline-flex min-h-10 items-center gap-2 dg-btn dg-btn-primary px-4 text-[13px]"
          >
            Create a free account
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Crawled to the end with no fetch error. */
const complete = (l: Lead) => l.enriched && !l.fetchError && !l.skipped && l.relevance !== 'off_topic'

/** Ties inside a group break on how much there is to work with. */
function usefulness(l: Lead): number {
  return l.brands.length * 3 + Math.min(l.ctaLinks, 20) + (hasContact(l) ? 5 : 0) + (l.contacts?.emails.length ? 3 : 0)
}

function rankLeads(results: Lead[]): { affiliates: Lead[]; crawled: Lead[]; others: Lead[] } {
  const byUse = (a: Lead, b: Lead) => usefulness(b) - usefulness(a) || a.position - b.position
  const affiliates = results.filter(l => complete(l) && l.kind === 'affiliate').sort(byUse)
  const crawled = results.filter(l => complete(l) && l.kind !== 'affiliate').sort(byUse)
  const done = new Set([...affiliates, ...crawled].map(l => l.id))
  // Blocked and not-opened first (still relevant), then off-topic and platforms.
  const others = results
    .filter(l => !done.has(l.id))
    .sort((a, b) => {
      const ra = a.relevance === 'off_topic' || a.skipped ? 1 : 0
      const rb = b.relevance === 'off_topic' || b.skipped ? 1 : 0
      return ra - rb || a.position - b.position
    })
  return { affiliates, crawled, others }
}

function othersSummary(others: Lead[]): string {
  const blocked = others.filter(l => l.enriched && l.fetchError).length
  const notOpened = others.filter(l => !l.enriched && !l.skipped && l.relevance !== 'off_topic').length
  const offTopic = others.filter(l => l.relevance === 'off_topic' && !l.skipped).length
  const platforms = others.filter(l => l.skipped).length
  const parts: string[] = []
  if (blocked) parts.push(`${blocked} blocked the visit`)
  if (notOpened) parts.push(`${notOpened} not opened`)
  if (offTopic) parts.push(`${offTopic} off-topic`)
  if (platforms) parts.push(`${platforms} platform${platforms === 1 ? '' : 's'}`)
  return parts.join(', ')
}

function Group({ title, hint, count, tone, children }: { title: string; hint: string; count: number; tone: 'good' | 'muted'; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h4 className="text-[13px] font-semibold">
          {title}{' '}
          <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] ${tone === 'good' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-secondary)]'}`}>
            {count}
          </span>
        </h4>
        <span className="text-[12px] text-[color:var(--color-text-secondary)]">{hint}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

function Stat({ label, value, tone = 'muted' }: { label: string; value: number; tone?: 'muted' | 'good' | 'warn' | 'accent' | 'violet' }) {
  const cls =
    tone === 'good'
      ? 'bg-emerald-400/15 text-emerald-300'
      : tone === 'warn'
        ? 'bg-amber-400/15 text-amber-200'
        : tone === 'violet'
          ? 'bg-violet-400/15 text-violet-300'
          : tone === 'accent'
            ? 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]'
            : 'bg-[color:var(--color-bg-secondary)] text-[color:var(--color-text-secondary)]'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${cls}`}>
      <span className="tabular-nums">{value}</span> {label}
    </span>
  )
}

function LeadCard({
  lead,
  hearted,
  sentVia,
  onToggleHeart,
  onEmail,
  onSms,
}: {
  lead: Lead
  hearted: boolean
  sentVia: 'email' | 'sms' | null
  onToggleHeart: () => void
  onEmail: () => void
  onSms: () => void
}) {
  const rel = relevanceChip(lead.relevance)
  const kind = kindChip(lead)
  const c = lead.contacts
  const hasEmail = !!c?.emails.length
  const hasPhone = !!c?.phones.length
  const dim = lead.relevance === 'off_topic' || lead.skipped
  const [iconFailed, setIconFailed] = useState(false)
  return (
    <article
      data-demo-card
      className={[
        'flex flex-col gap-3 rounded-xl border bg-[color:var(--color-bg-primary)] p-4',
        hearted ? 'border-rose-400/40 ring-1 ring-rose-400/30' : 'border-[color:var(--color-border)]',
        dim ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {iconFailed ? (
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-accent)]/15 text-[13px] font-semibold uppercase text-[color:var(--color-accent)]">
            {lead.domain.charAt(0)}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(lead.domain)}&sz=64`}
            alt=""
            width={32}
            height={32}
            loading="lazy"
            onError={() => setIconFailed(true)}
            className="mt-0.5 h-8 w-8 shrink-0 rounded-md border border-[color:var(--color-border)] bg-white p-1"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <a
              href={lead.url}
              target="_blank"
              rel="noreferrer noopener"
              className="truncate text-[14px] font-semibold text-[color:var(--color-text-primary)] hover:underline"
              title={lead.title}
            >
              {siteName(lead)}
            </a>
            <span className="rounded-full bg-[color:var(--color-bg-secondary)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              {lead.type === 'PPC' ? 'Ad' : `#${lead.position}`}
              {lead.keyword ? ` · ${lead.keyword}` : ''}
            </span>
          </div>
          <p className="truncate text-[12px] text-[color:var(--color-text-secondary)]">
            {lead.domain}
            {lead.market && <span> · {lead.market}</span>}
          </p>
          {lead.siteDescription && (
            <p className="mt-0.5 line-clamp-1 text-[12px] italic text-[color:var(--color-text-secondary)]" title={lead.relevanceReason ?? undefined}>
              {lead.siteDescription}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleHeart}
          aria-pressed={hearted}
          aria-label={hearted ? 'Remove from relevant list' : 'Add to relevant list'}
          title={hearted ? 'In your relevant list' : 'Add to your relevant list'}
          className={[
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
            hearted
              ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
              : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:border-rose-400/40 hover:text-rose-300',
          ].join(' ')}
        >
          <Heart className={`h-4 w-4 ${hearted ? 'fill-rose-500 text-rose-500' : ''}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {rel && <span title={lead.relevanceReason ?? undefined} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${rel.cls}`}>{rel.label}</span>}
        {kind && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${kind.cls}`}>{kind.label}</span>}
      </div>

      {lead.snippet && <p className="line-clamp-2 text-[12.5px] leading-relaxed text-[color:var(--color-text-secondary)]">{lead.snippet}</p>}

      {/* brands endorsed + CTA links */}
      {lead.enriched && !lead.fetchError && (lead.brands.length > 0 || lead.ctaLinks > 0) && (
        <div className="rounded-md bg-[color:var(--color-bg-secondary)] px-2.5 py-2 text-[12px]">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="inline-flex items-center gap-1 font-medium text-[color:var(--color-text-primary)]">
              <Link2 className="h-3.5 w-3.5" /> {lead.kind === 'affiliate' ? 'Endorses' : 'Mentions'}
            </span>
            {lead.brands.length === 0 && <span className="text-[color:var(--color-text-secondary)]">no brand we could resolve</span>}
            {lead.brands.map(b => (
              <span key={b.host} title={b.host} className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-2 py-0.5">
                {b.name}
                {b.links > 1 && <span className="ml-1 text-[color:var(--color-text-secondary)]">×{b.links}</span>}
              </span>
            ))}
            <span className="ml-auto text-[color:var(--color-text-secondary)]">
              {lead.ctaLinks} CTA link{lead.ctaLinks === 1 ? '' : 's'}
            </span>
          </p>
        </div>
      )}

      {lead.indicators.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {lead.indicators.slice(0, 2).map(i => (
            <li key={i} className="rounded-md bg-[color:var(--color-bg-secondary)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-secondary)]">
              {evidenceLabel(i)}
            </li>
          ))}
        </ul>
      )}

      {/* contacts */}
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        {c?.emails.slice(0, 2).map(e => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] px-2 py-0.5">
            <Mail className="h-3 w-3" /> {e}
          </span>
        ))}
        {c?.phones.slice(0, 1).map(p => (
          <span key={p} className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] px-2 py-0.5">
            <Phone className="h-3 w-3" /> {p}
          </span>
        ))}
        {c?.socials.slice(0, 3).map(s => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] px-2 py-0.5 capitalize hover:bg-[color:var(--color-bg-secondary)]"
          >
            <AtSign className="h-3 w-3" /> {s.platform}
          </a>
        ))}
        {c?.contactPage && (
          <a
            href={c.contactPage}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] px-2 py-0.5 hover:bg-[color:var(--color-bg-secondary)]"
          >
            <ExternalLink className="h-3 w-3" /> Contact page
          </a>
        )}
        {lead.enriched && !lead.fetchError && c && !hasContact(lead) && (
          <span className="text-[color:var(--color-text-secondary)]">No public contact found on the first pages.</span>
        )}
        {lead.relevance === 'off_topic' && !lead.skipped && (
          <span className="text-[color:var(--color-text-secondary)]">Not about the keyword, so we did not open it.</span>
        )}
        {lead.skipped && <span className="text-[color:var(--color-text-secondary)]">A platform, not a site to pitch.</span>}
        {!lead.enriched && !lead.skipped && lead.relevance !== 'off_topic' && (
          <span className="text-[color:var(--color-text-secondary)]">Opened in the full product.</span>
        )}
      </div>

      {/* actions */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onEmail}
          disabled={!hasEmail}
          title={hasEmail ? 'Draft an email' : 'No email found'}
          className="inline-flex min-h-9 items-center gap-1.5 dg-btn dg-btn-primary min-h-9 px-3 text-[12.5px]"
        >
          <Mail className="h-3.5 w-3.5" /> Email
        </button>
        <button
          type="button"
          onClick={onSms}
          disabled={!hasPhone}
          title={hasPhone ? 'Draft an SMS' : 'No phone number found'}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[color:var(--color-border-strong)] px-3 text-[12.5px] font-semibold disabled:opacity-30"
        >
          <MessageSquareText className="h-3.5 w-3.5" /> SMS
        </button>
        {sentVia && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-300">
            <BadgeCheck className="h-3.5 w-3.5" /> {sentVia === 'email' ? 'Email drafted' : 'SMS drafted'}
          </span>
        )}
      </div>
    </article>
  )
}

function ComposeView({
  lead,
  channel,
  keyword,
  country,
  onBack,
  onSend,
}: {
  lead: Lead
  channel: 'email' | 'sms'
  keyword: string
  country: string
  onBack: () => void
  onSend: (to: string) => void
}) {
  const draft = useMemo(() => emailDraft(lead, keyword, country), [lead, keyword, country])
  const [to, setTo] = useState(channel === 'email' ? lead.contacts?.emails[0] ?? '' : lead.contacts?.phones[0] ?? '')
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(channel === 'email' ? draft.body : smsDraft(lead, keyword, country))
  const options = channel === 'email' ? lead.contacts?.emails ?? [] : lead.contacts?.phones ?? []

  return (
    <div className="mx-auto max-w-2xl">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[12.5px] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to results
      </button>
      <h4 className="mt-3 text-[18px] font-semibold">
        {channel === 'email' ? 'Email' : 'SMS'} to {siteName(lead)}
      </h4>
      <p className="mt-1 text-[12.5px] text-[color:var(--color-text-secondary)]">
        Drafted from the scrape: the site, the keyword it ranks for, the market{lead.brands.length > 0 ? ' and the brands it already endorses' : ''}. Edit anything.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
          To
          {options.length > 1 ? (
            <select value={to} onChange={e => setTo(e.target.value)} className="min-h-10 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 text-[13px] text-[color:var(--color-text-primary)]">
              {options.map(o => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input value={to} onChange={e => setTo(e.target.value)} className="min-h-10 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 text-[13px] text-[color:var(--color-text-primary)]" />
          )}
        </label>
        {channel === 'email' && (
          <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
            Subject
            <input value={subject} onChange={e => setSubject(e.target.value)} className="min-h-10 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 text-[13px] text-[color:var(--color-text-primary)]" />
          </label>
        )}
        <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Message
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={channel === 'email' ? 9 : 4}
            maxLength={channel === 'sms' ? 320 : 4000}
            className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] leading-relaxed text-[color:var(--color-text-primary)]"
          />
          {channel === 'sms' && <span className="text-right text-[11px]">{body.length}/320</span>}
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px] text-[color:var(--color-text-secondary)]">
            Demo: nothing is sent. In your workspace this goes through your connected {channel === 'email' ? 'email' : 'SMS'} provider.
          </p>
          <button
            type="button"
            onClick={() => onSend(to)}
            disabled={!to.trim() || !body.trim()}
            className="inline-flex min-h-10 items-center gap-2 dg-btn dg-btn-primary px-4 text-[13px]"
          >
            <Send className="h-4 w-4" /> Send {channel === 'email' ? 'email' : 'SMS'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Confirmation({ lead, channel, to, onBack }: { lead: Lead; channel: 'email' | 'sms'; to: string; onBack: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-8 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
        <BadgeCheck className="h-6 w-6" />
      </span>
      <h4 className="text-[20px] font-semibold">{channel === 'email' ? 'Email' : 'SMS'} drafted for {siteName(lead)}</h4>
      <p className="text-[13.5px] text-[color:var(--color-text-secondary)]">
        Addressed to <span className="font-medium text-[color:var(--color-text-primary)]">{to}</span>. Nothing was sent from this demo.
        In your workspace the same click goes out through your connected {channel === 'email' ? 'email' : 'SMS'} provider, the lead is marked
        <span className="font-medium text-[color:var(--color-text-primary)]"> Contacted</span>, and a follow-up reminder lands on your home page.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[color:var(--color-border-strong)] px-4 text-[13px] font-medium">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to results
        </button>
        <Link href="/signup" className="inline-flex min-h-10 items-center gap-2 dg-btn dg-btn-primary px-4 text-[13px]">
          Send for real — create a free account <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
