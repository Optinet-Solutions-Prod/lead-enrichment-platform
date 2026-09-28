import 'server-only'
import type { createServiceClient } from '@/lib/supabase/service'
import { scoreAffiliate, shouldSkipDomain } from '@/lib/affiliate-detection/scorer'
import { extractContacts, type ContactItem } from '@/lib/contact-extraction/extract'
import { findContactsWithOpenAI } from '@/lib/contact-extraction/llm-fallback'
import { findContactsWithHunter } from '@/lib/contact-extraction/hunter'
import { validatePhones } from '@/lib/contact-extraction/phone-validate'
import { classifyAffiliateBorderline } from '@/lib/llm-fallback/borderline-classifier'

/**
 * Per-lead scoring for the two enrichment stages that only need HTML:
 * affiliate detection and contact extraction.
 *
 * Shared by the internal score-row endpoint (VM workers post fetched HTML)
 * and the in-app worker (lib/scrape/inline-enrich.ts), so both paths write
 * exactly the same columns.
 */

type Svc = ReturnType<typeof createServiceClient>

export type StageLeadCtx = {
  leadId: number
  url: string
  domain: string | null
  countryCode: string | null
  html: string
  fetchError: string | null
  contactOverridden: boolean
  /** Words from the scrape keyword that name the niche ("vpn", "hosting").
   *  A link to a domain containing one counts as an outbound niche link,
   *  which is what makes the casino-tuned scorer useful elsewhere. */
  nicheKeywords?: string[]
}

const STOP_WORDS = new Set([
  'best', 'top', 'the', 'for', 'and', 'with', 'from', 'your', 'you', 'are', 'how', 'what', 'which', 'why',
  'review', 'reviews', 'compare', 'comparison', 'guide', 'list', 'new', 'free', 'cheap', 'online', 'near',
  'sites', 'site', 'website', 'websites', 'service', 'services', 'company', 'companies', 'provider', 'providers',
  'direct', 'owner', 'owners', 'rent', 'sale', 'let', 'buy', 'price', 'prices', 'deal', 'deals', 'offer', 'offers',
  'bonus', 'bonuses', 'code', 'codes', 'not', 'without', 'vs', 'versus', 'in', 'of', 'to', 'on', 'at', 'by',
  'uk', 'usa', 'malta', 'europe', 'german', 'germany', 'deutschland', 'france', 'italy', 'spain',
  'beste', 'besten', 'bester', 'mejor', 'mejores', 'migliori', 'meilleur', 'meilleurs', 'test',
])

/** "best vpn for streaming 2026" → ["vpn", "streaming"]. */
export function nicheKeywordsFrom(keyword: string | null | undefined): string[] {
  if (!keyword) return []
  const out: string[] = []
  for (const raw of keyword.toLowerCase().split(/[^a-z0-9äöüßéèàùìòáíóúñç]+/i)) {
    const w = raw.trim()
    if (w.length < 3 || /^\d+$/.test(w) || STOP_WORDS.has(w)) continue
    if (!out.includes(w)) out.push(w)
  }
  return out.slice(0, 4)
}

