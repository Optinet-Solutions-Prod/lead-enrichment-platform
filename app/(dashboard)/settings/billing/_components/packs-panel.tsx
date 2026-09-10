'use client'

import { useState, useTransition } from 'react'
import { CreditCard, Lock, Sparkles } from 'lucide-react'
import { setCurrencyAction, startCheckoutAction } from '../actions'

export type PackView = {
  key: string
  name: string
  credits: number
  eur: number
  usd: number
  perCreditEur: string
  popular?: boolean
  blurb: string
}

type Currency = 'EUR' | 'USD'

type Props = {
  packs: PackView[]
  initialCurrency: Currency
  /** Org owners/admins persist the currency choice; members toggle locally. */
  canSetCurrency: boolean
  /** True once Stripe keys are configured AND the viewer may buy — turns the
   *  Buy buttons into real checkout forms. */
  purchasable: boolean
}

export function PacksPanel({ packs, initialCurrency, canSetCurrency, purchasable }: Props) {
  const [currency, setCurrency] = useState<Currency>(initialCurrency)
  const [, startTransition] = useTransition()

  const pick = (c: Currency) => {
    setCurrency(c)
    if (canSetCurrency) startTransition(() => setCurrencyAction(c))
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
          Buy credits
        </h2>
        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-[color:var(--color-border)]">
          {(['EUR', 'USD'] as const).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              className={[
                'min-h-9 px-3 text-[12px] font-medium transition-colors',
                currency === c
                  ? 'bg-[color:var(--color-accent)] text-[color:var(--color-text-primary)]'
                  : 'bg-[color:var(--color-bg-primary)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
              ].join(' ')}
            >
              {c === 'EUR' ? '€ EUR' : '$ USD'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {packs.map(p => (
          <div
            key={p.key}
            className={[
              'relative flex flex-col rounded-lg border bg-[color:var(--color-bg-primary)] p-4',
              p.popular
                ? 'border-[color:var(--color-accent-hover)] ring-1 ring-[color:var(--color-accent-hover)]'
                : 'border-[color:var(--color-border)]',
            ].join(' ')}
          >
            {p.popular && (
              <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 rounded-full bg-[color:var(--color-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-text-primary)]">
                <Sparkles className="h-3 w-3" />
                Most popular
              </span>
            )}
            <p className="text-[13px] font-medium text-[color:var(--color-text-primary)]">{p.name}</p>
            <p className="mt-1 text-[22px] font-semibold tabular-nums leading-none text-[color:var(--color-text-primary)]">
              {currency === 'EUR' ? `€${p.eur}` : `$${p.usd}`}
            </p>
            <p className="mt-1 text-[12px] tabular-nums text-[color:var(--color-text-secondary)]">
              {p.credits.toLocaleString()} credits · ~€{p.perCreditEur}/credit
            </p>
            <p className="mt-2 flex-1 text-[12px] text-[color:var(--color-text-secondary)]">{p.blurb}</p>
            {purchasable ? (
              <form action={startCheckoutAction} className="mt-3">
                <input type="hidden" name="pack" value={p.key} />
                <input type="hidden" name="currency" value={currency} />
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)]"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Buy {currency === 'EUR' ? `€${p.eur}` : `$${p.usd}`}
                </button>
              </form>
            ) : (
              <button
                type="button"
                disabled
                title="Card payments are being wired up (Stripe) — use a voucher code or contact us meanwhile."
                className="mt-3 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-[color:var(--color-border)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-secondary)] opacity-70"
              >
                <Lock className="h-3.5 w-3.5" />
                Buy — coming soon
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-[color:var(--color-text-secondary)]">
        {purchasable ? (
          <>Payments are handled by Stripe on a secure hosted page — promo codes can be entered at checkout. Need an invoice or custom volume?{' '}</>
        ) : (
          <>Card payments via Stripe are almost here. Until then: redeem a voucher code below, or{' '}</>
        )}
        <a
          href="mailto:admin@optinetsolutions.com?subject=Credits%20top-up"
          className="underline underline-offset-2 hover:text-[color:var(--color-text-primary)]"
        >
          contact us
        </a>
        {purchasable ? '.' : ' for an invoiced top-up or custom volume.'}
      </p>
    </section>
  )
}
