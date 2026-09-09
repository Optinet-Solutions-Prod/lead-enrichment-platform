'use server'

import { revalidatePath } from 'next/cache'
import { getCreditsBalance, spendCredits } from '@/lib/credits'
import { getOrgContext } from '@/lib/orgs/context'
import { crossmatchOwnerLeads } from '@/lib/sources/crossmatch'
import { costOfSources, executeSources, type SourceResult } from '@/lib/sources/execute'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Workflow recipes: a saved combination of scrape steps that runs with one
 * click. Steps live as plain jsonb on org_recipes so a recipe is data, not
 * code — { sources: string[], keyword, crossmatch }. Runs are debited from
 * org credits exactly like ad-hoc scrapes (cross-match is free — it's our
 * own compute, no external calls).
 */

export type RecipeSteps = {
  sources: string[]
  keyword: string | null
  crossmatch: boolean
}

export type RecipeLastRun = {
  at: string
  spent: number
  results: SourceResult[]
  crossmatch?: { checked: number; matched: number }
}

export type RecipeState = {
  ok?: string
  error?: string
  recipeId?: string
} | null

const PAGE = '/pipeline'

export async function saveRecipeAction(
  _prev: RecipeState,
  formData: FormData,
): Promise<RecipeState> {
  const ctx = await getOrgContext()
  if (!ctx) return { error: 'No organization — sign in first.' }

  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2 || name.length > 60) return { error: 'Give the workflow a name (2–60 characters).' }

  const sources = formData.getAll('sources').map(String)
  const keyword = String(formData.get('keyword') ?? '').trim() || null
  const crossmatch = formData.get('crossmatch') === 'on'
  if (sources.length === 0 && !crossmatch) {
    return { error: 'Pick at least one step — a source to scrape or the Airbnb cross-match.' }
  }

  const steps: RecipeSteps = { sources, keyword, crossmatch }
  const svc = createServiceClient()
  const { error } = await svc.from('org_recipes').insert({
    org_id: ctx.orgId,
    name,
    steps,
    created_by: ctx.userId,
  })
  if (error) return { error: error.message }

  revalidatePath(PAGE)
  return { ok: `Workflow "${name}" saved — run it below whenever you want fresh data.` }
}

export async function deleteRecipeAction(
  _prev: RecipeState,
  formData: FormData,
): Promise<RecipeState> {
  const ctx = await getOrgContext()
  if (!ctx) return { error: 'No organization — sign in first.' }
  const id = String(formData.get('recipe_id') ?? '')
  const svc = createServiceClient()
  const { error } = await svc.from('org_recipes').delete().eq('id', id).eq('org_id', ctx.orgId)
  if (error) return { error: error.message }
  revalidatePath(PAGE)
  return { ok: 'Workflow deleted.' }
}

export async function runRecipeAction(
  _prev: RecipeState,
  formData: FormData,
): Promise<RecipeState> {
  const ctx = await getOrgContext()
  if (!ctx) return { error: 'No organization — sign in first.' }
  const id = String(formData.get('recipe_id') ?? '')

  const svc = createServiceClient()
  const { data: recipe } = await svc
    .from('org_recipes')
    .select('id, name, steps')
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .maybeSingle()
  if (!recipe) return { recipeId: id, error: 'Workflow not found.' }
  const steps = recipe.steps as RecipeSteps

  const cost = costOfSources(steps.sources)
  if (cost > 0) {
    const newBalance = await spendCredits(ctx.orgId, cost, 'recipe_run', {
      recipe: recipe.name,
      sources: steps.sources,
    })
    if (newBalance === null) {
      const have = await getCreditsBalance(ctx.orgId)
      return {
        recipeId: id,
        error: `Not enough credits — this workflow costs ${cost}, your organization has ${have}. Top up under Account → Billing & Credits.`,
      }
    }
  }

  const results = await executeSources(ctx.orgId, steps.sources, steps.keyword ?? 'apartment')
  const lastRun: RecipeLastRun = { at: new Date().toISOString(), spent: cost, results }

  if (steps.crossmatch) {
    try {
      lastRun.crossmatch = await crossmatchOwnerLeads(ctx.orgId)
    } catch (e) {
      results.push({ source: 'cross-match', status: 'error', detail: (e as Error).message })
    }
  }

  await svc.from('org_recipes').update({ last_run: lastRun }).eq('id', id).eq('org_id', ctx.orgId)
  revalidatePath(PAGE)

  const okBits = results.filter(r => r.status === 'ok' || r.status === 'started').length
  const summary = lastRun.crossmatch
    ? `${okBits}/${results.length} steps ran · cross-match linked ${lastRun.crossmatch.matched} of ${lastRun.crossmatch.checked} leads to Airbnb`
    : `${okBits}/${results.length} steps ran`
  return { recipeId: id, ok: summary }
}
