import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Logo } from './_components/logo'
import { SiteHeader } from './_components/site-header'

/**
 * The public marketing site (/, /pricing, /privacy, /terms). Lives outside
 * the dashboard layout so it needs no organization, and outside the auth gate
 * (see proxy.ts). Dark theme via .theme-dg; the workspace keeps its own.
 */
const FOOTER = [
  {
    title: 'Product',
    links: [
      { href: '/#demo', label: 'Live demo' },
      { href: '/#platform', label: 'Platform' },
      { href: '/#how', label: 'How it works' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Use cases',
    links: [
      { href: '/#industries', label: 'VPN & privacy' },
      { href: '/#industries', label: 'Web hosting' },
      { href: '/#industries', label: 'B2B SaaS' },
      { href: '/#industries', label: 'Fintech & brokers' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/#faq', label: 'FAQ' },
      { href: '/#services', label: 'Features' },
      { href: '/signup', label: 'Free credits' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: 'mailto:admin@optinetsolutions.com', label: 'Contact' },
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms of service' },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/login', label: 'Log in' },
      { href: '/signup', label: 'Sign up free' },
    ],
  },
]

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  let signedIn = false
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    signedIn = user !== null
  } catch {
    // auth unreachable — render as signed out
  }

  return (
    <div className="theme-dg flex min-h-screen flex-col">
      <SiteHeader signedIn={signedIn} />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-white/10 bg-[#0b0b0c]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-[14px] leading-relaxed text-[color:var(--color-text-secondary)]">
              Find the sites that rank for your keyword, the brands they endorse and the people behind them. Built by Optinet Solutions.
            </p>
          </div>
          {FOOTER.map(col => (
            <div key={col.title}>
              <h3 className="text-[16px] font-semibold text-white">{col.title}</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map(l => (
                  <li key={l.label}>
                    {l.href.startsWith('mailto:') ? (
                      <a href={l.href} className="text-[14px] text-[#88888c] transition-colors hover:text-white">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-[14px] text-[#88888c] transition-colors hover:text-white">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-[12px] text-[#88888c] md:flex-row md:items-center md:justify-between">
            <p>© {new Date().getFullYear()} Optinet Solutions · Lead Engine. Public business data only; we never automate bulk contact reveals.</p>
            <p className="flex gap-4">
              <Link href="/terms" className="hover:text-white">Terms</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
