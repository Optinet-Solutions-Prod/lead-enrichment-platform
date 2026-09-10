import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgContext } from '@/lib/orgs/context'
import { DangerZone } from './_components/danger-zone'
import { InviteForm } from './_components/invite-form'
import { InviteRow } from './_components/invite-row'
import { MemberRow } from './_components/member-row'
import { RenameForm } from './_components/rename-form'

export const dynamic = 'force-dynamic'

type MemberRowData = {
  userId: string
  email: string
  displayName: string | null
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
}

export default async function OrganizationSettingsPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/welcome')

  const isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin'
  const svc = createServiceClient()

  const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
    svc
      .from('org_members')
      .select('user_id, role, joined_at')
      .eq('org_id', ctx.orgId)
      .order('joined_at', { ascending: true }),
    isAdmin
      ? svc
          .from('org_invites')
          .select('id, email, role, expires_at')
          .eq('org_id', ctx.orgId)
          .is('accepted_at', null)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: string; expires_at: string }[] }),
  ])

  const userIds = (memberRows ?? []).map(m => m.user_id)
  const [profilesRes, emails] = await Promise.all([
    userIds.length
      ? svc.from('user_profiles').select('id, display_name, username').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; username: string | null }[] }),
    Promise.all(
      userIds.map(async id => {
        const { data } = await svc.auth.admin.getUserById(id)
        return [id, data.user?.email ?? '—'] as const
      }),
    ),
  ])
  const profileById = new Map(
    (profilesRes.data ?? []).map(p => [p.id, p.display_name || p.username || null]),
  )
  const emailById = new Map(emails)

  const members: MemberRowData[] = (memberRows ?? []).map(m => ({
    userId: m.user_id,
    email: emailById.get(m.user_id) ?? '—',
    displayName: profileById.get(m.user_id) ?? null,
    role: m.role as MemberRowData['role'],
    joinedAt: m.joined_at,
  }))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <header>
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          Organization
        </h1>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          {ctx.orgName} · your role: {ctx.orgRole}
        </p>
      </header>

      {isAdmin && (
        <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
          <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">Name</h2>
          <div className="mt-3">
            <RenameForm currentName={ctx.orgName} />
          </div>
        </section>
      )}

      <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
        <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
          Members ({members.length})
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                <th className="px-3 py-1.5">User</th>
                <th className="px-3 py-1.5">Role</th>
                <th className="px-3 py-1.5">Joined</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <MemberRow
                  key={m.userId}
                  userId={m.userId}
                  email={m.email}
                  displayName={m.displayName}
                  role={m.role}
                  joinedAt={m.joinedAt}
                  canManage={isAdmin}
                  canChangeRole={ctx.orgRole === 'owner'}
                  isSelf={m.userId === ctx.userId}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (
        <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
          <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
            Invites
          </h2>
          <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
            Create a link and share it with your teammate — it&apos;s tied to their email and
            expires after 14 days.
          </p>
          <div className="mt-3">
            <InviteForm />
          </div>
          {(inviteRows ?? []).length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                    <th className="px-3 py-1.5">Pending invite</th>
                    <th className="px-3 py-1.5">Role</th>
                    <th className="px-3 py-1.5">Expires</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {(inviteRows ?? []).map(i => (
                    <InviteRow
                      key={i.id}
                      inviteId={i.id}
                      email={i.email}
                      role={i.role}
                      expiresAt={i.expires_at}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <DangerZone
        orgName={ctx.orgName}
        isOwner={ctx.orgRole === 'owner'}
        targets={members
          .filter(m => m.userId !== ctx.userId)
          .map(m => ({ userId: m.userId, label: m.displayName || m.email }))}
      />
    </div>
  )
}
