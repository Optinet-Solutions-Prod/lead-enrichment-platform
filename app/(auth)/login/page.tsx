import Link from 'next/link'
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
      title="Welcome back"
      subtitle="Sign in to your workspace."
      footer={
        <p>
          New here?{' '}
          <Link href="/signup" className="font-medium text-[color:var(--color-text-primary)] underline underline-offset-2">
            Create a free account
          </Link>
        </p>
      }
    >
      {reason === 'session_expired' && (
        <div role="status" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          Your session expired. Please sign in again.
        </div>
      )}
      {reason === 'network' && (
        <div role="status" className="mb-4 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] px-3 py-2 text-[13px]">
          We couldn&apos;t reach the sign-in service for a moment. Try again.
        </div>
      )}
      <LoginForm redirectTo={sp.from ?? ''} />
    </AuthShell>
  )
}
