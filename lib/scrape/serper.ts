import 'server-only'
import type { ResultRow } from './apify-google'

/**
 * Google results through Serper (google.serper.dev): a JSON API that answers
 * in one to two seconds, against the 10–60 s an Apify actor run takes to
 * boot, fetch and retry through Google's bot checks. Used for the live demo
 * whenever SERPER_API_KEY is set; Apify stays the fallback and the workspace
 * engine.
 *
 * Serper returns organic results only (no paid ads).
 */

const SERPER_URL = 'https://google.serper.dev/search'

export function serperKey(): string | null {
  const k = (process.env.SERPER_API_KEY ?? '').trim()
  return k || null
}

type SerperResponse = {
  organic?: Array<{ title?: string; link?: string; snippet?: string; position?: number }>
}

function originOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

export async function searchSerper(
  key: string,
  input: { keyword: string; countryCode: string; language: string; num?: number },
): Promise<ResultRow[]> {
  const res = await fetch(SERPER_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: input.keyword,
      gl: input.countryCode.toLowerCase(),
      hl: input.language.toLowerCase(),
      num: input.num ?? 10,
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`)
  const body = (await res.json()) as SerperResponse
  const rows: ResultRow[] = []
  const seen = new Set<string>()
  let overall = 1
  for (const r of body.organic ?? []) {
    const url = r.link ?? ''
    const origin = url ? originOf(url) : null
    if (!origin || seen.has(url)) continue
    seen.add(url)
    rows.push({
      url,
      full_url: origin,
      title: r.title ?? '',
      description: r.snippet ?? null,
      resultType: 'Organic',
      page: 1,
      position: typeof r.position === 'number' ? r.position : overall,
      overall_position: overall++,
      keyword: input.keyword,
      seen_on: 'desktop',
    })
  }
  return rows
}
