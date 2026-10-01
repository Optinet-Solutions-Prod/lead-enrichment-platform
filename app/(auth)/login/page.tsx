import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '../_components/auth-shell'
import { LoginForm } from './_components/login-form'

type Props = {
  searchParams: Promise<{ from?: string; reason?: string }>
}

function safeFrom(from: string | undefined): string {
  if (!from || /[\r\n\\]/.test(from)) return '/scrape'
  return from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/login')
    ? from
    : '/scrape'
}

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams
  const reason = sp.reason

  // A visitor who still has a valid session — e.g. bounced here on a
  // transient network blip that (correctly) did NOT wipe their cookies —
  // goes straight back in. getUser() is wrapped so a settling network just
  // shows the form.
  let alreadyAuthed = false
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    alreadyAuthed = user !== null
  } catch {
    // Auth server unreachable right now — fall through to the sign-in form.
  }
  if (alreadyAuthed) redirect(safeFrom(sp.from))

  return (
    <AuthShell
      title="Log in"
      subtitle="Welcome back. Log in to your workspace."
      legalVerb="logging in"
      switchPrompt={{ text: 'Need an account?', label: 'Sign up', href: '/signup' }}
    >
      {reason === 'session_expired' && (
        <div role="status" className="mb-5 rounded-[4px] border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[14px] text-amber-200">
          Your session expired. Please sign in again.
        </div>
      )}
      {reason === 'network' && (
        <div role="status" className="mb-5 rounded-[4px] border border-white/15 bg-white/5 px-3 py-2 text-[14px]">
          We couldn&apos;t reach the sign-in service for a moment. Try again.
        </div>
      )}
      <LoginForm redirectTo={sp.from ?? ''} />
    </AuthShell>
  )
}
