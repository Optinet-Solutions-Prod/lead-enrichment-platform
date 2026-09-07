import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lookupInviteByToken } from '@/lib/orgs/invites'
import { SignupForm } from './_components/signup-form'

type Props = {
  searchParams: Promise<{ invite?: string }>
}

export default async function SignupPage({ searchParams }: Props) {
  const sp = await searchParams
  const inviteToken = sp.invite?.trim() || undefined

  // Already signed in? An invited visitor goes to the invite page to accept
  // with their existing account; everyone else goes into the app.
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) redirect(inviteToken ? `/invite/${inviteToken}` : '/property-scrape')
  } catch {
    // Auth server unreachable — fall through to the form.
  }

  // Lock the email field to the invited address so the server-side match
  // can't be missed by a typo.
  let inviteEmail: string | undefined
  let inviteOrgName: string | undefined
  if (inviteToken) {
    const invite = await lookupInviteByToken(inviteToken)
    if (invite.state === 'valid') {
      inviteEmail = invite.email
      inviteOrgName = invite.orgName
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-bg-secondary)] px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-6 shadow-sm">
        <h1 className="text-[16px] font-semibold text-[color:var(--color-text-primary)]">
          Create your account
        </h1>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          {inviteOrgName
            ? `You've been invited to join ${inviteOrgName}.`
            : 'Set up an account, then create your organization.'}
        </p>
        <div className="mt-4">
          <SignupForm inviteToken={inviteToken} inviteEmail={inviteEmail} />
        </div>
        <p className="mt-4 text-[12px] text-[color:var(--color-text-secondary)]">
          Already have an account?{' '}
          <Link
            href={inviteToken ? `/login?from=/invite/${inviteToken}` : '/login'}
            className="text-[color:var(--color-text-primary)] underline underline-offset-2"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
