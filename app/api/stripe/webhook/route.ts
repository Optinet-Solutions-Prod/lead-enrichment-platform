import type Stripe from 'stripe'
import { grantCredits } from '@/lib/credits'
import { notifyOrg } from '@/lib/notifications'
import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Stripe → credits. Point the Stripe dashboard webhook at
 * POST /api/stripe/webhook with the `checkout.session.completed` event.
 * Signature-verified; idempotent by session id (a Stripe retry can never
 * double-grant). Answers 503 until the keys are configured.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return new Response('Stripe not configured', { status: 503 })
  }
  const sig = request.headers.get('stripe-signature')
  if (!sig) return new Response('Missing signature', { status: 400 })

  const payload = await request.text()
  let event: Stripe.Event
  try {
    event = await getStripe().webhooks.constructEventAsync(payload, sig, secret)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const orgId = session.metadata?.org_id ?? null
    const credits = Number(session.metadata?.credits)
    if (
      session.payment_status === 'paid' &&
      orgId &&
      Number.isInteger(credits) &&
      credits > 0 &&
      credits <= 100_000
    ) {
      const svc = createServiceClient()
      const { data: existing } = await svc
        .from('org_credit_ledger')
        .select('id')
        .eq('org_id', orgId)
        .eq('reason', 'purchase')
        .eq('meta->>session_id', session.id)
        .limit(1)
      if (!existing || existing.length === 0) {
        const balance = await grantCredits(orgId, credits, 'purchase', {
          session_id: session.id,
          pack: session.metadata?.pack_key ?? null,
          amount_total: session.amount_total,
          currency: session.currency,
        })
        await notifyOrg(orgId, {
          kind: 'purchase',
          title: `Purchase complete — ${credits.toLocaleString('en-US')} credits added`,
          body: `New balance: ${balance.toLocaleString('en-US')} credits. Thank you!`,
          href: '/settings/billing',
        })
      }
    }
  }

  return Response.json({ received: true })
}
