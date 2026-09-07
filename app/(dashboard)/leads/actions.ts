'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { shouldSkipDomain } from '@/lib/affiliate-detection/scorer'
import { logActivity } from '@/lib/activity-log'
import { requireLeadAccess, requireLeadsAccess } from '@/lib/auth/require-lead-access'

/** Log the raw Supabase/Postgrest error server-side for debugging but
 *  return a generic message to the caller. Supabase error messages
 *  routinely include table names, column names, and constraint names
 *  that shouldn't reach the browser through the server-action error
 *  boundary. Cousin of round-1 #28 (which fixed the API-route variant). */
function safeError(err: unknown, fallback: string): string {
  console.error('[leads/actions]', err)
  return fallback
}

// getLeadDetails used to live here as a server action but server actions
// trigger a full page-tree re-render on every call, which made the drawer
// feel sluggish. The fetch was moved to /api/leads/[id] — see
// app/(dashboard)/leads/_lib/detail-query.ts for the shared loader.

/**
 * Force-enrich a set of leads — override the auto-skip that fires
 * when a domain is already marked not-relevant.
 * Calls the force_enrich_leads RPC which flips the flag, clears
 * the checked_at timestamps so the chain re-enqueues, and resets
 * the parent job's enrichment_status so the chain comes off
 * "complete" for the next tick.
 *
 * Used by the lead drawer's "Force enrich" button and the
 * leads/scrape table bulk action.
 */
export type ForceEnrichResult = { ok: true; queued: number } | { ok: false; error: string }

export async function forceEnrichLeadsAction(leadIds: number[]): Promise<ForceEnrichResult> {
  const sanitized = leadIds.filter(n => Number.isInteger(n) && n > 0)
  if (sanitized.length === 0) return { ok: false, error: 'No leads selected.' }
  const access = await requireLeadsAccess(sanitized)
  if (!access.ok) return { ok: false, error: access.error }

  const svc = createServiceClient()
  const { data, error } = await svc.rpc('force_enrich_leads', { p_lead_ids: sanitized })
  if (error) return { ok: false, error: safeError(error, 'Failed to queue enrichment.') }

  const queued = typeof data === 'number' ? data : 0
  await logActivity({
    action: 'leads.force_enrich',
    entity_type: 'lead',
    entity_id: sanitized.length === 1 ? String(sanitized[0]) : null,
    details: { lead_count: sanitized.length, queued },
  })

  revalidatePath('/leads')
  revalidatePath('/scrape', 'layout')
  return { ok: true, queued }
}

/**
 * Delete the screenshot attached to a lead. Removes the file from
 * Supabase Storage and clears the screenshot_*_link columns. Used by
 * the "Delete screenshot" button in the row-detail drawer.
 */
export async function deleteLeadScreenshot(formData: FormData): Promise<void> {
  const leadId = Number(formData.get('lead_id'))
  if (!Number.isInteger(leadId) || leadId <= 0) throw new Error('Missing lead id.')
  const access = await requireLeadAccess(leadId)
  if (!access.ok) throw new Error(access.error)

  const svc = createServiceClient()
  const { data: lead, error: readErr } = await svc
    .from('google_lead_gen_table')
    .select('screenshot_content_link')
    .eq('id', leadId)
    .maybeSingle()
  if (readErr) throw new Error(safeError(readErr, 'Failed to load lead.'))

  const path = (lead as { screenshot_content_link: string | null } | null)?.screenshot_content_link
  if (path) {
    // Best-effort delete — even if the storage object's gone we still
    // want to clear the DB columns.
    try {
      await svc.storage.from('lead-screenshots').remove([path])
    } catch {
      /* ignore */
    }
  }

  const { error: updErr } = await svc
    .from('google_lead_gen_table')
    .update({ screenshot_content_link: null, screenshot_view_link: null })
    .eq('id', leadId)
  if (updErr) throw new Error(safeError(updErr, 'Failed to clear screenshot.'))

  await logActivity({
    action: 'screenshot.delete',
    entity_type: 'lead',
    entity_id: leadId,
    details: { had_path: path !== null },
  })

  revalidatePath('/leads')
  revalidatePath('/scrape', 'layout')
}

