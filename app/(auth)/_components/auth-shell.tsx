import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Logo } from '../../(marketing)/_components/logo'

/**
 * Sign-in and sign-up frame: one narrow centred column on the dark canvas.
 * Wordmark on top, the "other page" prompt right-aligned above a hairline,
 * then the title, the terms line and the form.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  switchPrompt,
  legalVerb = 'continuing',
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  switchPrompt: { text: string; label: string; href: string }
  /** Completes "By … you agree to the …" — e.g. "logging in", "signing up". */
  legalVerb?: string
}) {
  return (
    <div className="theme-dg min-h-screen">
      <main className="mx-auto flex w-full max-w-[416px] flex-col px-5 pb-16 pt-12">
        <Link href="/" aria-label="Lead Engine home" className="self-center">
          <Logo size="lg" />
        </Link>

        <p className="mt-6 flex items-center justify-end gap-2 border-b border-white/15 pb-3 text-[15px] font-semibold text-white/85">
          {switchPrompt.text}
          <Link href={switchPrompt.href} className="inline-flex items-center gap-1.5 text-[color:var(--color-link)] hover:underline">
            {switchPrompt.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </p>

        <h1 className="mt-10 text-[30px] font-normal text-white" style={{ fontFamily: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif', letterSpacing: '-0.01em' }}>
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-[15px] text-[color:var(--color-text-secondary)]">{subtitle}</p>}
        <p className="mt-4 text-[14px] leading-relaxed text-white/85">
          By {legalVerb}, you agree to the Lead Engine{' '}
          <Link href="/terms" className="font-semibold underline underline-offset-2">
            Terms of Service
          </Link>{' '}
          and have read our{' '}
          <Link href="/privacy" className="font-semibold underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>

        <div className="mt-8">{children}</div>
      </main>
    </div>
  )
}

/** Inputs share one look; kept here so both forms stay identical. */
export const authInputCls =
  'min-h-[42px] w-full rounded-[4px] border border-[#4e4e52] bg-[#0b0b0c] px-4 text-[16px] font-normal text-white placeholder:text-[#88888c] read-only:opacity-70 focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]'

/** Greys out while any field still shows its placeholder (see .auth-form in globals.css); always clickable. */
export const authButtonCls = 'dg-btn dg-btn-primary auth-submit min-h-12 w-full text-[16px]'
