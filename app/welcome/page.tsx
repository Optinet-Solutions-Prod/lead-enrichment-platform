import { redirect } from 'next/navigation'
import { getOrgContext } from '@/lib/orgs/context'
import { CreateOrgForm } from './_components/create-org-form'

/**
 * First-run step for a signed-in user with no organization yet (the
 * dashboard layout redirects here). Users arriving via an invite link never
 * see this — accepting the invite gives them a membership directly.
 */
export default async function WelcomePage() {
  const ctx = await getOrgContext()
  if (ctx) redirect('/property-scrape')

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-bg-secondary)] px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-6 shadow-sm">
        <h1 className="text-[16px] font-semibold text-[color:var(--color-text-primary)]">
          Create your organization
        </h1>
        <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Scrapes, leads, and settings live inside an organization. You&apos;ll be its owner
          and can invite teammates afterwards. Joining someone else&apos;s org instead? Ask
          them for an invite link.
        </p>
        <div className="mt-4">
          <CreateOrgForm />
        </div>
      </div>
    </div>
  )
}