// ============================================================
// Generic boolean-flag override (used by 7.2–7.6 editors)
// ============================================================

const BOOL_VALUES: ReadonlySet<string> = new Set(['yes', 'no', 'clear'])

async function setBooleanFlag(params: {
  leadId: number
  value: string
  valueColumn: string
  overrideColumn: string
  logAction: string
  extraPatch?: Record<string, unknown>
}) {
  const { leadId, value, valueColumn, overrideColumn, logAction, extraPatch } = params
  if (!Number.isInteger(leadId) || leadId <= 0) throw new Error('Missing lead id.')
  if (!BOOL_VALUES.has(value)) throw new Error(`Invalid value: ${value}`)

  const access = await requireLeadAccess(leadId)
  if (!access.ok) throw new Error(access.error)

  const svc = createServiceClient()
  let patch: Record<string, unknown>
  switch (value) {
    case 'clear':
      patch = { [valueColumn]: null, [overrideColumn]: null, ...(extraPatch ?? {}) }
      break
    case 'yes':
      patch = { [valueColumn]: true, [overrideColumn]: new Date().toISOString() }
      break
    default: // 'no'
      patch = { [valueColumn]: false, [overrideColumn]: new Date().toISOString() }
  }

  const { error } = await svc.from('google_lead_gen_table').update(patch).eq('id', leadId)
  if (error) throw new Error(safeError(error, 'Failed to save override.'))

  await logActivity({
    action: logAction,
    entity_type: 'lead',
    entity_id: leadId,
    details: { value },
  })

  revalidatePath('/leads')
  revalidatePath('/scrape', 'layout')
}

export async function setAffiliateLabel(formData: FormData): Promise<void> {
  await setBooleanFlag({
    leadId: Number(formData.get('lead_id')),
    value: String(formData.get('value') ?? ''),
    valueColumn: 'is_affiliate',
    overrideColumn: 'is_affiliate_overridden_at',
    logAction: 'override.affiliate',
  })
}

export async function setContactLabel(formData: FormData): Promise<void> {
  await setBooleanFlag({
    leadId: Number(formData.get('lead_id')),
    value: String(formData.get('value') ?? ''),
    valueColumn: 'has_contact_details',
    overrideColumn: 'is_contact_overridden_at',
    logAction: 'override.contact',
  })
}

export async function setStagLabel(formData: FormData): Promise<void> {
  await setBooleanFlag({
    leadId: Number(formData.get('lead_id')),
    value: String(formData.get('value') ?? ''),
    valueColumn: 'has_s_tags',
    overrideColumn: 'is_stag_overridden_at',
    logAction: 'override.stag',
  })
}

// ============================================================
// Mark / unmark a lead as not-relevant. Hides it from /leads (default
// view), cancels any in-flight enrichment for it, and prevents future
// enrichment passes from picking it up. Reversible.
// ============================================================

export type MarkNotRelevantState =
  | { status: 'ok'; isNotRelevant: boolean }
  | { status: 'error'; error: string }
  | null

