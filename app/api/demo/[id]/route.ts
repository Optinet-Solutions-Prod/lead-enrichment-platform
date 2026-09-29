import { after, type NextRequest } from 'next/server'
import { advanceDemoRun, loadDemoRun } from '@/lib/demo/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Poll a demo run. The current state goes back immediately; the work that
 * moves the run forward (checking Google, opening and judging the next few
 * sites) runs after the response, so the visitor's page updates every few
 * seconds instead of hanging on a long request. A run-level lock keeps two
 * polls from doing the same work twice.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return Response.json({ error: 'not found' }, { status: 404 })
  const run = await loadDemoRun(id)
  if (!run) return Response.json({ error: 'not found' }, { status: 404 })
  if (run.status === 'searching' || run.status === 'enriching') {
    after(async () => {
      try {
        await advanceDemoRun(id)
      } catch (e) {
        console.error('[demo] advance failed', id, e instanceof Error ? e.message : e)
      }
    })
  }
  return Response.json(run, { headers: { 'Cache-Control': 'no-store' } })
}
