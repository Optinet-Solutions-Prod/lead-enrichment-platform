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
}

let cached: IntegrationDef[] | null = null

/** Load + minimally validate the YAML catalog (cached per server process). */
export function getCatalog(): IntegrationDef[] {
  if (cached) return cached
  const raw = readFileSync(join(process.cwd(), 'lib', 'integrations', 'catalog.yaml'), 'utf-8')
  const doc = parse(raw) as { integrations?: unknown }
  const list = Array.isArray(doc?.integrations) ? (doc.integrations as IntegrationDef[]) : []
  cached = list.filter(
    d =>
      typeof d?.key === 'string' &&
      /^[a-z0-9_-]+$/.test(d.key) &&
      typeof d?.name === 'string' &&
      Array.isArray(d?.fields) &&
      d.fields.every(f => typeof f?.key === 'string' && /^[a-z0-9_]+$/.test(f.key)),
  )
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
