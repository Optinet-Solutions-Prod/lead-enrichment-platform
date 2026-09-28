import Link from 'next/link'
import { CheckCircle2, Radar } from 'lucide-react'

/**
 * Shared two-column frame for sign-in and sign-up: the brand panel says
 * what you are signing into (and why), the card holds the form. On phones
 * the panel collapses to a one-line header so the form is above the fold.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="grid min-h-screen bg-[color:var(--color-bg-primary)] lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[color:var(--color-bg-secondary)] p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[color:var(--color-accent)]/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-[color:var(--color-accent)]/25 blur-3xl"
        />
        <Link href="/" className="relative flex items-center gap-2 text-[15px] font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-accent)]">
            <Radar className="h-4 w-4" />
          </span>
          Lead Engine
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-[30px] font-semibold leading-tight tracking-tight">
            Leads worth calling, from public websites, in minutes.
          </h2>
          <ul className="mt-6 flex flex-col gap-3 text-[14px]">
            {[
              '100 free credits — a full pilot batch, no card needed',
              'Owner name, phone and listing in one row; Airbnb and licence cross-match built in',
              'Workflows rerun your best sources in one click; credits are on a ledger',
            ].map(t => (
              <li key={t} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[12px] text-[color:var(--color-text-secondary)]">
          8,294 licensed short-lets · 1,560 Airbnb listings · 18 property sources — mapped for one
          market already. Yours is next.
        </p>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-8 lg:justify-center lg:px-14">
        <Link href="/" className="mb-8 flex items-center gap-2 text-[15px] font-semibold lg:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-accent)]">
            <Radar className="h-4 w-4" />
          </span>
          Lead Engine
        </Link>
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[13px] text-[color:var(--color-text-secondary)]">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <div className="mt-6 text-[13px] text-[color:var(--color-text-secondary)]">{footer}</div>
        </div>
      </main>
    </div>
  )
}

/** Inputs share one look; kept here so both forms stay identical. */
export const authInputCls =
  'min-h-11 w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-primary)] px-3.5 text-[14px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-secondary)]/70 read-only:opacity-70 focus:border-[color:var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]/60'

export const authButtonCls =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[color:var(--color-accent)] px-4 text-[14px] font-semibold text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50'
