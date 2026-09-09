import { redirect } from 'next/navigation'
import { getCatalog } from '@/lib/integrations/catalog'
import { listOrgIntegrations } from '@/lib/integrations/store'
import { getOrgContext } from '@/lib/orgs/context'
import { IntegrationCard, type FieldView } from './_components/integration-card'

export const dynamic = 'force-dynamic'

function last4(v: string): string {
  return v.length <= 4 ? '••••' : `••••${v.slice(-4)}`
}

export default async function IntegrationsPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/welcome')
  const canManage = ctx.orgRole === 'owner' || ctx.orgRole === 'admin'

  const catalog = getCatalog()
  const rows = await listOrgIntegrations(ctx.orgId)
  const byProvider = new Map(rows.map(r => [r.provider, r]))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">
          Integrations
        </h1>
        <p className="mt-1 max-w-2xl text-[12px] text-[color:var(--color-text-secondary)]">
          Connect third-party accounts to <strong className="text-[color:var(--color-text-primary)]">{ctx.orgName}</strong>.
          Credentials are stored per-organization, never shown again after saving, and only
          used server-side. Fill in the fields, hit <em>Save &amp; test</em> — once the
          connection check passes, the tools that need it use YOUR account automatically.
        </p>
      </header>

      {catalog.map(def => {
        const row = byProvider.get(def.key)
        const fields: FieldView[] = def.fields.map(f => {
          const saved = row?.config[f.key]
          return {
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required ?? false,
            placeholder: f.placeholder ?? f.default ?? null,
            savedDisplay: saved ? (f.type === 'secret' ? last4(saved) : saved) : null,
            hasSaved: Boolean(saved),
          }
        })
        const status = row
          ? row.status === 'connected'
            ? 'connected'
            : row.status === 'error'
              ? 'error'
              : 'unverified'
          : 'unconfigured'
        const statusDetail =
          row?.status === 'connected'
            ? row.tested_value
              ? `Connected as ${row.tested_value}`
              : 'Connected'
            : (row?.last_error ?? null)
        return (
          <IntegrationCard
            key={def.key}
            provider={def.key}
            name={def.name}
            category={def.category ?? null}
            description={def.description ?? null}
            docsUrl={def.docs_url ?? null}
            status={status}
            statusDetail={statusDetail}
            fields={fields}
            canManage={canManage}
          />
        )
      })}

      <p className="text-[12px] text-[color:var(--color-text-secondary)]">
        Need another integration? They&apos;re defined one at a time in{' '}
        <code className="rounded bg-[color:var(--color-bg-secondary)] px-1">
          lib/integrations/catalog.yaml
        </code>{' '}
        — a new block there (name, fields, connection test) is all it takes.
      </p>
    </div>
  )
}
