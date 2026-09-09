'use server'

import { getConnectedConfig } from '@/lib/integrations/store'
import { getOrgContext } from '@/lib/orgs/context'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * On-demand property-source scrapes that run INSIDE the Next.js server
 * (plain HTTP — no VM, no browser). Each source merges new leads into
 * public.property_leads (dedup by listing_url per site — re-runs only add
 * listings we haven't seen). Airbnb is the exception: it runs on Apify's
 * browser fleet asynchronously — start here, ingest when it finishes.
 */

export type SourceResult = {
  source: string
  status: 'ok' | 'error' | 'started' | 'skipped'
  detail: string
}
export type RunState = { results: SourceResult[] } | { error: string } | null

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const MAX_NEW_PER_RUN = 50

async function fetchWithTimeout(url: string, ms = 20_000): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
      signal: ctl.signal,
      cache: 'no-store',
    })
  } finally {
    clearTimeout(t)
  }
}

function normPhone(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+356\d{8}$/.test(digits)) return `+356 ${digits.slice(4)}`
  if (/^00356\d{8}$/.test(digits)) return `+356 ${digits.slice(5)}`
  if (/^356\d{8}$/.test(digits)) return `+356 ${digits.slice(3)}`
  if (/^[279]\d{7}$/.test(digits)) return `+356 ${digits}`
  return /\d{6,}/.test(digits) ? raw.trim() : null
}

type LeadRow = {
  listing_url: string
  title: string | null
  price_text: string | null
  location: string | null
  owner_name: string | null
  contact_phone: string | null
  contact_email: string | null
  contact_type: 'owner' | 'agency' | 'unknown'
  notes: string | null
}

/** Insert only listings we haven't stored for this site yet (merge, not
 *  replace — the bulk harvest loader replaces; this incremental path adds). */
