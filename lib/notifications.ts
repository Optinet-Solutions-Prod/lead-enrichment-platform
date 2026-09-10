import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * In-app notifications (the bell). Emits fan out one row per org member so
 * read-state is per person. No external service, no websockets: the layout
 * fetches the unread count + latest items server-side on every navigation.
 */

export type NotificationInput = {
  kind: string
  title: string
  body?: string
  href?: string
}

export type NotificationRow = {
  id: number
  kind: string
  title: string
  body: string | null
  href: string | null
  created_at: string
  read_at: string | null
}

/** Notify every member of an org. Fire-and-forget from actions — a failed
 *  notification must never fail the operation it narrates. */
export async function notifyOrg(orgId: string, n: NotificationInput): Promise<void> {
  try {
    const svc = createServiceClient()
    const { data: members } = await svc
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId)
    const rows = ((members ?? []) as { user_id: string }[]).map(m => ({
      org_id: orgId,
      user_id: m.user_id,
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      href: n.href ?? null,
    }))
    if (rows.length > 0) await svc.from('notifications').insert(rows)
  } catch {
    // swallow — see docstring
  }
}

export async function notifyUser(orgId: string, userId: string, n: NotificationInput): Promise<void> {
  try {
    const svc = createServiceClient()
    await svc.from('notifications').insert({
      org_id: orgId,
      user_id: userId,
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      href: n.href ?? null,
    })
  } catch {
    // swallow
  }
}

export async function listNotifications(userId: string, limit = 20): Promise<NotificationRow[]> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('notifications')
    .select('id, kind, title, body, href, created_at, read_at')
    .eq('user_id', userId)
    .order('id', { ascending: false })
    .limit(limit)
  return (data ?? []) as NotificationRow[]
}

export async function unreadCount(userId: string): Promise<number> {
  const svc = createServiceClient()
  const { count } = await svc
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  return count ?? 0
}

export async function markAllRead(userId: string): Promise<void> {
  const svc = createServiceClient()
  await svc
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
}