export async function runAffiliateStage(svc: Svc, ctx: StageLeadCtx): Promise<Record<string, unknown>> {
  const now = new Date().toISOString()
  const { leadId, url, domain, html, fetchError } = ctx

  if (fetchError) {
    await svc
      .from('google_lead_gen_table')
      .update({
        is_affiliate: null,
        affiliate_confidence: 'ERROR',
        affiliate_indicators: [`Fetch failed: ${fetchError}`],
        affiliate_checked_at: now,
      })
      .eq('id', leadId)
    return { ok: true, status: 'fetch_error_recorded' }
  }
  if (shouldSkipDomain(domain)) {
    await svc
      .from('google_lead_gen_table')
      .update({
        is_affiliate: false,
        affiliate_score: 0,
        affiliate_casino_score: 0,
        affiliate_confidence: 'SKIPPED',
        affiliate_external_links: 0,
        affiliate_indicators: ['Skipped — known social/non-affiliate domain'],
        affiliate_checked_at: now,
      })
      .eq('id', leadId)
    return { ok: true, status: 'skipped' }
  }

  // Active partner-brand domains: a direct link to one is an unambiguous
  // outbound signal even on pages whose language hides the keyword test.
  const { data: brandRows } = await svc.rpc('list_rooster_brand_domains')
  const brandDomains = ((brandRows ?? []) as Array<{ domain: string }>)
    .map(b => b.domain)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)

  const result = scoreAffiliate(html, url, { brandDomains, nicheKeywords: ctx.nicheKeywords ?? [] })
  let isAffiliate = result.classification === 'AFFILIATE'
  let confidence: string = result.confidence
  let indicators = [...result.indicators]
  let llmConsulted = false

  // LLM tie-breaker for the borderline band; a no-op without an API key.
  if (confidence === 'LOW' || confidence === 'MEDIUM') {
    const llm = await classifyAffiliateBorderline({
      url,
      html,
      affiliateScore: result.affiliateScore,
      casinoScore: result.casinoScore,
      externalCasinoLinks: result.externalCasinoLinks,
      priorIndicators: result.indicators,
    })
    if (llm) {
      llmConsulted = true
      isAffiliate = llm.isAffiliate
      confidence = `${confidence}_LLM_${llm.isAffiliate ? 'AFFILIATE' : 'NOT_AFFILIATE'}`
      indicators = [`LLM (${llm.isAffiliate ? 'yes' : 'no'}): ${llm.reasoning}`, ...indicators]
    }
  }

  await svc
    .from('google_lead_gen_table')
    .update({
      is_affiliate: isAffiliate,
      affiliate_score: result.affiliateScore,
      affiliate_casino_score: result.casinoScore,
      affiliate_confidence: confidence,
      affiliate_external_links: result.externalCasinoLinks,
      affiliate_indicators: indicators,
      affiliate_checked_at: now,
    })
    .eq('id', leadId)
  return {
    ok: true,
    classification: isAffiliate ? 'AFFILIATE' : 'NOT_AFFILIATE',
    confidence,
    llm_consulted: llmConsulted,
  }
}

/**
 * Contact-extraction cascade:
 *   1. Regex + JSON-LD on the cached multi-page HTML (homepage + /contact…)
 *   2. If empty, OpenAI web search (no-op without a key)
 *   3. If still empty, Hunter.io domain search (no-op without a key)
 *   4. Phone validation via libphonenumber
 *   5. Persist via upsert_contact_for_lead_v2 (preserves manual rows)
 */