async function mergeLeads(
  svc: ReturnType<typeof createServiceClient>,
  orgId: string,
  site: string,
  rows: LeadRow[],
): Promise<{ added: number; seen: number }> {
  const withContact = rows.filter(r => r.contact_phone || r.contact_email || r.owner_name)
  if (withContact.length === 0) return { added: 0, seen: rows.length }
  const { data: existing } = await svc
    .from('property_leads')
    .select('listing_url')
    .eq('org_id', orgId)
    .eq('source_site', site)
  const known = new Set(
    ((existing ?? []) as { listing_url: string | null }[]).map(r => r.listing_url),
  )
  const fresh = withContact
    .filter(r => !known.has(r.listing_url))
    .slice(0, MAX_NEW_PER_RUN)
    .map(r => ({ ...r, org_id: orgId, source_site: site, keyword: 'properties in malta' }))
  if (fresh.length > 0) {
    const { error } = await svc.from('property_leads').insert(fresh)
    if (error) throw new Error(error.message)
  }
  return { added: fresh.length, seen: rows.length }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** homesinmalta.com — open WordPress/Houzez REST API; owner name + phone are
 *  first-class meta fields. Newest 30 listings per run. */
async function runHomesInMalta(svc: ReturnType<typeof createServiceClient>, orgId: string): Promise<string> {
  const res = await fetchWithTimeout(
    'https://homesinmalta.com/wp-json/wp/v2/properties?per_page=30&orderby=date&order=desc&_fields=id,link,title,property_meta',
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const items = (await res.json()) as Array<{
    link?: string
    title?: { rendered?: string }
    property_meta?: Record<string, unknown>
  }>
  const meta = (m: Record<string, unknown> | undefined, k: string): string | null => {
    const v = m?.[k]
    if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : null
    return typeof v === 'string' ? v : null
  }
  const rows: LeadRow[] = items
    .filter(i => typeof i.link === 'string')
    .map(i => {
      const price = meta(i.property_meta, 'fave_property_price')
      return {
        listing_url: i.link!,
        title: i.title?.rendered?.replace(/&#\d+;|<[^>]+>/g, ' ').trim() || null,
        price_text: price ? `€${price}` : null,
        location: meta(i.property_meta, 'fave_property_address'),
        owner_name: meta(i.property_meta, 'fave_owners-name'),
        contact_phone: normPhone(meta(i.property_meta, 'fave_contact')),
        contact_email: null,
        contact_type: 'owner',
        notes: 'On-demand scrape via homesinmalta WP REST API.',
      }
    })
  const { added, seen } = await mergeLeads(svc, orgId, 'homesinmalta.com', rows)
  return `${seen} newest listings checked, ${added} new lead(s) added`
}

/** propertiesfromowner.com — its public /api/map returns every active
 *  listing including the owner's mobile in one call. */
async function runPropertiesFromOwner(
  svc: ReturnType<typeof createServiceClient>,
  orgId: string,
): Promise<string> {
  const res = await fetchWithTimeout('https://www.propertiesfromowner.com/api/map')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const items = (await res.json()) as Array<{
    id?: string
    title?: string
    location?: string
    price?: number | string
    mobile?: string
    created_at?: string
  }>
  const rows: LeadRow[] = items
    .filter(i => i.id)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .map(i => ({
      listing_url: `https://www.propertiesfromowner.com/search/${i.id}`,
      title: i.title ?? null,
      price_text: i.price != null && i.price !== '' ? `€${i.price}` : null,
      location: i.location ?? null,
      owner_name: null,
      contact_phone: normPhone(i.mobile),
      contact_email: null,
      contact_type: 'owner',
      notes: 'On-demand scrape via propertiesfromowner /api/map.',
    }))
  const { added, seen } = await mergeLeads(svc, orgId, 'propertiesfromowner.com', rows)
  return `${seen} active listings checked, ${added} new lead(s) added`
}

/** maltapark.com — keyword search (all classifieds), then mine the top 10
 *  detail pages' ad text for phone numbers (the official phone reveal is
 *  reCAPTCHA-gated, but sellers write numbers in descriptions). */
async function runMaltapark(
  svc: ReturnType<typeof createServiceClient>,
  orgId: string,
  keyword: string,
): Promise<string> {
  const res = await fetchWithTimeout(
    `https://www.maltapark.com/search/?c=s1&search=${encodeURIComponent(keyword)}`,
  )
  if (!res.ok) throw new Error(`search HTTP ${res.status}`)
  const html = await res.text()
  const cardRe = /<div class="item[^"]*"\s+data-itemid="(\d+)"/gi
  const ids: string[] = []
  for (const m of html.matchAll(cardRe)) {
    if (!ids.includes(m[1]!)) ids.push(m[1]!)
    if (ids.length >= 10) break
  }
  if (ids.length === 0) return `no listings found for “${keyword}”`

  const phoneRe = /(?:\+?356[\s-]?)?([279]\d{3})[\s-]?(\d{4})(?!\d)/
  const rows: LeadRow[] = []
  for (const id of ids) {
    const dRes = await fetchWithTimeout(`https://www.maltapark.com/item/details/${id}`, 15_000)
    if (!dRes.ok) continue
    const d = await dRes.text()
    const title =
      /<a class="header" href="\/item\/details\/\d+">(.*?)<\/a>/i.exec(html + d)?.[1] ??
      /<meta property="og:title" content="([^"]*)"/i.exec(d)?.[1] ??
      null
    const price = /<span class="price">\s*<span>([^<]*)<\/span>/i.exec(d)?.[1]?.trim() ?? null
    const owner = /id="currentagent"[^>]*value="([^"]*)"/i.exec(d)?.[1] ?? null
    const descBlock =
      /<meta name="description" content="([^"]*)"/i.exec(d)?.[1] ??
      /readmore-wrapper[\s\S]{0,3000}/i.exec(d)?.[0] ??
      ''
    const pm = phoneRe.exec(descBlock)
    rows.push({
      listing_url: `https://www.maltapark.com/item/details/${id}`,
      title: title ? title.replace(/<[^>]+>/g, '').trim() : null,
      price_text: price,
      location: null,
      owner_name: owner,
      contact_phone: pm ? `+356 ${pm[1]}${pm[2]}` : null,
      contact_email: null,
      contact_type: 'owner',
      notes: `On-demand maltapark search for “${keyword}”.`,
    })
    await new Promise(r => setTimeout(r, 250))
  }
  const { added, seen } = await mergeLeads(svc, orgId, 'maltapark.com', rows)
  const withPhone = rows.filter(r => r.contact_phone).length
  return `${seen} listings checked (${withPhone} with phone in ad text), ${added} new lead(s) added`
}

/** MTA HFPS register — re-download the official licence CSVs (Malta + Gozo)
 *  and REPLACE public.hfps_register. */
