'use server'

import { getOrgContext } from '@/lib/orgs/context'
import { GAMBLING_RE, suggestKeywords, type KeywordIdea } from '@/lib/keywords/suggest'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Keyword ideas for the new-scrape screen. Leaves out every keyword this
 * workspace has already scraped for real (landing-page demo runs live in
 * demo_runs and never count), and the ones already in the current list.
 */
export async function suggestKeywordsAction(input: {
  seed: string
  countryCode: string | null
  language: string
  current: string[]
}): Promise<{ ok: true; ideas: KeywordIdea[]; source: 'ai' | 'patterns'; hiddenUsed: number } | { ok: false; error: string }> {
  const ctx = await getOrgContext()
  if (!ctx) return { ok: false, error: 'Sign in first.' }
  const seed = String(input.seed ?? '').trim()
  if (seed.length < 2) return { ok: false, error: 'Type your niche or brand first, e.g. “vpn” or “web hosting”.' }

  const svc = createServiceClient()
  const [{ data: settings }, { data: used }, { data: country }] = await Promise.all([
    svc.from('org_settings').select('gambling_enabled').eq('org_id', ctx.orgId).maybeSingle(),
    svc.from('scrape_queue').select('keyword').eq('org_id', ctx.orgId).is('parent_scrape_job_id', null).limit(5000),
    input.countryCode
      ? svc.from('gologin_profiles').select('country_name').eq('country_code', input.countryCode).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const gambling = (settings as { gambling_enabled?: boolean } | null)?.gambling_enabled === true
  if (!gambling && GAMBLING_RE.test(seed)) {
    return { ok: false, error: 'Gambling keywords are switched off for this workspace.' }
  }

  const exclude = new Set<string>()
  for (const r of (used ?? []) as Array<{ keyword: string | null }>) {
    if (r.keyword) exclude.add(r.keyword.trim().toLowerCase())
  }
  const historyCount = exclude.size
  for (const k of input.current ?? []) exclude.add(String(k).trim().toLowerCase())

  const res = await suggestKeywords({
    seed,
    language: (input.language || 'en').toLowerCase().slice(0, 5),
    countryName: (country as { country_name?: string } | null)?.country_name ?? 'your market',
    exclude,
    gambling,
  })
  return { ok: true, ...res, hiddenUsed: Math.min(res.hiddenUsed, historyCount + (input.current?.length ?? 0)) }
}