export async function runContactStage(svc: Svc, ctx: StageLeadCtx): Promise<Record<string, unknown>> {
  const now = new Date().toISOString()
  const { leadId, url, domain, countryCode, html, fetchError, contactOverridden } = ctx

  if (contactOverridden) return { ok: true, status: 'manually_overridden' }

  if (fetchError) {
    // The LLM and Hunter can still find contacts from public sources.
    const tier = await runLlmThenHunter()
    await persist(tier)
    return { ok: true, ...tier.summary }
  }

  if (shouldSkipDomain(domain)) {
    await svc
      .from('google_lead_gen_table')
      .update({ has_contact_details: false, contact_checked_at: now })
      .eq('id', leadId)
    return { ok: true, status: 'skipped' }
  }

  const regex = extractContacts(html, url)
  let emails = regex.emails
  let phones = regex.phones
  let contactPageUrl = regex.contactPageUrl
  let source: 'regex' | 'multi_page' | 'openai' | 'hunter' = 'regex'
  let raw: Record<string, unknown> = { regex: regex.raw }
  const items: ContactItem[] = [...regex.items]
  const socials = regex.socials
  const address = regex.address
  const contactForms = regex.contactForms
  if (html.includes('<!-- PAGE: ')) source = 'multi_page'

  const productive =
    emails.length > 0 || phones.length > 0 || contactPageUrl !== null || socials.length > 0 || contactForms.length > 0

  if (!productive) {
    const llm = await findContactsWithOpenAI(domain ?? '', url)
    if (llm) {
      emails = llm.emails
      phones = llm.phones
      contactPageUrl = llm.contactPageUrl ?? contactPageUrl
      source = 'openai'
      raw = { ...raw, openai: { reasoning: llm.reasoning } }
      const via = llm.contactPageUrl ?? url
      for (const e of llm.emails) items.push({ kind: 'email', value: e, method: 'openai', sourceUrl: via, confidence: 0.5 })
      for (const p of llm.phones) items.push({ kind: 'phone', value: p, method: 'openai', sourceUrl: via, confidence: 0.5 })
    }
    if (emails.length === 0) {
      const hunter = await findContactsWithHunter(domain ?? '')
      if (hunter && hunter.emails.length > 0) {
        emails = hunter.emails
        source = 'hunter'
        raw = { ...raw, hunter: hunter.raw }
        for (const e of hunter.emails) {
          const conf = hunter.confidenceByEmail?.[e]
          items.push({
            kind: 'email',
            value: e,
            method: 'hunter',
            sourceUrl: `https://${domain ?? ''}`,
            confidence: typeof conf === 'number' ? conf / 100 : 0.4,
            label: 'hunter.io',
          })
        }
      }
    }
  }

  phones = validatePhones(phones, countryCode)

  await svc.rpc('upsert_contact_for_lead_v2', {
    p_lead_id: leadId,
    p_emails: emails,
    p_phones: phones,
    p_contact_page_url: contactPageUrl,
    p_source: source,
    p_raw: raw,
    p_items: items,
    p_socials: socials,
    p_address: address,
    p_contact_forms: contactForms,
  })

  return {
    ok: true,
    source,
    emails: emails.length,
    phones: phones.length,
    socials: socials.length,
    contact_forms: contactForms.length,
    contact_page: contactPageUrl !== null,
  }

  async function runLlmThenHunter() {
    let emails: string[] = []
    let phones: string[] = []
    let contactPageUrl: string | null = null
    let source: 'openai' | 'hunter' | 'regex' = 'regex'
    const raw: Record<string, unknown> = { fetch_error: fetchError }
    const items: ContactItem[] = []

    const llm = await findContactsWithOpenAI(domain ?? '', url)
    if (llm) {
      emails = llm.emails
      phones = llm.phones
      contactPageUrl = llm.contactPageUrl
      source = 'openai'
      raw.openai = { reasoning: llm.reasoning }
      const via = llm.contactPageUrl ?? `https://${domain ?? ''}`
      for (const e of llm.emails) items.push({ kind: 'email', value: e, method: 'openai', sourceUrl: via, confidence: 0.5 })
      for (const p of llm.phones) items.push({ kind: 'phone', value: p, method: 'openai', sourceUrl: via, confidence: 0.5 })
    }
    if (emails.length === 0) {
      const hunter = await findContactsWithHunter(domain ?? '')
      if (hunter && hunter.emails.length > 0) {
        emails = hunter.emails
        source = 'hunter'
        raw.hunter = hunter.raw
        for (const e of hunter.emails) {
          const conf = hunter.confidenceByEmail?.[e]
          items.push({
            kind: 'email',
            value: e,
            method: 'hunter',
            sourceUrl: `https://${domain ?? ''}`,
            confidence: typeof conf === 'number' ? conf / 100 : 0.4,
            label: 'hunter.io',
          })
        }
      }
    }
    return {
      summary: { source, emails: emails.length, phones: phones.length },
      emails,
      phones: validatePhones(phones, countryCode),
      contactPageUrl,
      source,
      raw,
      items,
    }
  }

  async function persist(tier: {
    emails: string[]
    phones: string[]
    contactPageUrl: string | null
    source: 'openai' | 'hunter' | 'regex' | 'multi_page'
    raw: Record<string, unknown>
    items: ContactItem[]
  }) {
    await svc.rpc('upsert_contact_for_lead_v2', {
      p_lead_id: leadId,
      p_emails: tier.emails,
      p_phones: tier.phones,
      p_contact_page_url: tier.contactPageUrl,
      p_source: tier.source,
      p_raw: tier.raw,
      p_items: tier.items,
      p_socials: [],
      p_address: null,
      p_contact_forms: [],
    })
  }
}
