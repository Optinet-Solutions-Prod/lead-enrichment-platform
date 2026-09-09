import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

export type IntegrationField = {
  key: string
  label: string
  type: 'secret' | 'text'
  required?: boolean
  placeholder?: string
  default?: string
}

export type IntegrationTest = {
  method?: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  /** Dot-path into the JSON response whose value proves the connection
   *  (e.g. "data.username" → shown as "Connected as X"). */
  success_path?: string
}

export type IntegrationDef = {
  key: string
  name: string
  category?: string
  description?: string
  docs_url?: string
  fields: IntegrationField[]
  test?: IntegrationTest
  /** True for org-uploaded definitions (org_integration_defs). */
  custom?: boolean
}

export type DefValidation = { ok: true; def: IntegrationDef } | { ok: false; error: string }

/** Strict validation for a single integration definition — used for the
 *  built-in catalog AND for org-uploaded YAML (which drives server-side
 *  HTTP, so the shape is enforced hard). */
export function validateDef(raw: unknown): DefValidation {
  const d = raw as Partial<IntegrationDef> | null
  if (!d || typeof d !== 'object') return { ok: false, error: 'entry is not a mapping' }
  if (typeof d.key !== 'string' || !/^[a-z0-9_-]{2,40}$/.test(d.key)) {
    return { ok: false, error: 'key must be 2-40 chars of a-z 0-9 _ -' }
  }
  if (typeof d.name !== 'string' || d.name.trim().length < 2 || d.name.length > 60) {
    return { ok: false, error: `${d.key}: name must be 2-60 characters` }
  }
  if (!Array.isArray(d.fields) || d.fields.length < 1 || d.fields.length > 10) {
    return { ok: false, error: `${d.key}: fields must list 1-10 entries` }
  }
  for (const f of d.fields) {
    if (typeof f?.key !== 'string' || !/^[a-z0-9_]{1,40}$/.test(f.key)) {
      return { ok: false, error: `${d.key}: field keys must be a-z 0-9 _` }
    }
    if (typeof f.label !== 'string' || f.label.length < 1 || f.label.length > 60) {
      return { ok: false, error: `${d.key}: every field needs a label (≤60 chars)` }
    }
    if (f.type !== 'secret' && f.type !== 'text') {
      return { ok: false, error: `${d.key}.${f.key}: type must be "secret" or "text"` }
    }
  }
  if (d.test != null) {
    const t = d.test
    if (typeof t.url !== 'string' || !t.url.startsWith('https://')) {
      return { ok: false, error: `${d.key}: test.url must be a literal https:// URL template` }
    }
    if (t.method != null && t.method !== 'GET' && t.method !== 'POST') {
      return { ok: false, error: `${d.key}: test.method must be GET or POST` }
    }
    if (t.success_path != null && !/^[a-zA-Z0-9_.]{1,100}$/.test(t.success_path)) {
      return { ok: false, error: `${d.key}: test.success_path must be a dot-path` }
    }
    if (t.headers != null) {
      if (typeof t.headers !== 'object' || Array.isArray(t.headers)) {
        return { ok: false, error: `${d.key}: test.headers must be a mapping` }
      }
      for (const [hk, hv] of Object.entries(t.headers)) {
        if (!/^[A-Za-z0-9-]{1,60}$/.test(hk) || typeof hv !== 'string' || hv.length > 500) {
          return { ok: false, error: `${d.key}: invalid test header "${hk}"` }
        }
      }
    }
  }
  const category = typeof d.category === 'string' ? d.category.slice(0, 40) : null
  const description = typeof d.description === 'string' ? d.description.slice(0, 400) : null
  const docsUrl =
    typeof d.docs_url === 'string' && /^https:\/\//.test(d.docs_url) ? d.docs_url.slice(0, 300) : null
  return {
    ok: true,
    def: {
      key: d.key,
      name: d.name.trim(),
      ...(category ? { category } : {}),
      ...(description ? { description } : {}),
      ...(docsUrl ? { docs_url: docsUrl } : {}),
      fields: d.fields as IntegrationField[],
      ...(d.test ? { test: d.test as IntegrationTest } : {}),
    },
  }
}

let cached: IntegrationDef[] | null = null

/** Load + minimally validate the YAML catalog (cached per server process). */
export function getCatalog(): IntegrationDef[] {
  if (cached) return cached
  const raw = readFileSync(join(process.cwd(), 'lib', 'integrations', 'catalog.yaml'), 'utf-8')
  const doc = parse(raw) as { integrations?: unknown }
  const list = Array.isArray(doc?.integrations) ? (doc.integrations as unknown[]) : []
  cached = list
    .map(validateDef)
    .filter((v): v is Extract<DefValidation, { ok: true }> => v.ok)
    .map(v => v.def)
  return cached
}

export function getIntegrationDef(key: string): IntegrationDef | null {
  return getCatalog().find(d => d.key === key) ?? null
}

function dotPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** Substitute {field_key} placeholders. Values are trimmed and control
 *  characters stripped so a pasted token can't smuggle header/url syntax. */
function substitute(template: string, config: Record<string, string>): string {
  return template.replace(/\{([a-z0-9_]+)\}/g, (_, k: string) => {
    const v = (config[k] ?? '').trim()
     
    return v.replace(/[\u0000-\u001f\u007f\s]/g, '')
  })
}

export type TestOutcome = { ok: boolean; detail: string; testedValue: string | null }

/** Run the catalog-declared connection test against the given config. */
export async function runIntegrationTest(
  def: IntegrationDef,
  config: Record<string, string>,
): Promise<TestOutcome> {
  if (!def.test) {
    return { ok: true, detail: 'Saved (this integration has no connection test).', testedValue: null }
  }
  const url = substitute(def.test.url, config)
  if (!/^https:\/\//.test(url)) {
    return { ok: false, detail: 'Test URL did not resolve to https — check the field values.', testedValue: null }
  }
  // Guard: definitions (incl. org-uploaded ones) must only reach the public
  // internet — never loopback/private ranges/metadata endpoints.
  try {
    const host = new URL(url).hostname.toLowerCase()
    const privateHost =
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
    if (privateHost) {
      return { ok: false, detail: 'Test URL points at a private/internal address — not allowed.', testedValue: null }
    }
  } catch {
    return { ok: false, detail: 'Test URL is not a valid URL after substitution.', testedValue: null }
  }
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(def.test.headers ?? {})) {
    headers[k] = substitute(v, config)
  }

  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 15_000)
  try {
    const res = await fetch(url, {
      method: def.test.method ?? 'GET',
      headers,
      signal: ctl.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      return {
        ok: false,
        detail: `Provider answered HTTP ${res.status} — the credentials look wrong.`,
        testedValue: null,
      }
    }
    let testedValue: string | null = null
    if (def.test.success_path) {
      try {
        const body = (await res.json()) as unknown
        const v = dotPath(body, def.test.success_path)
        testedValue = typeof v === 'string' || typeof v === 'number' ? String(v) : null
      } catch {
        // Non-JSON 2xx still counts as connected.
      }
    }
    return {
      ok: true,
      detail: testedValue ? `Connected as ${testedValue}.` : 'Connection succeeded.',
      testedValue,
    }
  } catch {
    return { ok: false, detail: 'Could not reach the provider (network/timeout).', testedValue: null }
  } finally {
    clearTimeout(t)
  }
}
