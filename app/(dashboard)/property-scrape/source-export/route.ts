import type { NextRequest } from 'next/server'
import { getOrgContext } from '@/lib/orgs/context'
import { listSourceDefs } from '@/lib/sources/custom'

/** Re-download the YAML an org admin uploaded for a custom source —
 *  exactly as stored, scoped to the caller's active org. */
export async function GET(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return new Response('Not signed in', { status: 401 })

  const key = request.nextUrl.searchParams.get('key') ?? ''
  const def = (await listSourceDefs(ctx.orgId)).find(d => d.key === key)
  if (!def) return new Response('Not found', { status: 404 })

  return new Response(def.raw_yaml, {
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${key}.yaml"`,
      'Cache-Control': 'no-store',
    },
  })
}
