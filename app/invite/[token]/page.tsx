import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { lookupInviteByToken } from '@/lib/orgs/invites'
import { AcceptForm } from './_components/accept-form'

type Props = {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const invite = await lookupInviteByToken(token)

  let userEmail: string | null = null
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userEmail = user?.email ?? null
  } catch {
    // Not signed in / auth unreachable — treated as signed out below.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-bg-secondary)] px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-6 shadow-sm">
        <h1 className="text-[16px] font-semibold text-[color:var(--color-text-primary)]">
          Organization invite
        </h1>

        {invite.state === 'not_found' && (
          <p className="mt-3 text-[13px] text-[color:var(--color-text-secondary)]">
            This invite link is not valid. Ask your organization admin for a new one.
          </p>
        )}

        {invite.state === 'used' && (
          <p className="mt-3 text-[13px] text-[color:var(--color-text-secondary)]">
            This invite to {invite.orgName} was already used.{' '}
            <Link href="/login" className="text-[color:var(--color-text-primary)] underline underline-offset-2">
              Sign in
            </Link>
            .
          </p>
        )}

        {invite.state === 'expired' && (
          <p className="mt-3 text-[13px] text-[color:var(--color-text-secondary)]">
            This invite to {invite.orgName} has expired. Ask your organization admin to send a
            new one.
          </p>
        )}

        {invite.state === 'valid' && (
          <>
            <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
              {invite.email} is invited to join{' '}
              <span className="font-medium text-[color:var(--color-text-primary)]">
                {invite.orgName}
              </span>{' '}
              as {invite.role === 'admin' ? 'an admin' : 'a member'}.
            </p>

            {userEmail === null && (
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href={`/signup?invite=${token}`}
                  className="rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-center text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)]"
                >
                  Create account &amp; join
                </Link>
                <Link
                  href={`/login?from=/invite/${token}`}
                  className="rounded-md border border-[color:var(--color-border)] px-3 py-2 text-center text-[13px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-bg-secondary)]"
                >
                  I already have an account
                </Link>
              </div>
            )}

            {userEmail !== null && userEmail.toLowerCase() === invite.email.toLowerCase() && (
              <div className="mt-4">
                <AcceptForm token={token} orgName={invite.orgName} />
              </div>
            )}

            {userEmail !== null && userEmail.toLowerCase() !== invite.email.toLowerCase() && (
              <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                This invite was issued for {invite.email}, but you&apos;re signed in as{' '}
                {userEmail}. Sign out first, then open the link again.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
