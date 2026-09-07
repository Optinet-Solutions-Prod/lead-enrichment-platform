'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { lookupInviteByToken } from '@/lib/orgs/invites'

export type SignupState = { error?: string; notice?: string } | null

const MIN_PASSWORD_LENGTH = 12

export async function signUpAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  const inviteToken = String(formData.get('invite') ?? '').trim()

  if (!email.includes('@')) {
    return { error: 'Enter a valid email address.' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (password !== confirm) {
    return { error: 'Passwords do not match.' }
  }

  // ---- Invited signup -----------------------------------------------------
  // The invite link (unguessable token, shared by an org admin) is what
  // vouches for this signup, so the account is created pre-confirmed via the
  // admin API and signed in immediately — no confirmation email round-trip.
  // accept_org_invite re-checks server-side that the signed-in email matches
  // the invited email.
  if (inviteToken) {
    const invite = await lookupInviteByToken(inviteToken)
    if (invite.state !== 'valid') {
      return { error: 'This invite link is no longer valid — ask for a new one.' }
    }
    if (invite.email.toLowerCase() !== email) {
      return { error: `This invite was issued for ${invite.email}. Sign up with that email.` }
    }

    const svc = createServiceClient()
    const { error: createError } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) {
      const exists = /already|registered|exists/i.test(createError.message)
      return {
        error: exists
          ? 'An account with this email already exists — sign in instead, then open the invite link again.'
          : 'Could not create the account. Try again.',
      }
    }

    const supabase = await createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      return { error: 'Account created but sign-in failed — try signing in.' }
    }

    const { error: acceptError } = await supabase.rpc('accept_org_invite', {
      p_token: inviteToken,
    })
    if (acceptError) {
      return { error: acceptError.message }
    }

    // Refresh so the new JWT carries the org_id / org_role claims.
    await supabase.auth.refreshSession()
    redirect('/scrape')
  }

  // ---- Plain signup (no invite) -------------------------------------------
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) {
    const exists = /already|registered|exists/i.test(error.message)
    return {
      error: exists
        ? 'An account with this email already exists — sign in instead.'
        : 'Could not create the account. Try again.',
    }
  }

  // With email confirmation ON (no session yet), the user confirms first and
  // then signs in; with autoconfirm the session is live now.
  if (data.session) {
    redirect('/welcome')
  }
  return {
    notice:
      'Check your email for a confirmation link, then sign in. (Ask your admin for an invite link to skip this step.)',
  }
}
