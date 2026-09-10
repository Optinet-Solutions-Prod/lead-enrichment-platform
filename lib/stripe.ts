import 'server-only'
import Stripe from 'stripe'
import type { CreditPack, Currency } from './billing'

/**
 * Stripe wiring, pre-built while the keys are pending. Everything is gated
 * on env presence: until STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET exist
 * (locally in .env.local, on Vercel as project env vars), the billing page
 * keeps its disabled Buy buttons and the webhook answers 503. The moment
 * the keys are added and redeployed, packs become purchasable — no code
 * change, no Stripe-dashboard product setup (prices are inline price_data).
 */

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
}

let cached: Stripe | null = null
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing).')
  if (!cached) cached = new Stripe(key)
  return cached
}

/** Create a hosted-Checkout session for one credit pack and return its URL.
 *  Amount + credits come from OUR pack table (never the client); the webhook
 *  reads them back from signature-verified metadata. */
export async function createPackCheckout(opts: {
  orgId: string
  orgName: string
  pack: CreditPack
  currency: Currency
  userEmail?: string | null
}): Promise<string> {
  const stripe = getStripe()
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const unitAmount = (opts.currency === 'EUR' ? opts.pack.eur : opts.pack.usd) * 100

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    allow_promotion_codes: true,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: opts.currency.toLowerCase(),
          unit_amount: unitAmount,
          product_data: {
            name: `${opts.pack.name} pack — ${opts.pack.credits.toLocaleString('en-US')} credits`,
            description: `Lead Engine credits for ${opts.orgName}`,
          },
        },
      },
    ],
    metadata: {
      org_id: opts.orgId,
      pack_key: opts.pack.key,
      credits: String(opts.pack.credits),
    },
    ...(opts.userEmail ? { customer_email: opts.userEmail } : {}),
    success_url: `${base}/settings/billing?purchase=success`,
    cancel_url: `${base}/settings/billing?purchase=cancelled`,
  })
  if (!session.url) throw new Error('Stripe did not return a checkout URL.')
  return session.url
}
