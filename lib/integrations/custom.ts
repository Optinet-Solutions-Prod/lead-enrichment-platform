import 'server-only'
import { parse } from 'yaml'
import { createServiceClient } from '@/lib/supabase/service'
import { getCatalog, validateDef, type IntegrationDef } from './catalog'

/**
 * Org-uploaded integration definitions (org_integration_defs). The repo's
 * catalog.yaml is the built-in set; these extend it per-org at runtime via
 * YAML upload on /settings/integrations.
 */

export type CustomDefRow = {
  key: string
  definition: IntegrationDef
  raw_yaml: string
  updated_at: string
}

export async function listCustomDefs(orgId: string): Promise<CustomDefRow[]> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('org_integration_defs')
    .select('key, definition, raw_yaml, updated_at')
    .eq('org_id', orgId)
    .order('key', { ascending: true })
  return ((data ?? []) as CustomDefRow[]).map(r => ({
    ...r,
    definition: { ...r.definition, custom: true },
  }))
}

/** Built-ins + this org's uploads (built-in keys win; uploads can't shadow). */
export async function getEffectiveCatalog(orgId: string): Promise<IntegrationDef[]> {
  const builtins = getCatalog()
  const builtinKeys = new Set(builtins.map(d => d.key))
  const custom = (await listCustomDefs(orgId))
    .filter(r => !builtinKeys.has(r.key))
    .map(r => r.definition)
  return [...builtins, ...custom]
}

export async function getEffectiveDef(orgId: string, key: string): Promise<IntegrationDef | null> {
  const all = await getEffectiveCatalog(orgId)
  return all.find(d => d.key === key) ?? null
}

export type UploadResult = { added: string[]; errors: string[] }

/** Parse + validate an uploaded YAML and upsert its definitions for the org.
 *  Built-in keys are reserved; same-key re-upload updates the definition. */
export async function upsertCustomDefsFromYaml(
  orgId: string,
  userId: string,
  rawYaml: string,
): Promise<UploadResult> {
  if (rawYaml.length > 32_768) {
    return { added: [], errors: ['File is too large (max 32 KB).'] }
  }
  let doc: { integrations?: unknown }
  try {
    doc = parse(rawYaml) as { integrations?: unknown }
  } catch (e) {
    return { added: [], errors: [`Not valid YAML: ${(e as Error).message.split('\n')[0]}`] }
  }
  const entries = Array.isArray(doc?.integrations) ? (doc.integrations as unknown[]) : null
  if (!entries || entries.length === 0) {
    return {
      added: [],
      errors: ['The file must contain an "integrations:" list with at least one entry — download the template to see the format.'],
    }
  }
  if (entries.length > 10) {
    return { added: [], errors: ['Max 10 integrations per file.'] }
  }

  const builtinKeys = new Set(getCatalog().map(d => d.key))
  const svc = createServiceClient()
  const added: string[] = []
  const errors: string[] = []
  for (const entry of entries) {
    const v = validateDef(entry)
    if (!v.ok) {
      errors.push(v.error)
      continue
    }
    if (builtinKeys.has(v.def.key)) {
      errors.push(`"${v.def.key}" is a built-in integration — pick a different key.`)
      continue
    }
    const { error } = await svc.from('org_integration_defs').upsert({
      org_id: orgId,
      key: v.def.key,
      definition: v.def,
      raw_yaml: rawYaml,
      uploaded_by: userId,
      updated_at: new Date().toISOString(),
    })
    if (error) errors.push(`${v.def.key}: ${error.message}`)
    else added.push(v.def.key)
  }
  return { added, errors }
}

/** Remove a custom definition AND any saved credentials for it. */
export async function removeCustomDef(orgId: string, key: string): Promise<string | null> {
  const svc = createServiceClient()
  const { error } = await svc
    .from('org_integration_defs')
    .delete()
    .eq('org_id', orgId)
    .eq('key', key)
  if (error) return error.message
  await svc.from('org_integrations').delete().eq('org_id', orgId).eq('provider', key)
  return null
}
