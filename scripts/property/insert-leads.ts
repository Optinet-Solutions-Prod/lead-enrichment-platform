/**
 * Load harvested Malta property leads into public.property_leads.
 *
 * Reads every *.json file in the directory passed as argv[2] (each produced
 * by a collection run with the shape below), validates + normalizes, then
 * REPLACES that site's rows (delete by source_site, insert fresh) so
 * re-running a harvest is idempotent.
 *
 *   { "source_site": "dar.mt", "status": "ok|partial|blocked|empty",
 *     "notes": "...", "leads": [ { listing_url, title, price_text, location,
 *     owner_name, contact_phone, contact_email, contact_type } ] }
 *
 * Run: npx tsx scripts/property/insert-leads.ts <dir-with-json-files>
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', quiet: true })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!URL || !SERVICE) {
  console.error('Missing Supabase env — run from the repo root with .env.local present.')
  process.exit(1)
}
const dir = process.argv[2] ?? ''
if (!dir) {
  console.error('Usage: npx tsx scripts/property/insert-leads.ts <dir-with-json-files>')
  process.exit(1)
}

type Lead = {
  listing_url?: string | null
  title?: string | null
  price_text?: string | null
  location?: string | null
  owner_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  contact_type?: string | null
}
type SiteFile = { source_site?: string; status?: string; notes?: string; leads?: Lead[] }

const MAX_PER_SITE = 20

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t.length > 0 && t.length <= 500 ? t : null
}

/** Normalize Maltese phone formats: bare 8-digit mobiles/landlines get +356. */
function normPhone(v: unknown): string | null {
  const raw = clean(v)
  if (!raw) return null
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+356\d{8}$/.test(digits)) return `+356 ${digits.slice(4)}`
  if (/^00356\d{8}$/.test(digits)) return `+356 ${digits.slice(5)}`
  if (/^356\d{8}$/.test(digits)) return `+356 ${digits.slice(3)}`
  if (/^[279]\d{7}$/.test(digits)) return `+356 ${digits}`
  // Non-Maltese or odd shapes: keep as found if it looks like a phone at all.
  return /\d{6,}/.test(digits) ? raw : null
}

function normEmail(v: unknown): string | null {
  const raw = clean(v)?.toLowerCase() ?? null
  if (!raw) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw) ? raw : null
}

async function main() {
  const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
  // Harvest data belongs to the Property Management workspace.
  const { data: pmOrg } = await svc
    .from('organizations')
    .select('id')
    .eq('slug', 'property-management')
    .maybeSingle()
  if (!pmOrg) {
    console.error('property-management organization not found — run migrations first.')
    process.exit(1)
  }
  const files = readdirSync(dir).filter(f => f.endsWith('.json'))
  if (files.length === 0) {
    console.error(`No .json files in ${dir}`)
    process.exit(1)
  }

  let grandTotal = 0
  for (const file of files.sort()) {
    let parsed: SiteFile
    try {
      parsed = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as SiteFile
    } catch {
      console.log(`SKIP  ${file} — invalid JSON`)
      continue
    }
    const site = clean(parsed.source_site)?.toLowerCase().replace(/^www\./, '')
    if (!site) {
      console.log(`SKIP  ${file} — missing source_site`)
      continue
    }

    const seenKeys = new Set<string>()
    const rows: Record<string, unknown>[] = []
    for (const lead of parsed.leads ?? []) {
      const phone = normPhone(lead.contact_phone)
      const email = normEmail(lead.contact_email)
      const owner = clean(lead.owner_name)
      if (!phone && !email && !owner) continue // no contact value — not a lead
      const url = clean(lead.listing_url)
      const key = phone ?? email ?? url ?? owner ?? String(rows.length)
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      const ct = lead.contact_type
      rows.push({
        org_id: pmOrg.id,
        source_site: site,
        listing_url: url,
        title: clean(lead.title),
        price_text: clean(lead.price_text),
        location: clean(lead.location),
        owner_name: owner,
        contact_phone: phone,
        contact_email: email,
        contact_type: ct === 'owner' || ct === 'agency' ? ct : 'unknown',
        keyword: 'properties in malta',
        notes: clean(parsed.notes),
      })
      if (rows.length >= MAX_PER_SITE) break
    }

    // Replace this site's rows so re-harvests stay idempotent.
    const { error: delErr } = await svc.from('property_leads').delete().eq('org_id', pmOrg.id).eq('source_site', site)
    if (delErr) {
      console.log(`FAIL  ${site} — delete: ${delErr.message}`)
      continue
    }
    if (rows.length > 0) {
      const { error: insErr } = await svc.from('property_leads').insert(rows)
      if (insErr) {
        console.log(`FAIL  ${site} — insert: ${insErr.message}`)
        continue
      }
    }
    const phones = rows.filter(r => r.contact_phone).length
    const emails = rows.filter(r => r.contact_email).length
    grandTotal += rows.length
    console.log(
      `OK    ${site.padEnd(28)} status=${parsed.status ?? '?'} inserted=${rows.length} (☎ ${phones} · ✉ ${emails})`,
    )
  }
  console.log(`\nTOTAL inserted: ${grandTotal}`)
}

main().catch(e => {
  console.error('insert-leads crashed:', e)
  process.exit(1)
})
