'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, Radar, X } from 'lucide-react'

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#industries', label: 'Who it’s for' },
  { href: '/#services', label: 'Services' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
]

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold text-[color:var(--color-text-primary)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-accent)]">
            <Radar className="h-4 w-4" />
          </span>
          Lead Engine
        </Link>

        <nav className="ml-6 hidden items-center gap-5 text-[13px] text-[color:var(--color-text-secondary)] md:flex">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className="hover:text-[color:var(--color-text-primary)]">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Link
              href="/scrape"
              className="rounded-md bg-[color:var(--color-accent)] px-3.5 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-accent-hover)]"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-2 text-[13px] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-[color:var(--color-accent)] px-3.5 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-accent-hover)]"
              >
                Start free
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(v => !v)}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-md text-[color:var(--color-text-primary)] md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-5 py-3 md:hidden">
          <nav className="flex flex-col">
            {LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="min-h-11 py-2.5 text-[14px] text-[color:var(--color-text-primary)]"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-2 flex flex-col gap-2 border-t border-[color:var(--color-border)] pt-3">
            {signedIn ? (
              <Link href="/scrape" className="rounded-md bg-[color:var(--color-accent)] px-3.5 py-2.5 text-center text-[14px] font-medium">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/signup" className="rounded-md bg-[color:var(--color-accent)] px-3.5 py-2.5 text-center text-[14px] font-medium">
                  Start free
                </Link>
                <Link href="/login" className="rounded-md border border-[color:var(--color-border)] px-3.5 py-2.5 text-center text-[14px]">
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
