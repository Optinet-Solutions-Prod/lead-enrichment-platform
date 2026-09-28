'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { CREDIT_PACKS, CREDIT_USAGE, PLANS, money, type Currency } from '@/lib/pricing'

/**
 * Plans + top-up packs with a currency and billing-period toggle. Every
 * plan CTA leads to the free signup — you start on Free and upgrade from
 * Billing & Credits, so the page never promises a checkout it can't do yet.
 */
export function Pricing({ compact = false }: { compact?: boolean }) {
  const [currency, setCurrency] = useState<Currency>('EUR')
  const [yearly, setYearly] = useState(true)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex overflow-hidden rounded-md border border-[color:var(--color-border)]">
          {(['EUR', 'USD'] as const).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={[
                'min-h-10 px-3.5 text-[13px] font-medium transition-colors',
                currency === c
                  ? 'bg-[color:var(--color-accent)] text-[color:var(--color-text-primary)]'
                  : 'bg-[color:var(--color-bg-primary)] text-[color:var(--color-text-secondary)]',
              ].join(' ')}
            >
              {c === 'EUR' ? '€ EUR' : '$ USD'}
            </button>
          ))}
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-[color:var(--color-border)]">
          {[
            { v: false, label: 'Monthly' },
            { v: true, label: 'Yearly · save 20%' },
          ].map(o => (
            <button
              key={o.label}
              type="button"
              onClick={() => setYearly(o.v)}
              className={[
                'min-h-10 px-3.5 text-[13px] font-medium transition-colors',
                yearly === o.v
                  ? 'bg-[color:var(--color-accent)] text-[color:var(--color-text-primary)]'
                  : 'bg-[color:var(--color-bg-primary)] text-[color:var(--color-text-secondary)]',
              ].join(' ')}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map(p => {
          const price = yearly ? p.yearly : p.monthly
          const amount = currency === 'EUR' ? price.eur : price.usd
          return (
            <div
              key={p.key}
              className={[
                'relative flex flex-col rounded-xl border bg-[color:var(--color-bg-primary)] p-5',
                p.popular
                  ? 'border-[color:var(--color-accent-hover)] shadow-[0_20px_50px_-30px_rgba(255,154,133,0.9)] ring-1 ring-[color:var(--color-accent-hover)]'
                  : 'border-[color:var(--color-border)]',
              ].join(' ')}
            >
              {p.popular && (
                <span className="absolute -top-3 left-4 inline-flex items-center gap-1 rounded-full bg-[color:var(--color-accent)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  <Sparkles className="h-3 w-3" />
                  Most popular
                </span>
              )}
              <p className="text-[15px] font-semibold">{p.name}</p>
              <p className="mt-0.5 min-h-[2.5em] text-[12px] text-[color:var(--color-text-secondary)]">{p.tagline}</p>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-[30px] font-semibold tabular-nums leading-none">{money(amount, currency)}</span>
                {amount > 0 && <span className="text-[12px] text-[color:var(--color-text-secondary)]">/ month</span>}
              </p>
              <p className="mt-1 text-[11px] text-[color:var(--color-text-secondary)]">
                {amount > 0 && yearly ? 'billed yearly · ' : ''}
                {p.creditsNote} · {p.members}
              </p>
              <ul className="mt-4 flex flex-1 flex-col gap-1.5">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-[12px] leading-snug">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={p.key === 'scale' ? 'mailto:admin@optinetsolutions.com?subject=Lead%20Engine%20Scale' : `/signup?plan=${p.key}`}
                className={[
                  'mt-5 inline-flex min-h-11 items-center justify-center rounded-md px-3 text-[13px] font-medium transition-colors',
                  p.popular
                    ? 'bg-[color:var(--color-accent)] hover:bg-[color:var(--color-accent-hover)]'
                    : 'border border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-bg-secondary)]',
                ].join(' ')}
              >
                {p.cta}
              </Link>
            </div>
          )
        })}
      </div>

      {!compact && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <p className="text-[14px] font-semibold">Need more this month? Top up.</p>
            <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
              Plan credits reset monthly; top-up credits never expire and work on every plan, Free included.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {CREDIT_PACKS.map(pk => (
                <div key={pk.key} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-3">
                  <p className="text-[18px] font-semibold tabular-nums leading-none">{money(currency === 'EUR' ? pk.eur : pk.usd, currency)}</p>
                  <p className="mt-1 text-[12px]">{pk.credits.toLocaleString()} credits</p>
                  <p className="text-[10px] text-[color:var(--color-text-secondary)]">~€{pk.perCreditEur} per credit</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--color-border)] p-5">
            <p className="text-[14px] font-semibold">What a credit buys</p>
            <table className="mt-2 w-full text-[12px]">
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {CREDIT_USAGE.map(u => (
                  <tr key={u.action}>
                    <td className="py-1.5 pr-2 text-[color:var(--color-text-secondary)]">{u.action}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{u.credits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
