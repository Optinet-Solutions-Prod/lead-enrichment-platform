'use server'

import { revalidatePath } from 'next/cache'
import { getCreditsBalance, spendCredits } from '@/lib/credits'
import { getOrgContext, requireOrgRole } from '@/lib/orgs/context'
import { removeSourceDef, upsertSourceDefsFromYaml } from '@/lib/sources/custom'
import { costOfSources, executeSources, type SourceResult } from '@/lib/sources/execute'
import { fetchWithTimeout, resolveApify } from '@/lib/sources/runners'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * On-demand property-source scrapes that run INSIDE the Next.js server
 * (plain HTTP — no VM, no browser). Each source merges new leads into
 * public.property_leads (dedup by listing_url per site — re-runs only add
 * listings we haven't seen). Airbnb is the exception: it runs on Apify's
 * browser fleet asynchronously — start here, ingest when it finishes.
 * Runs debit org credits up-front via spend_credits (atomic).
 */

export type { SourceResult }
export type RunState = { results: SourceResult[] } | { error: string } | null

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Every scrape writes into the CALLER'S org — resolve it once per action. */
async function requireOrg(): Promise<{ orgId: string } | { error: string }> {
  const ctx = await getOrgContext()
  if (!ctx) return { error: 'No organization — sign in and create/join one first.' }
  return { orgId: ctx.orgId }
}

export async function runPropertyScrapeAction(
  _prev: RunState,
  formData: FormData,
): Promise<RunState> {
  const org = await requireOrg()
  if ('error' in org) return { error: org.error }

  const sources = formData.getAll('sources').map(String)
  const keyword = String(formData.get('keyword') ?? '').trim() || 'apartment'
  if (sources.length === 0) return { error: 'Pick at least one source.' }

  const cost = costOfSources(sources)
  const newBalance = await spendCredits(org.orgId, cost, 'scrape_run', { sources, keyword })
  if (newBalance === null) {
    const have = await getCreditsBalance(org.orgId)
    return {
      error: `Not enough credits — this run costs ${cost}, your organization has ${have}. Top up under Account → Billing & Credits.`,
    }
  }

  const results = await executeSources(org.orgId, sources, keyword)
  return { results }
}

/** Poll the last Apify run; when finished, REPLACE airbnb_listings with its
 *  dataset (the PM-prospects view recomputes automatically). */
export async function ingestAirbnbAction(_prev: RunState): Promise<RunState> {
  const org = await requireOrg()
  if ('error' in org) return { error: org.error }
  const apify = await resolveApify(org.orgId)
  if (!apify) return { error: 'No Apify account available — connect one under Account → Integrations.' }

  const svc = createServiceClient()
  const { data: settingRow } = await svc
    .from('system_settings')
    .select('value')
    .eq('key', `airbnb_last_run:${org.orgId}`)
    .maybeSingle()
  const setting = (settingRow?.value ?? null) as {
    runId?: string
    datasetId?: string
  } | null
  if (!setting?.runId || !setting.datasetId) {
    return { error: 'No Airbnb run on record — start one first.' }
  }

  const runRes = await fetchWithTimeout(
    `${apify.base}/v2/actor-runs/${setting.runId}?token=${apify.token}`,
  )
  const runBody = (await runRes.json()) as { data?: { status?: string } }
  const status = runBody.data?.status ?? 'UNKNOWN'
  if (status === 'RUNNING' || status === 'READY') {
    return { results: [{ source: 'airbnb.com', status: 'started', detail: `run still ${status} — try again in a few minutes` }] }
  }
  if (status !== 'SUCCEEDED') {
    return { error: `Apify run ended with status ${status}.` }
  }

  const dsRes = await fetchWithTimeout(
    `${apify.base}/v2/datasets/${setting.datasetId}/items?token=${apify.token}&clean=true&format=json`,
    45_000,
  )
  const items = (await dsRes.json()) as Array<Record<string, unknown>>
  const licRe = /\b(?:HTL|GH|HST|HFPS|OP|MTA|APT)[\s\-/]*(\d{3,6})\b/i
  const rows = items
    .filter(it => it.id)
    .map(it => {
      const host = (it.host ?? {}) as { name?: string; id?: string | number; location?: string }
      const price = (it.price ?? {}) as { label?: string }
      const desc = typeof it.description === 'string' ? it.description : ''
      const lic = licRe.exec(`${desc} ${String(it.title ?? '')}`)?.[0] ?? null
      const coords = (it.coordinates ?? {}) as { latitude?: number; longitude?: number }
      return {
        org_id: org.orgId,
        airbnb_id: String(it.id),
        url: `https://www.airbnb.com/rooms/${it.id}`,
        title: (it.title as string) ?? null,
        host_name: host.name ?? null,
        host_id: host.id != null ? String(host.id) : '',
        locality: (it.location as string) ?? null,
        licence_no: lic ? lic.toUpperCase().replace(/[\s/]/g, '').replace(/^([A-Z]+)/, '$1-').replace(/--/, '-') : null,
        price_text: typeof price.label === 'string' ? price.label : null,
        lat: coords.latitude ?? null,
        lng: coords.longitude ?? null,
        room_type: (it.roomType as string) ?? null,
        raw: { host_location: host.location ?? null, desc: desc.slice(0, 400) },
      }
    })
  if (rows.length === 0) return { error: 'Run succeeded but the dataset is empty.' }

  const { error: delErr } = await svc.from('airbnb_listings').delete().eq('org_id', org.orgId)
  if (delErr) return { error: delErr.message }
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await svc.from('airbnb_listings').insert(rows.slice(i, i + 100))
    if (error) return { error: `insert @${i}: ${error.message}` }
  }
  return {
    results: [
      { source: 'airbnb.com', status: 'ok', detail: `${rows.length} listings ingested — PM Prospects recomputed` },
    ],
  }
}

// ---------------------------------------------------------------------------
// Custom YAML sources (org-scoped defs, managed by org admins)
// ---------------------------------------------------------------------------

const PAGE = '/property-scrape'

export type SourceManageState = { ok?: string; error?: string } | null

export async function uploadSourceYamlAction(
  _prev: SourceManageState,
  formData: FormData,
): Promise<SourceManageState> {
  let ctx
  try {
    ctx = await requireOrgRole('admin')
  } catch (e) {
    return { error: (e as Error).message }
  }

  const file = formData.get('yaml_file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Pick a .yaml file to upload.' }
  }
  if (file.size > 32_768) {
    return { error: 'File is too large (max 32 KB).' }
  }
  const raw = await file.text()

  const result = await upsertSourceDefsFromYaml(ctx.orgId, ctx.userId, raw)
  revalidatePath(PAGE)
  if (result.added.length === 0) {
    return { error: result.errors.join(' · ') || 'Nothing valid found in the file.' }
  }
  const okMsg = `Added/updated: ${result.added.join(', ')} — it now appears as a source you can tick above.`
  return result.errors.length > 0
    ? { ok: okMsg, error: `Skipped: ${result.errors.join(' · ')}` }
    : { ok: okMsg }
}

export async function removeSourceDefAction(
  _prev: SourceManageState,
  formData: FormData,
): Promise<SourceManageState> {
  const key = String(formData.get('key') ?? '').trim()
  let ctx
  try {
    ctx = await requireOrgRole('admin')
  } catch (e) {
    return { error: (e as Error).message }
  }
  const err = await removeSourceDef(ctx.orgId, key)
  if (err) return { error: err }
  revalidatePath(PAGE)
  return { ok: `Source "${key}" removed. Leads it already collected stay in Owner Leads.` }
}