export async function setNotRelevantAction(
  _prev: MarkNotRelevantState,
  formData: FormData,
): Promise<MarkNotRelevantState> {
  const leadId = Number(formData.get('lead_id'))
  if (!Number.isInteger(leadId) || leadId <= 0) return { status: 'error', error: 'Missing lead id.' }

  const access = await requireLeadAccess(leadId)
  if (!access.ok) return { status: 'error', error: access.error }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'error', error: 'Not signed in.' }

  // 'on' from a checkbox-style hidden input maps to true; empty string = false (unmark).
  const wantsTrue = String(formData.get('value') ?? '').toLowerCase() === 'true'

  const svc = createServiceClient()
  // Resolve a friendly attribution string — display_name → username → email.
  const { data: profileRow } = await svc
    .from('user_profiles')
    .select('username, display_name')
    .eq('id', user.id)
    .maybeSingle()
  const profile = profileRow as { username: string | null; display_name: string | null } | null
  const markedBy = profile?.display_name ?? profile?.username ?? user.email ?? user.id

  const update: Record<string, unknown> = wantsTrue
    ? {
        is_not_relevant: true,
        not_relevant_marked_at: new Date().toISOString(),
        not_relevant_marked_by: markedBy,
      }
    : {
        is_not_relevant: false,
        not_relevant_marked_at: null,
        not_relevant_marked_by: null,
      }

  const { error: updErr } = await svc
    .from('google_lead_gen_table')
    .update(update)
    .eq('id', leadId)
  if (updErr) return { status: 'error', error: safeError(updErr, 'Failed to update lead.') }

  if (wantsTrue) {
    // Cancel any pending/paused enrichment for this lead so the worker
    // doesn't pick it up after the user just hid it.
    await svc
      .from('enrichment_fetch_queue')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .in('status', ['pending', 'paused'])
  }

  await logActivity({
    action: wantsTrue ? 'lead.mark_not_relevant' : 'lead.unmark_not_relevant',
    entity_type: 'lead',
    entity_id: leadId,
    details: { marked_by: markedBy },
  })

  revalidatePath('/leads')
  revalidatePath('/scrape', 'layout')
  return { status: 'ok', isNotRelevant: wantsTrue }
}

// ============================================================
// Bulk-select actions on /leads:
//   - retryEnrichmentForLeads — re-enqueue an enrichment stage for
//     the selected lead ids only (used to retry failed domains
//     without re-running the whole job).
//   - deleteLeads             — typed-confirm wipe of selected leads.
// ============================================================

export type SkippedLead = {
  leadId: number
  reason: 'no_url' | 'no_country' | 'affiliate_domain' | 'not_affiliate'
}

export type BulkActionState =
  | { status: 'ok'; message: string; skipped?: SkippedLead[] }
  | { status: 'error'; error: string }
  | null

const VALID_STAGES = new Set(['affiliate', 'contact', 'stag'])

/** Max lead IDs accepted per bulk submit. Mirrors the 200 cap used by
 *  `bulkRerunScrapeJobs` in scrape/actions.ts so all non-admin bulk
 *  paths share the same blast radius. See BUGS.md R2-33. */
const LEAD_IDS_CAP = 200

function parseLeadIds(fd: FormData): number[] {
  const raw = String(fd.get('lead_ids') ?? '').trim()
  if (!raw) return []
  const all = Array.from(
    new Set(
      raw
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isInteger(n) && n > 0),
    ),
  )
  return all.slice(0, LEAD_IDS_CAP)
}

