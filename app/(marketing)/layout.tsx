import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader } from './_components/site-header'

/**
 * The public marketing site (/, /pricing). Lives outside the dashboard
 * layout so it needs no organization, and outside the auth gate (see
 * proxy.ts). A signed-in visitor sees "Open dashboard" instead of
 * "Sign in" — the page itself stays readable for everyone.
 */
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
    <div className="flex min-h-screen flex-col bg-[color:var(--color-bg-primary)]">
      <SiteHeader signedIn={signedIn} />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="text-[15px] font-semibold text-[color:var(--color-text-primary)]">Lead Engine</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">
              Scrape the sources that matter, qualify them with AI, and hand your team a list worth
              calling. Built by Optinet Solutions.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-[12px] text-[color:var(--color-text-secondary)]">
            <Link href="/#services" className="hover:text-[color:var(--color-text-primary)]">Services</Link>
            <Link href="/pricing" className="hover:text-[color:var(--color-text-primary)]">Pricing</Link>
            <Link href="/#how" className="hover:text-[color:var(--color-text-primary)]">How it works</Link>
            <Link href="/#faq" className="hover:text-[color:var(--color-text-primary)]">FAQ</Link>
            <Link href="/signup" className="hover:text-[color:var(--color-text-primary)]">Create account</Link>
            <a href="mailto:admin@optinetsolutions.com" className="hover:text-[color:var(--color-text-primary)]">
              Contact
            </a>
            <Link href="/privacy" className="hover:text-[color:var(--color-text-primary)]">Privacy policy</Link>
            <Link href="/terms" className="hover:text-[color:var(--color-text-primary)]">Terms of service</Link>
          </nav>
        </div>
        <p className="border-t border-[color:var(--color-border)] px-5 py-4 text-center text-[11px] text-[color:var(--color-text-secondary)]">
          © {new Date().getFullYear()} Optinet Solutions · Lead Engine. Contact-gated platforms are worked
          by hand — we never automate bulk contact reveals.
        </p>
      </footer>
    </div>
  )
}
