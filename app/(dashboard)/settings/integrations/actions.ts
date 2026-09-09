'use server'

import { revalidatePath } from 'next/cache'
import { runIntegrationTest } from '@/lib/integrations/catalog'
import {
  getEffectiveDef,
  removeCustomDef,
  upsertCustomDefsFromYaml,
} from '@/lib/integrations/custom'
import {
  deleteOrgIntegration,
  getOrgIntegration,
  upsertOrgIntegration,
} from '@/lib/integrations/store'
import { requireOrgRole } from '@/lib/orgs/context'

const PAGE = '/settings/integrations'

export type IntegrationActionState = {
  provider?: string
  ok?: string
  error?: string
} | null

/** Save the submitted config for the CALLER'S org, run the catalog-declared
 *  connection test, and store the outcome. Blank secret fields keep the
 *  previously saved value (so retesting doesn't require retyping tokens). */
export async function saveAndTestIntegrationAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const provider = String(formData.get('provider') ?? '').trim()

  let ctx
  try {
    ctx = await requireOrgRole('admin')
  } catch (e) {
    return { provider, error: (e as Error).message }
  }

  const def = await getEffectiveDef(ctx.orgId, provider)
  if (!def) return { provider, error: 'Unknown integration.' }

  const existing = await getOrgIntegration(ctx.orgId, provider)
  const config: Record<string, string> = {}
  for (const field of def.fields) {
    let value = String(formData.get(`field_${field.key}`) ?? '').trim()
    if (!value && field.type === 'secret' && existing?.config[field.key]) {
      value = existing.config[field.key]! // keep the saved secret
    }
    if (!value && field.default) value = field.default
    if (!value && field.required) {
      return { provider, error: `${field.label} is required.` }
    }
    if (value) config[field.key] = value
  }

  const outcome = await runIntegrationTest(def, config)
  const saveErr = await upsertOrgIntegration({
    org_id: ctx.orgId,
    provider,
    config,
    status: outcome.ok ? 'connected' : 'error',
    tested_value: outcome.testedValue,
    last_error: outcome.ok ? null : outcome.detail,
    updated_by: ctx.userId,
  })
  if (saveErr) return { provider, error: `Saved config could not be stored: ${saveErr}` }

  revalidatePath(PAGE)
  return outcome.ok
    ? { provider, ok: outcome.detail }
    : { provider, error: outcome.detail }
}

export async function disconnectIntegrationAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const provider = String(formData.get('provider') ?? '').trim()
  let ctx
  try {
    ctx = await requireOrgRole('admin')
  } catch (e) {
    return { provider, error: (e as Error).message }
  }
  const err = await deleteOrgIntegration(ctx.orgId, provider)
  if (err) return { provider, error: err }
  revalidatePath(PAGE)
  return { provider, ok: 'Disconnected — the saved credentials were deleted.' }
}


/** Upload a YAML file defining one or more custom integrations for the org. */
export async function uploadIntegrationYamlAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
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

  const result = await upsertCustomDefsFromYaml(ctx.orgId, ctx.userId, raw)
  revalidatePath(PAGE)
  if (result.added.length === 0) {
    return { error: result.errors.join(' · ') || 'Nothing valid found in the file.' }
  }
  const okMsg = `Added/updated: ${result.added.join(', ')} — fill in the credentials below and hit Save & test.`
  return result.errors.length > 0
    ? { ok: okMsg, error: `Skipped: ${result.errors.join(' · ')}` }
    : { ok: okMsg }
}

/** Delete a custom integration definition (and its saved credentials). */
export async function removeIntegrationDefAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const provider = String(formData.get('provider') ?? '').trim()
  let ctx
  try {
    ctx = await requireOrgRole('admin')
  } catch (e) {
    return { provider, error: (e as Error).message }
  }
  const err = await removeCustomDef(ctx.orgId, provider)
  if (err) return { provider, error: err }
  revalidatePath(PAGE)
  return { provider, ok: 'Integration removed (definition + saved credentials).' }
}
