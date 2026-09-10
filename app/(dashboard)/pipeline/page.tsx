import { redirect } from 'next/navigation'
import { getBillingEnabled } from '@/lib/billing'
import { getCreditsBalance } from '@/lib/credits'
import { getOrgContext } from '@/lib/orgs/context'
import { listSourceDefs } from '@/lib/sources/custom'
import { airbnbCreditCost } from '@/lib/sources/execute'
import { createServiceClient } from '@/lib/supabase/service'
import { PageIntro } from '../_components/page-intro'
import { RecipeBuilder, type StepOption } from './_components/recipe-builder'
import { RecipeCard, type RecipeView } from './_components/recipe-card'
import type { RecipeLastRun, RecipeSteps } from './actions'

export const dynamic = 'force-dynamic'
// Recipe runs do the same bounded external HTTP work as Collect Data.
export const maxDuration = 60

/** The built-in sources a recipe can include, with credit costs (Airbnb cost
 *  depends on whether the org runs its own Apify key). */
const builtInSteps = (abCost: number): StepOption[] => [
  { key: 'homesinmalta', label: 'HomesInMalta', cost: 1, hint: 'Owner name + mobile, 30 newest listings' },
  { key: 'propertiesfromowner', label: 'PropertiesFromOwner', cost: 1, hint: 'All active owner listings, one API call' },
  { key: 'maltapark', label: 'Maltapark keyword search', cost: 1, hint: 'Phones mined from ad text', usesKeyword: true },
  { key: 'mta', label: 'MTA licence register refresh', cost: 1, hint: 'Full official register re-download' },
  {
    key: 'airbnb',
    label: 'Airbnb crawl (via Apify)',
    cost: abCost,
    hint: abCost === 5 ? 'Runs on your connected Apify account' : 'Runs on the platform Apify key (connect your own to pay 5)',
  },
]

export default async function PipelinePage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/welcome')

  const svc = createServiceClient()
  const [{ data: recipeRows }, customDefs, balance, abCost, billingEnabled] = await Promise.all([
    svc
      .from('org_recipes')
      .select('id, name, steps, last_run, updated_at')
      .eq('org_id', ctx.orgId)
      .order('updated_at', { ascending: false }),
    listSourceDefs(ctx.orgId),
    getCreditsBalance(ctx.orgId),
    airbnbCreditCost(ctx.orgId),
    getBillingEnabled(),
  ])

  const stepOptions: StepOption[] = [
    ...builtInSteps(abCost),
    ...customDefs.map(d => ({
      key: `custom:${d.key}`,
      label: `${d.definition.name} (your source)`,
      cost: 1,
      hint: d.definition.description ?? 'Custom YAML source',
    })),
  ]
  const labelByKey = new Map(stepOptions.map(o => [o.key, o.label]))

  const recipes: RecipeView[] = ((recipeRows ?? []) as Array<{
    id: string
    name: string
    steps: RecipeSteps
    last_run: RecipeLastRun | null
  }>).map(r => ({
    id: r.id,
    name: r.name,
    stepLabels: [
      ...r.steps.sources.map(s => labelByKey.get(s) ?? s),
      ...(r.steps.crossmatch ? ['Airbnb cross-match'] : []),
    ],
    keyword: r.steps.keyword,
    cost: r.steps.sources.reduce((sum, s) => sum + (s === 'airbnb' ? abCost : 1), 0),
    lastRun: r.last_run,
  }))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <PageIntro
        title="Workflows"
        tagline="Save a data-collection recipe once — which sources, which keyword, whether to cross-match against Airbnb — then run the whole thing with one click."
        sourceLine="Each run executes the same scrapers as Collect Data and merges into the same datasets."
        statsLine={
          billingEnabled
            ? `${recipes.length} saved · ${balance.toLocaleString()} credits available`
            : `${recipes.length} saved`
        }
        relations={[
          { href: '/property-scrape', label: 'Collect Data' },
          { href: '/property-leads', label: 'Owner Leads' },
          { href: '/settings/billing', label: 'Billing & Credits' },
        ]}
        learnMore={
          <>
            <p>
              A workflow is a saved checklist of steps. <strong>Scrape steps</strong> pull fresh
              listings from the sources you tick (custom YAML sources included) and merge new
              owners into Owner Leads — re-runs never duplicate. The{' '}
              <strong>Airbnb cross-match</strong> step then links leads to Airbnb listings when
              the owner&apos;s first name appears in a host name in the same locality — a
              candidate signal to verify, not proof.
            </p>
            <p>
              Runs cost the same credits as running the sources by hand (1 each, Airbnb 5;
              cross-matching is free). The result of the last run stays on the card so you can
              see what it produced.
            </p>
          </>
        }
      />

      <RecipeBuilder steps={stepOptions} showCredits={billingEnabled} />

      {recipes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[color:var(--color-border)] p-4 text-[13px] text-[color:var(--color-text-secondary)]">
          No workflows yet — build your first one above. A good starter: both
          direct-from-owner sites + Airbnb cross-match, run every Monday.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {recipes.map(r => (
            <RecipeCard key={r.id} recipe={r} showCredits={billingEnabled} />
          ))}
        </div>
      )}
    </div>
  )
}
