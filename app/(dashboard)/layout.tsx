import { redirect } from 'next/navigation'
import { listNotifications, unreadCount } from '@/lib/notifications'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgContext } from '@/lib/orgs/context'
import { DashboardShell } from './_components/dashboard-shell'
import { InteractiveBanner } from './_components/interactive-banner'
import { loadProxyBandwidth } from './_lib/dashboard-queries'

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Middleware guarantees the user is signed in before reaching here.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Organization gate: every dashboard page lives inside an org. A signed-in
  // user with no membership yet (fresh signup without an invite) goes to
  // /welcome to create one — /welcome sits outside this layout, so no loop.
  const org = await getOrgContext()
  if (!org) redirect('/welcome')

  // Show the local-part of the email as the username (e.g. "admin" for
  // admin@rooster.local). Keeps the sidebar concise.
  const username = user?.email?.split('@')[0] ?? 'user'

  // Check admin status so the sidebar can conditionally show the
  // /admin/users link. The page itself also re-checks server-side so
  // the conditional nav is purely a UX nicety, not a security gate.
  let isAdmin = false
  if (user?.id) {
    const svc = createServiceClient()
    const { data } = await svc.rpc('is_admin', { p_user_id: user.id })
    isAdmin = data === true
  }

  // Count of unresolved QA feedback so the sidebar can badge the
  // "QA Feedback (Admin)" link — lets admins see from any page that
  // there's something waiting to triage. Admin-only query; skipped for
  // everyone else since they don't see the link.
  let openFeedbackCount = 0
  if (isAdmin) {
    const svc = createServiceClient()
    const { count } = await svc
      .from('qa_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
    openFeedbackCount = count ?? 0
  }

  // Maintenance gate. If the flag is ON and the caller is not an admin,
  // redirect to /maintenance regardless of which dashboard page they hit.
  // Admins keep full access so they can deploy / migrate / debug.
  if (!isAdmin) {
    const svc = createServiceClient()
    const { data: maintRaw } = await svc.rpc('get_system_setting', {
      p_key: 'maintenance_mode',
    })
    if (maintRaw === true) redirect('/maintenance')
  }

  // Proxy bandwidth for the sidebar footer — shows the remaining
  // balance on every page so operators don't have to return to the
  // Dashboard to check it. Shared infra, so safe for all signed-in
  // users (not shadow-filtered).
  // Bell data: fetched on every navigation (no websockets needed) — the
  // dropdown itself is a client component fed from here.
  const [proxyBandwidth, notifUnread, notifItems] = await Promise.all([
    loadProxyBandwidth(),
    unreadCount(org.userId),
    listNotifications(org.userId, 20),
  ])

  return (
    <DashboardShell
      username={username}
      orgName={org.orgName}
      modules={org.modules}
      orgs={org.memberships.map(m => ({ id: m.orgId, name: m.orgName, role: m.role }))}
      activeOrgId={org.orgId}
      isAdmin={isAdmin}
      proxyBandwidth={proxyBandwidth}
      openFeedbackCount={openFeedbackCount}
      notifUnread={notifUnread}
      notifItems={notifItems}
    >
      <InteractiveBanner />
      {children}
    </DashboardShell>
  )
}
