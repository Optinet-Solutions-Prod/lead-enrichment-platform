'use client'

import { useState, useTransition } from 'react'
import { AtSign, Copy, Cpu, Download, Loader2, MailCheck, PenLine, Search, ShieldCheck, UserSearch } from 'lucide-react'
import {
  checkEmailAuthAction,
  guessEmailsAction,
  lookupTechAction,
  searchDomainsAction,
  verifyEmailsAction,
  writeEmailAction,
} from '../actions'

type Tab = 'domain' | 'verify' | 'pattern' | 'auth' | 'tech' | 'writer'

const TABS: Array<{ key: Tab; label: string; icon: typeof Search; blurb: string }> = [
  { key: 'domain', label: 'Domain search', icon: Search, blurb: 'Emails, phones and socials a website publishes. Up to 10 sites at once.' },
  { key: 'verify', label: 'Email verifier', icon: MailCheck, blurb: 'Check a list before you write: format, mail server, throwaway and role inboxes.' },
  { key: 'pattern', label: 'Email pattern finder', icon: UserSearch, blurb: 'Likely addresses for a named person at a company.' },
  { key: 'tech', label: 'Tech & affiliate networks', icon: Cpu, blurb: 'Which affiliate networks, ad stacks and CMS a site runs on.' },
  { key: 'auth', label: 'Sender check', icon: ShieldCheck, blurb: 'SPF, DKIM, DMARC and MX for your own sending domain.' },
  { key: 'writer', label: 'AI email writer', icon: PenLine, blurb: 'A first partnership email or SMS, written from the site itself.' },
]

const inputCls =
  'min-h-10 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 text-[13px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-secondary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]'
const btnCls =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-[color:var(--color-text-primary)] px-4 text-[13px] font-medium text-white disabled:opacity-40'

/** A failed request (network, timeout) shows as an error line, never a stuck spinner. */
async function callSafe<T>(p: Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await p
  } catch {
    return { ok: false, error: 'The request failed. Try again in a moment.' }
  }
}

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function Verdict({ v }: { v: string }) {
  const map: Record<string, [string, string]> = {
    deliverable_domain: ['Accepts mail', 'bg-emerald-50 text-emerald-800 border-emerald-200'],
    risky: ['Risky', 'bg-amber-50 text-amber-900 border-amber-200'],
    undeliverable: ['No mail server', 'bg-rose-50 text-rose-800 border-rose-200'],
    invalid: ['Invalid', 'bg-rose-50 text-rose-800 border-rose-200'],
    pass: ['Pass', 'bg-emerald-50 text-emerald-800 border-emerald-200'],
    warn: ['Check', 'bg-amber-50 text-amber-900 border-amber-200'],
    missing: ['Missing', 'bg-rose-50 text-rose-800 border-rose-200'],
  }
  const [label, cls] = map[v] ?? [v, 'bg-[color:var(--color-bg-secondary)] border-[color:var(--color-border)]']
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
}

function ErrorLine({ text }: { text: string | null }) {
  return text ? <p role="alert" className="mt-2 text-[12.5px] text-rose-700">{text}</p> : null
}

export function LabsTools() {
  const [tab, setTab] = useState<Tab>('domain')
  const active = TABS.find(t => t.key === tab)!
  return (
    <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]">
      <div role="tablist" aria-label="Labs tools" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-[color:var(--color-border)] p-2">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={[
              'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium transition-colors',
              tab === t.key ? 'bg-[color:var(--color-accent)]/30 text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-secondary)]',
            ].join(' ')}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        <p className="text-[12px] text-[color:var(--color-text-secondary)]">{active.blurb}</p>
        <div className="mt-3">
          {tab === 'domain' && <DomainSearch />}
          {tab === 'verify' && <Verifier />}
          {tab === 'pattern' && <PatternFinder />}
          {tab === 'tech' && <TechLookup />}
          {tab === 'auth' && <SenderCheck />}
          {tab === 'writer' && <Writer />}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- tools ----

