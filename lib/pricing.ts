/**
 * Public price list — plans, top-up packs and per-action credit costs.
 *
 * Plain data (no 'server-only') so both the marketing pages and the in-app
 * billing page render from the same numbers. Hybrid model, which is what
 * every comparable lead-gen tool (Apollo, Clay, Hunter, PhantomBuster)
 * converged on: a monthly plan that INCLUDES credits, plus top-up packs that
 * never expire. Plans are marketing today — the Stripe checkout that exists
 * sells packs; subscriptions are the next Stripe step.
 */

export type Currency = 'EUR' | 'USD'

export type Plan = {
  key: 'free' | 'starter' | 'growth' | 'scale'
  name: string
  tagline: string
  /** Monthly price when billed monthly / when billed yearly (per month). */
  monthly: { eur: number; usd: number }
  yearly: { eur: number; usd: number }
  /** Credits included. Free is a one-time grant, the rest reset monthly. */
  credits: number
  creditsNote: string
  members: string
  features: string[]
  cta: string
  popular?: boolean
}

export const PLANS: Plan[] = [
  {
    key: 'free',
    name: 'Free',
    tagline: 'Try the whole pipeline on real data.',
    monthly: { eur: 0, usd: 0 },
    yearly: { eur: 0, usd: 0 },
    credits: 100,
    creditsNote: '100 credits, once',
    members: '1 member',
    features: [
      'Every data page: Owner Leads, PM Prospects, Airbnb, licence register',
      'All built-in sources',
      'Guided tour + getting-started checklist',
      'Community help',
    ],
    cta: 'Start free',
  },
  {
    key: 'starter',
    name: 'Starter',
    tagline: 'For one team working one market.',
    monthly: { eur: 49, usd: 55 },
    yearly: { eur: 39, usd: 44 },
    credits: 400,
    creditsNote: '400 credits / month',
    members: 'Up to 3 members',
    features: [
      'Everything in Free',
      'Workflows — save a recipe, run it in one click',
      'Custom YAML sources (bring any JSON API)',
      'Airbnb cross-match',
      'Email support',
    ],
    cta: 'Start free, upgrade later',
  },
  {
    key: 'growth',
    name: 'Growth',
    tagline: 'For agencies running several campaigns.',
    monthly: { eur: 149, usd: 165 },
    yearly: { eur: 119, usd: 132 },
    credits: 1500,
    creditsNote: '1,500 credits / month',
    members: 'Up to 10 members',
    features: [
      'Everything in Starter',
      'Bring your own API keys — Airbnb crawls drop from 15 to 5 credits',
      'AI relevance screening of every search result',
      'Advanced batch search',
      'Priority support',
    ],
    cta: 'Start free, upgrade later',
    popular: true,
  },
  {
    key: 'scale',
    name: 'Scale',
    tagline: 'For multi-market operations.',
    monthly: { eur: 399, usd: 439 },
    yearly: { eur: 319, usd: 351 },
    credits: 5000,
    creditsNote: '5,000 credits / month',
    members: 'Unlimited members & workspaces',
    features: [
      'Everything in Growth',
      'AI affiliate analysis with CTA-link extraction',
      'Website profiles with verdict expiry & system flags',
      'Invoiced billing (EUR or USD)',
      'Dedicated onboarding',
    ],
    cta: 'Talk to us',
  },
]

export type CreditPack = {
  key: string
  name: string
  credits: number
  eur: number
  usd: number
  perCreditEur: string
  popular?: boolean
  blurb: string
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    key: 'starter',
    name: 'Starter',
    credits: 100,
    eur: 25,
    usd: 29,
    perCreditEur: '0.25',
    blurb: 'A pilot batch: ~100 source runs or a few full collection days.',
  },
  {
    key: 'growth',
    name: 'Growth',
    credits: 500,
    eur: 99,
    usd: 115,
    perCreditEur: '0.20',
    popular: true,
    blurb: 'Weekly workflows across every source with room to spare.',
  },
  {
    key: 'scale',
    name: 'Scale',
    credits: 2000,
    eur: 299,
    usd: 345,
    perCreditEur: '0.15',
    blurb: 'Agency volume — run everything, often, in multiple markets.',
  },
]

/** What one credit buys — the public version of lib/credits CREDIT_COSTS. */
export const CREDIT_USAGE = [
  { action: 'Source run (any built-in or custom source)', credits: '1' },
  { action: 'Licence-register refresh', credits: '1' },
  { action: 'Airbnb crawl on your own Apify key', credits: '5' },
  { action: 'Airbnb crawl on the platform key', credits: '15' },
  { action: 'Airbnb cross-match, filters, exports, workflows', credits: 'free' },
]

export function money(amount: number, currency: Currency): string {
  return currency === 'EUR' ? `€${amount}` : `$${amount}`
}
