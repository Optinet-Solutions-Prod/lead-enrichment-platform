import type { NextRequest } from 'next/server'
import { advanceDemoRun } from '@/lib/demo/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Poll a demo run. Each call moves it one step forward and returns the
 *  current state, so the visitor's own polling is what drives the work. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return Response.json({ error: 'not found' }, { status: 404 })
  const run = await advanceDemoRun(id)
  if (!run) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json(run, { headers: { 'Cache-Control': 'no-store' } })
}
