'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from './logo'

const LINKS = [
  { href: '/#platform', label: 'Platform' },
  { href: '/#demo', label: 'Live demo' },
  { href: '/#industries', label: 'Use cases' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
]

const CONTACT = 'mailto:admin@optinetsolutions.com?subject=Lead%20Engine'

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0b0b0c]/85 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-4 px-5 md:px-8">
        <Link href="/" aria-label="Lead Engine home" className="shrink-0">
          <Logo />
        </Link>

        <nav className="ml-10 hidden items-center gap-7 text-[14px] text-white lg:flex">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-[color:var(--color-accent)]">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 lg:flex">
          {signedIn ? (
            <Link href="/scrape" className="dg-btn dg-btn-primary min-h-10 px-5 text-[15px]">
              Open dashboard
            </Link>
          ) : (
            <>
              <a href={CONTACT} className="dg-btn dg-btn-glow min-h-10 px-5 text-[15px]">
                Contact us
              </a>
              <span aria-hidden className="mx-1 h-8 w-px bg-white/15" />
              <Link href="/login" className="dg-btn dg-btn-secondary min-h-10 px-5 text-[15px]">
                Log in
              </Link>
              <Link href="/signup" className="dg-btn dg-btn-primary min-h-10 px-5 text-[15px]">
                Sign up free
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-white/10 lg:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-[#0b0b0c] px-5 pb-5 pt-2 lg:hidden">
          <nav className="flex flex-col">
            {LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center border-b border-white/10 text-[17px] text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 grid gap-2">
            {signedIn ? (
              <Link href="/scrape" className="dg-btn dg-btn-primary w-full">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/signup" className="dg-btn dg-btn-primary w-full">
                  Sign up free
                </Link>
                <Link href="/login" className="dg-btn dg-btn-secondary w-full">
                  Log in
                </Link>
                <a href={CONTACT} className="dg-btn dg-btn-glow w-full">
                  Contact us
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
