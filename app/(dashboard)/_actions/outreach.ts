'use server'

import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/activity-log'
import { getOrgContext } from '@/lib/orgs/context'
import { isOutreachStatus } from '@/lib/outreach'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * One outreach record for both lead objects: property_leads (org-scoped) and
 * website_profiles (partner sites). Status, follow-up date and note travel
 * together in every submit so a change to one never clears another.
 */
export type OutreachState = { ok?: string; error?: string } | null

export async function setOutreachAction(_prev: OutreachState, fd: FormData): Promise<OutreachState> {
  const ctx = await getOrgContext()
  if (!ctx) return { error: 'No organization — sign in first.' }

  const kind = String(fd.get('kind') ?? '')
  const id = Number(fd.get('id'))
  const status = String(fd.get('status') ?? '')
  const followRaw = String(fd.get('next_follow_up_at') ?? '').trim()
  const note = String(fd.get('note') ?? '').trim().slice(0, 2000)

  if ((kind !== 'lead' && kind !== 'website') || !Number.isInteger(id) || id <= 0) {
    return { error: 'Bad request.' }
  }
  if (!isOutreachStatus(status)) return { error: 'Pick a valid status.' }
  if (followRaw && !/^\d{4}-\d{2}-\d{2}$/.test(followRaw)) return { error: 'Follow-up must be a date.' }
  const nextFollowUp = followRaw || null

  const svc = createServiceClient()
  const table = kind === 'lead' ? 'property_leads' : 'website_profiles'

  let current = svc.from(table).select('id, contacted_at').eq('id', id)
  if (kind === 'lead') current = current.eq('org_id', ctx.orgId)
  const { data: row } = await current.maybeSingle()
  if (!row) return { error: 'Not found.' }

  const now = new Date().toISOString()
  const startsContact = status !== 'new'
  const update: Record<string, unknown> = {
    outreach_status: status,
    next_follow_up_at: nextFollowUp,
    outreach_note: note || null,
    outreach_updated_at: now,
    outreach_updated_by: ctx.email ?? ctx.userId,
    // First move off "new" stamps the contact time; later edits keep it.
    ...(startsContact && !(row as { contacted_at: string | null }).contacted_at ? { contacted_at: now } : {}),
    ...(status === 'new' ? { contacted_at: null } : {}),
  }
  let q = svc.from(table).update(update).eq('id', id)
  if (kind === 'lead') q = q.eq('org_id', ctx.orgId)
  const { error } = await q
  if (error) return { error: error.message }

  await logActivity({
    action: 'outreach.update',
    entity_type: kind === 'lead' ? 'property_lead' : 'website',
    details: { id, status, next_follow_up_at: nextFollowUp, has_note: Boolean(note) },
  })

  if (kind === 'lead') {
    revalidatePath('/property-leads')
    revalidatePath('/property-scrape')
  } else {
    revalidatePath('/websites/[domain]', 'page')
    revalidatePath('/affiliates')
  }
  return { ok: 'Saved.' }
}