export async function retryEnrichmentForLeads(
  _prev: BulkActionState,
  fd: FormData,
): Promise<BulkActionState> {
  const stage = String(fd.get('stage') ?? '')
  if (!VALID_STAGES.has(stage)) {
    return { status: 'error', error: `Invalid stage "${stage}".` }
  }
  const leadIds = parseLeadIds(fd)
  if (leadIds.length === 0) {
    return { status: 'error', error: 'No leads selected.' }
  }

  const access = await requireLeadsAccess(leadIds)
  if (!access.ok) return { status: 'error', error: access.error }

  const svc = createServiceClient()
  const { data: leads, error: leadsErr } = await svc
    .from('google_lead_gen_table')
    .select('id, url, domain, country_code, result_type, is_affiliate')
    .in('id', leadIds)
  if (leadsErr) return { status: 'error', error: safeError(leadsErr, 'Failed to load leads.') }

  const skippedDetail: SkippedLead[] = []
  const enqueueable: Array<{
    lead_id: number
    country_code: string
    url: string
    want_html: boolean
    want_screenshot: boolean
    process_stages: string[]
  }> = []

  for (const lead of (leads ?? []) as Array<{
    id: number
    url: string | null
    domain: string | null
    country_code: string | null
    result_type: string | null
    is_affiliate: boolean | null
  }>) {
    const url = lead.url ?? ''
    if (!url || !url.startsWith('http')) {
      skippedDetail.push({ leadId: lead.id, reason: 'no_url' })
      continue
    }
    if (!lead.country_code) {
      skippedDetail.push({ leadId: lead.id, reason: 'no_country' })
      continue
    }
    if (shouldSkipDomain(lead.domain)) {
      skippedDetail.push({ leadId: lead.id, reason: 'affiliate_domain' })
      continue
    }
    if (stage === 'stag' && lead.is_affiliate !== true) {
      skippedDetail.push({ leadId: lead.id, reason: 'not_affiliate' })
      continue
    }
    enqueueable.push({
      lead_id: lead.id,
      country_code: lead.country_code,
      url,
      want_html: true,
      want_screenshot: stage === 'affiliate' && lead.result_type === 'PPC',
      process_stages: [stage],
    })
  }

  const skipped = skippedDetail.length

  if (enqueueable.length === 0) {
    return {
      status: 'ok',
      message:
        stage === 'stag'
          ? `Nothing to enqueue — none of the selected leads are flagged as affiliates.`
          : `Nothing to enqueue (${skipped} skipped).`,
      skipped: skippedDetail,
    }
  }

  const { error: qErr } = await svc.from('enrichment_fetch_queue').insert(enqueueable)
  if (qErr) return { status: 'error', error: safeError(qErr, 'Failed to enqueue retry.') }

  await logActivity({
    action: `enrichment.${stage}.retry`,
    entity_type: 'leads_bulk',
    details: {
      requested: leadIds.length,
      enqueued: enqueueable.length,
      skipped,
    },
  })

  revalidatePath('/leads')
  revalidatePath('/scrape', 'layout')
  return {
    status: 'ok',
    message: `Re-queued ${enqueueable.length} lead${enqueueable.length === 1 ? '' : 's'} for ${stage} enrichment${skipped > 0 ? ` (${skipped} skipped)` : ''}.`,
    skipped: skippedDetail,
  }
}

export async function deleteLeads(
  _prev: BulkActionState,
  fd: FormData,
): Promise<BulkActionState> {
  const leadIds = parseLeadIds(fd)
  if (leadIds.length === 0) {
    return { status: 'error', error: 'No leads selected.' }
  }

  // Typed confirmation: user must type "delete <N>" where N is the count.
  const confirmation = String(fd.get('confirmation_text') ?? '').trim()
  const expected = `delete ${leadIds.length}`
  if (confirmation !== expected) {
    return {
      status: 'error',
      error: `Confirmation must be "${expected}" (got "${confirmation}").`,
    }
  }

  const access = await requireLeadsAccess(leadIds)
  if (!access.ok) return { status: 'error', error: access.error }

  const svc = createServiceClient()

  // Best-effort screenshot cleanup — both lead-level and per-s-tag.
  const { data: leadShots } = await svc
    .from('google_lead_gen_table')
    .select('screenshot_content_link')
    .in('id', leadIds)
    .not('screenshot_content_link', 'is', null)
  const { data: stagShots } = await svc
    .from('s_tags_table')
    .select('screenshot_path')
    .in('lead_id', leadIds)
    .not('screenshot_path', 'is', null)
  const paths = [
    ...((leadShots ?? []) as { screenshot_content_link: string }[]).map(
      r => r.screenshot_content_link,
    ),
    ...((stagShots ?? []) as { screenshot_path: string }[]).map(r => r.screenshot_path),
  ].filter(p => typeof p === 'string' && p.length > 0)
  if (paths.length > 0) {
    try {
      await svc.storage.from('lead-screenshots').remove(paths)
    } catch {
      /* best-effort */
    }
  }

  const { data, error } = await svc.rpc('delete_leads_cascade', { p_lead_ids: leadIds })
  if (error) return { status: 'error', error: safeError(error, 'Failed to delete leads.') }
  const deleted = typeof data === 'number' ? data : 0

  await logActivity({
    action: 'leads.delete',
    entity_type: 'leads_bulk',
    details: { requested: leadIds.length, deleted, screenshots_deleted: paths.length },
  })

  revalidatePath('/leads')
  revalidatePath('/scrape', 'layout')
  return {
    status: 'ok',
    message: `Deleted ${deleted} lead${deleted === 1 ? '' : 's'} and all their enrichment data.`,
  }
}

