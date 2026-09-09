import 'server-only'
import { parse } from 'yaml'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchWithTimeout, mergeLeads, normPhone, type LeadRow } from './runners'

/**
 * Org-uploaded custom scrape sources (org_source_defs): a YAML block declares
 * one https JSON endpoint + a field mapping, and the runner turns each list
 * item into an Owner Lead. Same trust posture as custom integrations — hard
 * validation, https-only, private hosts blocked.
 */

export type SourceFieldMap = {
  listing_url: string
  title?: string
  price_text?: string
  location?: string
  owner_name?: string
  contact_phone?: string
  contact_email?: string
}

export type SourceDef = {
  key: string
  name: string
  description?: string
  request: { url: string }
  response: {
    list_path?: string
    fields: SourceFieldMap
    contact_type?: 'owner' | 'agency' | 'unknown'
  }
  limit?: number
}

export type SourceDefRow = {
  key: string
  definition: SourceDef
  raw_yaml: string
  updated_at: string
}

const MAPPABLE = [
  'listing_url',
  'title',
  'price_text',
  'location',
  'owner_name',
  'contact_phone',
  'contact_email',
] as const

function privateHost(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host) ||
      host === '0.0.0.0' ||
      host.startsWith('[')
    )
  } catch {
    return true
  }
}

export type SourceValidation = { ok: true; def: SourceDef } | { ok: false; error: string }

export function validateSourceDef(raw: unknown): SourceValidation {
  const d = raw as Partial<SourceDef> | null
  if (!d || typeof d !== 'object') return { ok: false, error: 'entry is not a mapping' }
  if (typeof d.key !== 'string' || !/^[a-z0-9_-]{2,40}$/.test(d.key)) {
    return { ok: false, error: 'key must be 2-40 chars of a-z 0-9 _ -' }
  }
  if (typeof d.name !== 'string' || d.name.trim().length < 2 || d.name.length > 60) {
    return { ok: false, error: `${d.key}: name must be 2-60 characters` }
  }
  const url = d.request?.url
  if (typeof url !== 'string' || !url.startsWith('https://') || url.length > 500) {
    return { ok: false, error: `${d.key}: request.url must be an https URL` }
  }
  if (privateHost(url)) {
    return { ok: false, error: `${d.key}: request.url points at a private/internal address` }
  }
  const resp = d.response
  if (!resp || typeof resp !== 'object' || !resp.fields || typeof resp.fields !== 'object') {
    return { ok: false, error: `${d.key}: response.fields mapping is required` }
  }
  if (resp.list_path != null && !/^[a-zA-Z0-9_.]{0,100}$/.test(resp.list_path)) {
    return { ok: false, error: `${d.key}: response.list_path must be a dot-path` }
  }
  const fields: Record<string, string> = {}
  for (const k of MAPPABLE) {
    const v = (resp.fields as Record<string, unknown>)[k]
    if (v == null) continue
    if (typeof v !== 'string' || v.length > 300) {
      return { ok: false, error: `${d.key}: fields.${k} must be a dot-path or template string` }
    }
    fields[k] = v
  }
  if (!fields.listing_url) {
    return { ok: false, error: `${d.key}: fields.listing_url is required (it is the dedupe key)` }
  }
  const ct = resp.contact_type
  if (ct != null && ct !== 'owner' && ct !== 'agency' && ct !== 'unknown') {
    return { ok: false, error: `${d.key}: contact_type must be owner, agency or unknown` }
  }
  const limit = typeof d.limit === 'number' ? Math.min(Math.max(Math.trunc(d.limit), 1), 100) : 30
  return {
    ok: true,
    def: {
      key: d.key,
      name: d.name.trim(),
      ...(typeof d.description === 'string' ? { description: d.description.slice(0, 400) } : {}),
      request: { url },
      response: {
        ...(resp.list_path ? { list_path: resp.list_path } : {}),
        fields: fields as SourceFieldMap,
        contact_type: ct ?? 'unknown',
      },
      limit,
    },
  }
}