function DomainSearch() {
  const [text, setText] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchDomainsAction>> | null>(null)
  const ok = results && results.ok ? results.results : []
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={2}
          placeholder="example.com, another-site.co.uk — one per line or comma-separated"
          aria-label="Websites"
          className={`${inputCls} py-2`}
        />
        <button
          type="button"
          className={`${btnCls} sm:self-start`}
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await callSafe(searchDomainsAction(text))
              if (!r.ok) setError(r.error)
              setResults(r)
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find contacts
        </button>
      </div>
      <ErrorLine text={error} />
      {ok.length > 0 && (
        <>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[12px] underline text-[color:var(--color-text-secondary)]"
              onClick={() =>
                downloadCsv('domain-search.csv', [
                  ['domain', 'email', 'email_status', 'role_inbox', 'phones', 'contact_page', 'socials'],
                  ...ok.flatMap(d =>
                    (d.emails.length ? d.emails : [null]).map(e => [
                      d.domain,
                      e?.email ?? '',
                      e?.verdict ?? '',
                      e ? String(e.role) : '',
                      d.phones.join(' '),
                      d.contactPage ?? '',
                      d.socials.map(s => s.url).join(' '),
                    ]),
                  ),
                ])
              }
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
          <ul className="mt-2 flex flex-col gap-2" data-labs-domain-results>
            {ok.map(d => (
              <li key={d.domain} className="rounded-lg border border-[color:var(--color-border)] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-semibold">{d.domain}</p>
                  <span className="text-[11px] text-[color:var(--color-text-secondary)]">
                    {d.ok ? `${d.pagesRead.length} page${d.pagesRead.length === 1 ? '' : 's'} read` : d.error}
                  </span>
                </div>
                {d.ok && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                    {d.emails.map(e => (
                      <span key={e.email} className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border)] px-2 py-0.5">
                        <AtSign className="h-3 w-3" /> {e.email} <Verdict v={e.verdict} />
                        {e.role && <span className="text-[10.5px] text-[color:var(--color-text-secondary)]">team inbox</span>}
                      </span>
                    ))}
                    {d.phones.map(p => (
                      <span key={p} className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5">{p}</span>
                    ))}
                    {d.socials.map(s => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 underline-offset-2 hover:underline">
                        {s.platform}
                      </a>
                    ))}
                    {d.contactPage && (
                      <a href={d.contactPage} target="_blank" rel="noreferrer" className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 underline-offset-2 hover:underline">
                        Contact page
                      </a>
                    )}
                    {d.emails.length + d.phones.length + d.socials.length === 0 && !d.contactPage && (
                      <span className="text-[color:var(--color-text-secondary)]">Nothing published on the pages we could read.</span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Verifier() {
  const [text, setText] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<Awaited<ReturnType<typeof verifyEmailsAction>> | null>(null)
  const rows = res && res.ok ? res.results : []
  return (
    <div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4}
        placeholder="Paste up to 50 email addresses"
        aria-label="Email addresses"
        className={`${inputCls} py-2`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={btnCls}
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await callSafe(verifyEmailsAction(text))
              if (!r.ok) setError(r.error)
              setRes(r)
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />} Verify
        </button>
        <span className="text-[11.5px] text-[color:var(--color-text-secondary)]">
          Checks the domain&rsquo;s mail server, not the individual mailbox — no test email is sent.
        </span>
      </div>
      <ErrorLine text={error} />
      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12.5px]" data-labs-verify-results>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                <th className="py-1.5 pr-3">Email</th>
                <th className="py-1.5 pr-3">Result</th>
                <th className="py-1.5 pr-3">Why</th>
                <th className="py-1.5">Mail server</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-border)]">
              {rows.map(r => (
                <tr key={r.email}>
                  <td className="py-1.5 pr-3 font-medium">{r.email}</td>
                  <td className="py-1.5 pr-3"><Verdict v={r.verdict} /></td>
                  <td className="py-1.5 pr-3 text-[color:var(--color-text-secondary)]">{r.reason}</td>
                  <td className="py-1.5 text-[color:var(--color-text-secondary)]">{r.mx[0] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-[12px] underline text-[color:var(--color-text-secondary)]"
            onClick={() => downloadCsv('verified-emails.csv', [['email', 'result', 'reason', 'role', 'disposable', 'mx'], ...rows.map(r => [r.email, r.verdict, r.reason, String(r.role), String(r.disposable), r.mx[0] ?? ''])])}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          {res && res.ok && res.capped && <p className="mt-1 text-[11.5px] text-amber-800">Only the first 50 were checked.</p>}
        </div>
      )}
    </div>
  )
}

function PatternFinder() {
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [domain, setDomain] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<Awaited<ReturnType<typeof guessEmailsAction>> | null>(null)
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
        <input value={first} onChange={e => setFirst(e.target.value)} placeholder="First name" aria-label="First name" className={inputCls} />
        <input value={last} onChange={e => setLast(e.target.value)} placeholder="Last name" aria-label="Last name" className={inputCls} />
        <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="company.com" aria-label="Company website" className={inputCls} />
        <button
          type="button"
          className={btnCls}
          disabled={pending || !first.trim() || !last.trim() || !domain.trim()}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await callSafe(guessEmailsAction(first, last, domain))
              if (!r.ok) setError(r.error)
              setRes(r)
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserSearch className="h-4 w-4" />} Find
        </button>
      </div>
      <ErrorLine text={error} />
      {res && res.ok && (
        <div className="mt-3" data-labs-pattern-results>
          <p className="text-[12px] text-[color:var(--color-text-secondary)]">
            {res.acceptsMail ? `${res.domain} accepts mail.` : `${res.domain} has no mail server — these will bounce.`}{' '}
            {res.detectedPattern ? `The site publishes named addresses in the ${res.detectedPattern} pattern, so that one is first.` : 'No named addresses on the site, so these follow the most common patterns.'}{' '}
            They are guesses until someone replies.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {res.guesses.map(g => (
              <li key={g.email}>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(g.email)}
                  title={`Copy · pattern ${g.pattern}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] ${g.likely ? 'border-[color:var(--color-accent-hover)] bg-[color:var(--color-accent)]/20 font-medium' : 'border-[color:var(--color-border)]'}`}
                >
                  <Copy className="h-3 w-3" /> {g.email}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function TechLookup() {
  const [domain, setDomain] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<Awaited<ReturnType<typeof lookupTechAction>> | null>(null)
  const groups = res && res.ok ? Object.entries(res.hits.reduce<Record<string, typeof res.hits>>((acc, h) => ((acc[h.category] ??= []).push(h), acc), {})) : []
  return (
    <div>
      <div className="flex gap-2">
        <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="a review or comparison site, e.g. cnet.com" aria-label="Website" className={inputCls} />
        <button
          type="button"
          className={btnCls}
          disabled={pending || !domain.trim()}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await callSafe(lookupTechAction(domain))
              if (!r.ok) setError(r.error)
              setRes(r)
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />} Look up
        </button>
      </div>
      <ErrorLine text={error} />
      {res && res.ok && (
        <div className="mt-3" data-labs-tech-results>
          {groups.length === 0 ? (
            <p className="text-[12.5px] text-[color:var(--color-text-secondary)]">Nothing recognisable on the home page.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {groups.map(([cat, hits]) => (
                <div key={cat} className={`rounded-lg border p-3 ${cat.startsWith('Affiliate') ? 'border-emerald-300 bg-emerald-50/40' : 'border-[color:var(--color-border)]'}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">{cat}</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {hits.map(h => (
                      <li key={h.name} className="text-[12.5px]">
                        <span className="font-medium">{h.name}</span>{' '}
                        <code className="text-[11px] text-[color:var(--color-text-secondary)]">{h.evidence}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {res.server && <p className="mt-2 text-[11.5px] text-[color:var(--color-text-secondary)]">Server: {res.server}</p>}
        </div>
      )}
    </div>
  )
}

function SenderCheck() {
  const [domain, setDomain] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<Awaited<ReturnType<typeof checkEmailAuthAction>> | null>(null)
  return (
    <div>
      <div className="flex gap-2">
        <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="your sending domain, e.g. yourbrand.com" aria-label="Sending domain" className={inputCls} />
        <button
          type="button"
          className={btnCls}
          disabled={pending || !domain.trim()}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await callSafe(checkEmailAuthAction(domain))
              if (!r.ok) setError(r.error)
              setRes(r)
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Check
        </button>
      </div>
      <ErrorLine text={error} />
      {res && res.ok && (
        <ul className="mt-3 flex flex-col gap-2" data-labs-auth-results>
          {res.checks.map(c => (
            <li key={c.name} className="rounded-lg border border-[color:var(--color-border)] p-3">
              <div className="flex items-center gap-2">
                <span className="w-14 text-[13px] font-semibold">{c.name}</span>
                <Verdict v={c.status} />
              </div>
              {c.record && <p className="mt-1 break-all font-mono text-[11.5px] text-[color:var(--color-text-secondary)]">{c.record}</p>}
              <p className="mt-1 text-[12px]">{c.advice}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Writer() {
  const [domain, setDomain] = useState('')
  const [brand, setBrand] = useState('')
  const [offer, setOffer] = useState('')
  const [senderName, setSenderName] = useState('')
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [tone, setTone] = useState<'friendly' | 'direct' | 'formal'>('friendly')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<Awaited<ReturnType<typeof writeEmailAction>> | null>(null)
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="Site you're writing to, e.g. cnet.com" aria-label="Site" className={inputCls} />
        <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Your brand" aria-label="Your brand" className={inputCls} />
        <input value={offer} onChange={e => setOffer(e.target.value)} placeholder="Offer (optional), e.g. 40% revenue share" aria-label="Offer" className={inputCls} />
        <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Your name" aria-label="Your name" className={inputCls} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        {(['email', 'sms'] as const).map(c => (
          <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)} className={`rounded-md border px-3 py-1.5 ${channel === c ? 'border-[color:var(--color-accent-hover)] bg-[color:var(--color-accent)]/25' : 'border-[color:var(--color-border)]'}`}>
            {c === 'email' ? 'Email' : 'SMS'}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-[color:var(--color-border)]" />
        {(['friendly', 'direct', 'formal'] as const).map(t => (
          <button key={t} type="button" aria-pressed={tone === t} onClick={() => setTone(t)} className={`rounded-md border px-3 py-1.5 capitalize ${tone === t ? 'border-[color:var(--color-accent-hover)] bg-[color:var(--color-accent)]/25' : 'border-[color:var(--color-border)]'}`}>
            {t}
          </button>
        ))}
        <button
          type="button"
          className={`${btnCls} ml-auto`}
          disabled={pending || !domain.trim() || !brand.trim()}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await callSafe(writeEmailAction({ domain, brand, offer, channel, tone, senderName }))
              if (!r.ok) setError(r.error)
              setRes(r)
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} Write
        </button>
      </div>
      <ErrorLine text={error} />
      {res && res.ok && (
        <div className="mt-3 rounded-lg border border-[color:var(--color-border)] p-3" data-labs-writer-result>
          <p className="text-[11px] text-[color:var(--color-text-secondary)]">
            {res.source === 'ai' ? 'Written by AI' : 'Template (no AI key on this server)'}
            {res.siteTitle ? ` · read “${res.siteTitle.slice(0, 70)}”` : ''} · nothing is sent
          </p>
          {res.subject && <p className="mt-2 text-[13px] font-semibold">{res.subject}</p>}
          <textarea readOnly value={res.body} rows={channel === 'sms' ? 3 : 10} aria-label="Draft" className={`${inputCls} mt-2 py-2`} />
          <button type="button" onClick={() => void navigator.clipboard?.writeText([res.subject, res.body].filter(Boolean).join('\n\n'))} className="mt-2 inline-flex items-center gap-1 text-[12px] underline text-[color:var(--color-text-secondary)]">
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>
      )}
    </div>
  )
}