/**
 * Bulk "Mark Not Relevant" — hides the selected leads from /leads and
 * stamps who marked them + when. Mirrors deleteLeads for the
 * parse/auth/revalidate shape and setNotRelevantAction for the columns
 * written. Reversible per-row from the detail drawer.
 */
export async function bulkSetNotRelevantAction(
  _prev: BulkActionState,
  fd: FormData,
): Promise<BulkActionState> {
  const leadIds = parseLeadIds(fd)
  if (leadIds.length === 0) {
    return { status: 'error', error: 'No leads selected.' }
  }

  const access = await requireLeadsAccess(leadIds)
  if (!access.ok) return { status: 'error', error: access.error }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'error', error: 'Not signed in.' }

  const svc = createServiceClient()
  // Resolve a friendly attribution string — display_name → username → email.
  const { data: profileRow } = await svc
    .from('user_profiles')
    .select('username, display_name')
    .eq('id', user.id)
    .maybeSingle()
  const profile = profileRow as { username: string | null; display_name: string | null } | null
  const markedBy = profile?.display_name ?? profile?.username ?? user.email ?? user.id

  const { error: updErr } = await svc
    .from('google_lead_gen_table')
    .update({
      is_not_relevant: true,
      not_relevant_marked_at: new Date().toISOString(),
      not_relevant_marked_by: markedBy,
    })
    .in('id', leadIds)
  if (updErr) return { status: 'error', error: safeError(updErr, 'Failed to update leads.') }

  await logActivity({
    action: 'leads.mark_not_relevant',
    entity_type: 'leads_bulk',
    details: { requested: leadIds.length, marked_by: markedBy },
  })

  revalidatePath('/leads')
  revalidatePath('/scrape', 'layout')
  return {
    status: 'ok',
    message: `Marked ${leadIds.length} lead${leadIds.length === 1 ? '' : 's'} not relevant.`,
  }
}

/**
 * S-tag verification = "has the duplicate-check run on this lead's tags?"
 * Uses s_tags_checked_at as the flag. `yes` sets the timestamp to now
 * (marking it manually verified), `no`/`clear` nulls it.
 */
export async function setStagVerifiedLabel(formData: FormData): Promise<void> {
  const leadId = Number(formData.get('lead_id'))
  const value = String(formData.get('value') ?? '')
  if (!Number.isInteger(leadId) || leadId <= 0) throw new Error('Missing lead id.')
  if (!BOOL_VALUES.has(value)) throw new Error(`Invalid value: ${value}`)

  const access = await requireLeadAccess(leadId)
  if (!access.ok) throw new Error(access.error)

  const svc = createServiceClient()
  const now = new Date().toISOString()
  const patch: Record<string, unknown> =
    value === 'clear'
      ? { s_tags_checked_at: null }
      : value === 'yes'
        ? { s_tags_checked_at: now }
        : { s_tags_checked_at: null } // 'no' = mark as not-verified

  const { error } = await svc
    .from('google_lead_gen_table')
    .update(patch)
    .eq('id', leadId)
  if (error) throw new Error(safeError(error, 'Failed to save verification.'))

  await logActivity({
    action: 'override.stag_verified',
    entity_type: 'lead',
    entity_id: leadId,
    details: { value },
  })

  revalidatePath('/leads')
  revalidatePath('/scrape', 'layout')
}
