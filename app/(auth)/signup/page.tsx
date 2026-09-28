import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PLANS } from '@/lib/pricing'
import { createClient } from '@/lib/supabase/server'
import { lookupInviteByToken } from '@/lib/orgs/invites'
import { AuthShell } from '../_components/auth-shell'
import { SignupForm } from './_components/signup-form'

type Props = {
  searchParams: Promise<{ invite?: string; plan?: string }>
}

export default async function SignupPage({ searchParams }: Props) {
  const sp = await searchParams
  const inviteToken = sp.invite?.trim() || undefined
  const plan = PLANS.find(p => p.key === sp.plan && p.key !== 'free') ?? null

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
    <AuthShell
      title={inviteOrgName ? `Join ${inviteOrgName}` : 'Create your free account'}
      subtitle={
        inviteOrgName
          ? "You've been invited — set a password and you're in."
          : '100 credits, every page unlocked, and a 60-second tour when your workspace opens. No card needed.'
      }
      footer={
        <p>
          Already have an account?{' '}
          <Link
            href={inviteToken ? `/login?from=/invite/${inviteToken}` : '/login'}
            className="font-medium text-[color:var(--color-text-primary)] underline underline-offset-2"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {plan && (
        <div className="mb-4 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] px-3 py-2 text-[13px]">
          <span className="font-medium">{plan.name} plan selected.</span>{' '}
          <span className="text-[color:var(--color-text-secondary)]">
            Everyone starts on Free — upgrade from Billing &amp; Credits once your workspace is set up.
          </span>
        </div>
      )}
      <SignupForm inviteToken={inviteToken} inviteEmail={inviteEmail} />
      <p className="mt-4 text-[11px] leading-relaxed text-[color:var(--color-text-secondary)]">
        By creating an account you agree that you are responsible for how you contact the people you
        find, in line with GDPR and the platforms&apos; terms.
      </p>
    </AuthShell>
  )
}
