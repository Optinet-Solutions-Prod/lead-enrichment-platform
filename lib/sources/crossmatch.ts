import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Airbnb cross-match (TS port of the original harvest matcher): flags Owner
 * Leads whose owner FIRST NAME appears in an Airbnb host name in the SAME
 * locality. Candidates only — Airbnb hides surnames, so a match means
 * "verify by eye", never proof. Used by the Pipeline recipe runner.
 */

const STOP = new Set([
  'the', 'and', 'ltd', 'limited', 'dar', 'casa', 'villa', 'apartment', 'flat',
  'house', 'san', 'st', 'ta', 'il', 'la', 'estate', 'residence', 'court',
  'group', 'holdings',
])

const ALIASES: Record<string, string> = {
  'st pauls bay': 'san pawl il bahar',
  bugibba: 'san pawl il bahar',
  qawra: 'san pawl il bahar',
  'st julians': 'san giljan',
  paceville: 'san giljan',
  'il mellieha': 'mellieha',
  marsascala: 'marsaskala',
  'zebbug gozo': 'zebbug',
  'zebbug malta': 'zebbug',
  'haz zebbug': 'zebbug',
  'rabat malta': 'rabat',
}

function norm(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function locKey(s: string | null | undefined): string {
  const n = norm(s).replace(/\b(malta|gozo)\b/g, '').replace(/\s+/g, ' ').trim()
  return ALIASES[n] ?? n
}

export type CrossmatchResult = { checked: number; matched: number }

export async function crossmatchOwnerLeads(orgId: string): Promise<CrossmatchResult> {
  const svc = createServiceClient()

  const listings: Array<{ url: string; host_name: string | null; locality: string | null }> = []
  let off = 0
  for (;;) {
    const { data } = await svc
      .from('airbnb_listings')
      .select('url, host_name, locality')
      .eq('org_id', orgId)
      .range(off, off + 999)
    const page = (data ?? []) as typeof listings
    listings.push(...page)
    if (page.length < 1000) break
    off += 1000
  }

  const { data: leadsRaw } = await svc
    .from('property_leads')
    .select('id, owner_name, location')
    .eq('org_id', orgId)
    .is('airbnb_url', null)
    .not('owner_name', 'is', null)
  const leads = (leadsRaw ?? []) as Array<{ id: number; owner_name: string; location: string | null }>

  let matched = 0
  for (const lead of leads) {
    const toks = norm(lead.owner_name).split(' ').filter(t => t && !STOP.has(t))
    const first = toks[0] && toks[0].length > 2 ? toks[0] : null
    const lloc = locKey(lead.location)
    if (!first || !lloc) continue
    const hit = listings.find(
      ab =>
        locKey(ab.locality) === lloc &&
        new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm(ab.host_name)),
    )
    if (hit) {
      await svc
        .from('property_leads')
        .update({ airbnb_url: hit.url, airbnb_match_basis: 'name+locality' })
        .eq('id', lead.id)
      matched++
    }
  }
  return { checked: leads.length, matched }
}
