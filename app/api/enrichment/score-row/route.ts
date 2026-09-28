import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBearer } from '@/lib/auth/bearer'
import { shouldSkipDomain } from '@/lib/affiliate-detection/scorer'
import { findRoosterBrandLinks } from '@/lib/affiliate-detection/rooster'
import { runAffiliateStage, runContactStage } from '@/lib/enrichment/score-stage'
import { classifyRoosterBorderline } from '@/lib/llm-fallback/borderline-classifier'

export const dynamic = 'force-dynamic'

/**
 * Internal endpoint called by the VM enrichment workers right after they
 * write fetched HTML to fetched_html_cache. Does inline scoring for the
 * requested stage and writes results to google_lead_gen_table.
 *
 * Auth: Bearer token via INTERNAL_API_TOKEN env var (set on both Vercel
 * and the VM .env). This is NOT a user-facing endpoint.
 */
export async function POST(req: Request): Promise<Response> {
  const check = requireBearer(
    req.headers.get('authorization'),
    process.env.INTERNAL_API_TOKEN,
    { secretName: 'INTERNAL_API_TOKEN' },
  )
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  type StagExtra = {
    s_tag?: string
    source_param?: string | null
    brand?: string | null
    tracking_url?: string | null
    final_url?: string | null
    redirect_chain?: unknown
    screenshot_path?: string | null
    /** 'desktop' | 'mobile' — which pass produced this s-tag. */
    extracted_via?: string | null
  }
  let body: {
    lead_id?: number
    stage?: string
    extras?: { tags?: StagExtra[]; resolved_urls?: string[] }
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const leadId = Number(body.lead_id)
  const stage = String(body.stage ?? '').trim()
  const extras = body.extras ?? null
  if (!Number.isInteger(leadId) || leadId <= 0) return NextResponse.json({ error: 'lead_id missing' }, { status: 400 })
  if (!stage) return NextResponse.json({ error: 'stage missing' }, { status: 400 })

  const svc = createServiceClient()
  const { data: lead, error: leadErr } = await svc
    .from('google_lead_gen_table')
    .select('id, url, domain, country_code, result_type, is_contact_overridden_at')
    .eq('id', leadId)
    .maybeSingle()
  if (leadErr) {
    console.error('[score-row] lead lookup failed', { leadId, leadErr })
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  if (!lead) return NextResponse.json({ error: 'lead not found' }, { status: 404 })

  const { data: cache, error: cacheErr } = await svc
    .from('fetched_html_cache')
    .select('html, fetch_error')
    .eq('lead_id', leadId)
    .maybeSingle()
  if (cacheErr) {
    console.error('[score-row] cache lookup failed', { leadId, cacheErr })
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const fetchError = cache?.fetch_error ?? null
  const html = cache?.html ?? ''
  const url = (lead as { url: string | null }).url ?? ''
  const domain = (lead as { domain: string | null }).domain ?? null
  const countryCode = (lead as { country_code: string | null }).country_code ?? null
  const contactOverridden =
    (lead as { is_contact_overridden_at: string | null }).is_contact_overridden_at !== null

  switch (stage) {
    case 'affiliate':
      return NextResponse.json(
        await runAffiliateStage(svc, { leadId, url, domain, countryCode, html, fetchError, contactOverridden }),
      )
    case 'rooster':
      return await scoreRoosterStage()
    case 'rooster_deep':
      return await scoreRoosterDeepStage()
    case 'contact':
      return NextResponse.json(
        await runContactStage(svc, { leadId, url, domain, countryCode, html, fetchError, contactOverridden }),
      )
    case 'stag':
      return await scoreStagStage()
    default:
      return NextResponse.json(
        { ok: false, error: `Stage '${stage}' not yet wired through the enrichment queue.` },
        { status: 501 },
      )
  }

  // ----- inner handlers (affiliate + contact live in lib/enrichment/score-stage) -----
  async function scoreRoosterStage(): Promise<Response> {
    if (fetchError) {
      await svc
        .from('google_lead_gen_table')
        .update({
          is_rooster_partner: null,
          rooster_brands: null,
          rooster_checked_at: now,
        })
        .eq('id', leadId)
      return NextResponse.json({ ok: true, status: 'fetch_error_recorded' })
    }
    if (shouldSkipDomain(domain)) {
      await svc
        .from('google_lead_gen_table')
        .update({
          is_rooster_partner: false,
          brand: null,
          rooster_brands: null,
          rooster_checked_at: now,
        })
        .eq('id', leadId)
      return NextResponse.json({ ok: true, status: 'skipped' })
    }

    // Pull the active brand list fresh on every call so brand additions
    // / removals from /brands take effect immediately.
    const { data: brandRows, error: brandErr } = await svc.rpc('list_rooster_brand_domains')
    if (brandErr) {
      console.error('[score-row] brand list lookup failed (rooster)', { leadId, brandErr })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    const brandList = (brandRows ?? []) as Array<{
      domain: string
      brand_name: string | null
      monday_item_id: string | null
    }>

    const matches = findRoosterBrandLinks(html, brandList)
    const isPartner = matches.length > 0
    await svc
      .from('google_lead_gen_table')
      .update({
        is_rooster_partner: isPartner,
        brand: matches[0]?.brand_name ?? null,
        rooster_brands: matches.length > 0 ? matches : null,
        rooster_checked_at: now,
      })
      .eq('id', leadId)

    // If the cheap HTML-href check found nothing, escalate: enqueue a
    // `rooster_deep` row so the VM worker can open the page in browser,
    // follow any tracking redirects, and check the resolved final URLs
    // against the brand list. This catches affiliate sites that hide
    // brand links behind tracking redirects (/go/<brand>?affid=…).
    let deepEnqueued = false
    if (!isPartner && url && countryCode) {
      const { error: enqErr } = await svc.from('enrichment_fetch_queue').insert({
        lead_id: leadId,
        country_code: countryCode,
        url,
        want_html: false,
        want_screenshot: false,
        process_stages: ['rooster_deep'],
      })
      if (!enqErr) deepEnqueued = true
      else console.warn('rooster_deep enqueue failed:', enqErr.message)
    }

    return NextResponse.json({
      ok: true,
      partner: isPartner,
      match_count: matches.length,
      deep_check_enqueued: deepEnqueued,
    })
  }

  /**
   * Browser-resolved fallback for the Rooster check. The worker has
   * extracted tracking links from the lead page, followed each in
   * Chromium, and shipped us the final URLs via extras.resolved_urls.
   * We match those against the active brand list — if any hit, flip
   * the lead's is_rooster_partner to true (unless the user has
   * manually overridden it).
   */
  async function scoreRoosterDeepStage(): Promise<Response> {
    const resolvedUrls = (body.extras?.resolved_urls ?? []).filter(
      u => typeof u === 'string' && u.length > 0,
    )
    if (resolvedUrls.length === 0) {
      return NextResponse.json({ ok: true, partner: false, resolved_count: 0 })
    }

    const { data: brandRows, error: brandErr } = await svc.rpc('list_rooster_brand_domains')
    if (brandErr) {
      console.error('[score-row] brand list lookup failed (rooster_deep)', { leadId, brandErr })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    const brandList = (brandRows ?? []) as Array<{
      domain: string
      brand_name: string | null
      monday_item_id: string | null
    }>
    const brandsByDomain = new Map<
      string,
      { brand_name: string | null; monday_item_id: string | null }
    >()
    for (const b of brandList) {
      if (b.domain)
        brandsByDomain.set(b.domain.toLowerCase(), {
          brand_name: b.brand_name,
          monday_item_id: b.monday_item_id,
        })
    }

    const found = new Map<
      string,
      { domain: string; brand_name: string | null; monday_item_id: string | null }
    >()
    for (const u of resolvedUrls) {
      let host = ''
      try {
        host = new URL(u).hostname.toLowerCase().replace(/^www\./, '')
      } catch {
        continue
      }
      for (const [brandDomain, meta] of brandsByDomain.entries()) {
        if (host === brandDomain || host.endsWith('.' + brandDomain)) {
          if (!found.has(brandDomain)) found.set(brandDomain, { domain: brandDomain, ...meta })
          break
        }
      }
    }
    const matches = Array.from(found.values())
    if (matches.length === 0) {
      // Final safety net: ask the LLM to look at the page text + brand
      // list. Catches affiliates whose brand promotion is via image
      // logos / CTAs / cloaked tracking that neither cheap nor deep
      // signals picked up.
      //
      // Gate: run UNLESS the affiliate heuristic was a *confident*
      // NOT_AFFILIATE (is_affiliate=false at HIGH/VERY_HIGH). The old
      // gate required is_affiliate===true, which created a cascading
      // false-negative: a Danish/non-English review site that the
      // English-biased heuristic scored LOW (is_affiliate=false) would
      // never reach this net, even though it promotes our brands. By
      // also running on uncertain verdicts (LOW/MEDIUM, ERROR, null) we
      // recover those while still skipping pages the heuristic is sure
      // are not affiliates — keeping the OpenAI cost bounded.
      const { data: cacheRow } = await svc
        .from('fetched_html_cache')
        .select('html')
        .eq('lead_id', leadId)
        .maybeSingle()
      const cachedHtml = (cacheRow as { html: string | null } | null)?.html ?? ''
      const { data: leadFlags } = await svc
        .from('google_lead_gen_table')
        .select('is_affiliate, affiliate_confidence, is_rooster_overridden_at')
        .eq('id', leadId)
        .maybeSingle()
      const flags = leadFlags as {
        is_affiliate: boolean | null
        affiliate_confidence: string | null
        is_rooster_overridden_at: string | null
      } | null
      const confidence = flags?.affiliate_confidence ?? ''
      const confidentNotAffiliate =
        flags?.is_affiliate === false &&
        (confidence === 'HIGH' || confidence === 'VERY_HIGH')
      const isOverridden = flags?.is_rooster_overridden_at != null

      if (!confidentNotAffiliate && !isOverridden && cachedHtml.length > 200) {
        const llm = await classifyRoosterBorderline({
          url: url,
          html: cachedHtml,
          brands: brandList.map(b => ({ domain: b.domain, name: b.brand_name })),
        })
        if (llm?.isPartner && llm.matchedBrandDomains.length > 0) {
          const llmMatches = llm.matchedBrandDomains.map(domain => {
            const meta = brandList.find(b => b.domain.toLowerCase() === domain)
            return {
              domain,
              brand_name: meta?.brand_name ?? null,
              monday_item_id: meta?.monday_item_id ?? null,
            }
          })
          await svc
            .from('google_lead_gen_table')
            .update({
              is_rooster_partner: true,
              brand: llmMatches[0]?.brand_name ?? null,
              rooster_brands: llmMatches,
            })
            .eq('id', leadId)
            .is('is_rooster_overridden_at', null)
          return NextResponse.json({
            ok: true,
            partner: true,
            match_count: llmMatches.length,
            llm_consulted: true,
            llm_reasoning: llm.reasoning,
          })
        }
      }

      return NextResponse.json({
        ok: true,
        partner: false,
        resolved_count: resolvedUrls.length,
        llm_consulted: !confidentNotAffiliate && !isOverridden && cachedHtml.length > 200,
      })
    }

    // Flip the lead — but never trample a manual override.
    const { error: updErr } = await svc
      .from('google_lead_gen_table')
      .update({
        is_rooster_partner: true,
        brand: matches[0]?.brand_name ?? null,
        rooster_brands: matches,
      })
      .eq('id', leadId)
      .is('is_rooster_overridden_at', null)
    if (updErr) {
      console.error('[score-row] rooster_deep update failed', { leadId, updErr })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, partner: true, match_count: matches.length })
  }

  /**
   * S-tag stage: the worker did the full extract + redirect-resolve in
   * the country profile's Chromium and shipped us the resolved tags
   * via the extras payload. We just normalise + persist via the
   * combined replace_and_verify RPC (which also runs the on-Monday
   * dup-check + Rooster-brand cross-reference inline).
   */
  async function scoreStagStage(): Promise<Response> {
    const tagsRaw = extras?.tags ?? []
    const tags = tagsRaw
      .filter(t => typeof t?.s_tag === 'string' && t.s_tag.length > 0)
      .map(t => ({
        s_tag: t.s_tag,
        source_param: t.source_param ?? null,
        brand: t.brand ?? null,
        tracking_url: t.tracking_url ?? null,
        final_url: t.final_url ?? null,
        redirect_chain: t.redirect_chain ?? null,
        screenshot_path: t.screenshot_path ?? null,
        // 'desktop' | 'mobile' — set by the VM worker so we can measure
        // how much lift the mobile-pass retry is providing. Unknown
        // values are normalised to null; the RPC tolerates either.
        extracted_via:
          t.extracted_via === 'desktop' || t.extracted_via === 'mobile'
            ? t.extracted_via
            : null,
      }))

    const { data, error } = await svc.rpc('replace_and_verify_s_tags_for_lead', {
      p_lead_id: leadId,
      p_tags: tags,
    })
    if (error) {
      console.error('[score-row] s_tags rpc failed', { leadId, error })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { inserted: number; matched: number; rooster: number }
      | null

    return NextResponse.json({
      ok: true,
      inserted: row?.inserted ?? 0,
      matched_on_monday: row?.matched ?? 0,
      rooster_brand_tags: row?.rooster ?? 0,
    })
  }
}