export async function listSourceDefs(orgId: string): Promise<SourceDefRow[]> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('org_source_defs')
    .select('key, definition, raw_yaml, updated_at')
    .eq('org_id', orgId)
    .order('key', { ascending: true })
  return (data ?? []) as SourceDefRow[]
}

export type SourceUploadResult = { added: string[]; errors: string[] }

export async function upsertSourceDefsFromYaml(
  orgId: string,
  userId: string,
  rawYaml: string,
): Promise<SourceUploadResult> {
  if (rawYaml.length > 32_768) return { added: [], errors: ['File is too large (max 32 KB).'] }
  let doc: { sources?: unknown }
  try {
    doc = parse(rawYaml) as { sources?: unknown }
  } catch (e) {
    return { added: [], errors: [`Not valid YAML: ${(e as Error).message.split('\n')[0]}`] }
  }
  const entries = Array.isArray(doc?.sources) ? (doc.sources as unknown[]) : null
  if (!entries || entries.length === 0) {
    return {
      added: [],
      errors: ['The file must contain a "sources:" list — download the template to see the format.'],
    }
  }
  if (entries.length > 10) return { added: [], errors: ['Max 10 sources per file.'] }

  const svc = createServiceClient()
  const added: string[] = []
  const errors: string[] = []
  for (const entry of entries) {
    const v = validateSourceDef(entry)
    if (!v.ok) {
      errors.push(v.error)
      continue
    }
    const { error } = await svc.from('org_source_defs').upsert({
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

export async function removeSourceDef(orgId: string, key: string): Promise<string | null> {
  const svc = createServiceClient()
  const { error } = await svc
    .from('org_source_defs')
    .delete()
    .eq('org_id', orgId)
    .eq('key', key)
  return error ? error.message : null
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function dotPath(obj: unknown, path: string): unknown {
  if (path === '') return obj
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** A mapping value is either a bare dot-path, or a template mixing literal
 *  text with {dot.path} placeholders. */
function resolveMapping(item: unknown, mapping: string): string | null {
  if (mapping.includes('{')) {
    let missing = false
    const out = mapping.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, p: string) => {
      const v = dotPath(item, p)
      if (v == null || (typeof v !== 'string' && typeof v !== 'number')) {
        missing = true
        return ''
      }
      return String(v)
    })
    return missing ? null : out
  }
  const v = dotPath(item, mapping)
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  return null
}

/** Fetch the source's endpoint and merge mapped listings into Owner Leads. */
export async function runCustomSource(
  svc: ReturnType<typeof createServiceClient>,
  orgId: string,
  def: SourceDef,
): Promise<string> {
  if (privateHost(def.request.url)) throw new Error('source URL is not allowed')
  const res = await fetchWithTimeout(def.request.url, 25_000)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(def.request.url).hostname}`)
  const body = (await res.json()) as unknown
  const listRaw = dotPath(body, def.response.list_path ?? '')
  if (!Array.isArray(listRaw)) {
    throw new Error(
      `response.list_path "${def.response.list_path ?? ''}" did not resolve to a list — check the mapping`,
    )
  }
  const items = listRaw.slice(0, def.limit ?? 30)
  const f = def.response.fields
  const rows: LeadRow[] = []
  for (const item of items) {
    const url = resolveMapping(item, f.listing_url)
    if (!url || !/^https?:\/\//.test(url)) continue
    const price = f.price_text ? resolveMapping(item, f.price_text) : null
    rows.push({
      listing_url: url,
      title: f.title ? resolveMapping(item, f.title) : null,
      price_text: price ? (/^\d/.test(price) ? `€${price}` : price) : null,
      location: f.location ? resolveMapping(item, f.location) : null,
      owner_name: f.owner_name ? resolveMapping(item, f.owner_name) : null,
      contact_phone: normPhone(f.contact_phone ? resolveMapping(item, f.contact_phone) : null),
      contact_email: f.contact_email ? resolveMapping(item, f.contact_email)?.toLowerCase() ?? null : null,
      contact_type: def.response.contact_type ?? 'unknown',
      notes: `Custom YAML source "${def.name}".`,
    })
  }
  const { added, seen } = await mergeLeads(svc, orgId, def.key, rows)
  return `${seen} listings examined, ${added} new lead(s) added`
}