async function runMtaRegister(svc: ReturnType<typeof createServiceClient>): Promise<string> {
  const parseCsv = (text: string): string[][] => {
    const rows: string[][] = []
    let field = '',
      row: string[] = [],
      inQ = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"'
          i++
        } else if (c === '"') inQ = false
        else field += c
      } else if (c === '"') inQ = true
      else if (c === ',') {
        row.push(field)
        field = ''
      } else if (c === '\n' || c === '\r') {
        if (field !== '' || row.length > 0) {
          row.push(field)
          rows.push(row)
          field = ''
          row = []
        }
      } else field += c
    }
    if (field !== '' || row.length > 0) {
      row.push(field)
      rows.push(row)
    }
    return rows
  }

  const all: Record<string, unknown>[] = []
  const seenRefs = new Set<string>()
  for (const [file, island] of [
    ['hfps-malta.csv', 'Malta'],
    ['hfps-gozo.csv', 'Gozo'],
  ] as const) {
    const res = await fetchWithTimeout(`https://mta.com.mt/licences/csv/${file}`, 30_000)
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
    const rows = parseCsv((await res.text()).replace(/^﻿/, ''))
    const header = rows[0] ?? []
    const idx = (name: string) => header.findIndex(h => h.trim() === name)
    const [iRef, iEst, iA1, iA2, iTown, iBeds, iCov, iName] = [
      idx('Ref'),
      idx('Establishment'),
      idx('Address 1'),
      idx('Address 2'),
      idx('Town'),
      idx('Bedrooms'),
      idx('Bed / Covers'),
      idx('Name'),
    ]
    for (const r of rows.slice(1)) {
      const ref = (r[iRef] ?? '').trim()
      if (!ref || seenRefs.has(ref)) continue
      seenRefs.add(ref)
      const int = (v: string | undefined) => {
        const n = Number(v)
        return Number.isFinite(n) && v !== '' ? n : null
      }
      all.push({
        ref,
        island,
        establishment: (r[iEst] ?? '').trim() || null,
        house_no: (r[iA1] ?? '').trim() || null,
        street: (r[iA2] ?? '').trim() || null,
        town: (r[iTown] ?? '').trim() || null,
        bedrooms: int(r[iBeds]),
        beds: int(r[iCov]),
        full_name: (r[iName] ?? '').trim() || null,
      })
    }
  }
  if (all.length < 100) throw new Error(`register looks wrong (${all.length} rows) — aborting replace`)
  const { error: delErr } = await svc.from('hfps_register').delete().neq('ref', '__none__')
  if (delErr) throw new Error(delErr.message)
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await svc.from('hfps_register').insert(all.slice(i, i + 500))
    if (error) throw new Error(`insert @${i}: ${error.message}`)
  }
  return `register refreshed — ${all.length.toLocaleString()} licensed premises`
}

/** The org's connected Apify account wins; the platform env token is the
 *  fallback so existing setups keep working. */
async function resolveApify(orgId: string): Promise<{ token: string; base: string; source: 'your org' | 'platform' } | null> {
  const cfg = await getConnectedConfig(orgId, 'apify')
  if (cfg?.api_token) {
    return {
      token: cfg.api_token,
      base: (cfg.api_url ?? 'https://api.apify.com').replace(/\/$/, ''),
      source: 'your org',
    }
  }
  if (process.env.APIFY_TOKEN) {
    return { token: process.env.APIFY_TOKEN, base: 'https://api.apify.com', source: 'platform' }
  }
  return null
}

/** Airbnb via Apify — asynchronous: this only STARTS the browser crawl. */
async function startAirbnb(svc: ReturnType<typeof createServiceClient>, orgId: string): Promise<string> {
  const apify = await resolveApify(orgId)
  if (!apify) throw new Error('No Apify account available — connect one under Account → Integrations')
  const start = await fetch(`${apify.base}/v2/acts/tri_angle~airbnb-scraper/runs?token=${apify.token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locationQueries: ['Malta', 'Gozo'],
      maxResults: 300,
      enrichUserProfiles: true,
      currency: 'EUR',
      locale: 'en-US',
    }),
    cache: 'no-store',
  })
  const body = (await start.json()) as { data?: { id?: string; defaultDatasetId?: string } }
  if (!body.data?.id) throw new Error('Apify did not return a run id')
  await svc.from('system_settings').upsert({
    key: `airbnb_last_run:${orgId}`,
    value: { runId: body.data.id, datasetId: body.data.defaultDatasetId, startedAt: new Date().toISOString() },
  })
  return `Apify run ${body.data.id} started on the ${apify.source} account (~300 listings) — use “Ingest last Airbnb run” in a few minutes`
}

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

  const svc = createServiceClient()
  const results: SourceResult[] = []
  const run = async (source: string, fn: () => Promise<string>, started = false) => {
    try {
      const detail = await fn()
      results.push({ source, status: started ? 'started' : 'ok', detail })
    } catch (e) {
      results.push({ source, status: 'error', detail: (e as Error).message })
    }
  }

  if (sources.includes('homesinmalta')) await run('homesinmalta.com', () => runHomesInMalta(svc, org.orgId))
  if (sources.includes('propertiesfromowner'))
    await run('propertiesfromowner.com', () => runPropertiesFromOwner(svc, org.orgId))
  if (sources.includes('maltapark')) await run('maltapark.com', () => runMaltapark(svc, org.orgId, keyword))
  if (sources.includes('mta')) await run('mta.com.mt', () => runMtaRegister(svc))
  if (sources.includes('airbnb')) await run('airbnb.com', () => startAirbnb(svc, org.orgId), true)

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
