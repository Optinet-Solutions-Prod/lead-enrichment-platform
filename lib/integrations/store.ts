import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Per-org integration storage. org_integrations has RLS enabled with NO
 * authenticated policies, so every read/write goes through the service role
 * here — secrets never reach the browser. (Vault encryption is the upgrade
 * path; see docs/saas/04-BUILD-PLAN.md §5.)
 */

export type IntegrationRow = {
  org_id: string
  provider: string
  config: Record<string, string>
  status: 'unverified' | 'connected' | 'error'
  tested_value: string | null
  last_error: string | null
  last_tested_at: string | null
}

export async function getOrgIntegration(
  orgId: string,
  provider: string,
): Promise<IntegrationRow | null> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('org_integrations')
    .select('org_id, provider, config, status, tested_value, last_error, last_tested_at')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle()
  return (data as IntegrationRow | null) ?? null
}

export async function listOrgIntegrations(orgId: string): Promise<IntegrationRow[]> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('org_integrations')
    .select('org_id, provider, config, status, tested_value, last_error, last_tested_at')
    .eq('org_id', orgId)
  return (data ?? []) as IntegrationRow[]
}

/** The org's WORKING config for a provider — only when its last test passed. */
export async function getConnectedConfig(
  orgId: string,
  provider: string,
): Promise<Record<string, string> | null> {
  const row = await getOrgIntegration(orgId, provider)
  return row && row.status === 'connected' ? row.config : null
}

export async function upsertOrgIntegration(row: {
  org_id: string
  provider: string
  config: Record<string, string>
  status: IntegrationRow['status']
  tested_value: string | null
  last_error: string | null
  updated_by: string
}): Promise<string | null> {
  const svc = createServiceClient()
  const { error } = await svc.from('org_integrations').upsert({
    ...row,
    last_tested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  return error ? error.message : null
}

export async function deleteOrgIntegration(orgId: string, provider: string): Promise<string | null> {
  const svc = createServiceClient()
  const { error } = await svc
    .from('org_integrations')
    .delete()
    .eq('org_id', orgId)
    .eq('provider', provider)
  return error ? error.message : null
}
