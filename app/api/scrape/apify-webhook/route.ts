import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { apifyWebhookKey, syncJobByRunId } from '@/lib/scrape/apify-google'
import { runScrapeTick } from '@/lib/scrape/runner'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Apify calls this when an actor run we started finishes. The URL carries a
 * key derived from CRON_SECRET (see apifyWebhookKey); the run id in the body
 * is only trusted as a lookup — the run's real status is re-read from Apify.
 */
export async function POST(request: NextRequest) {
  const expected = apifyWebhookKey()
  const provided = request.nextUrl.searchParams.get('key') ?? ''
  if (!expected) return Response.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  if (!timingSafeEqual(a, b)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { eventType?: string; resource?: { id?: string }; eventData?: { actorRunId?: string } } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const runId = body.resource?.id ?? body.eventData?.actorRunId ?? ''
  if (!runId) return Response.json({ error: 'no run id' }, { status: 400 })

  const svc = createServiceClient()
  let outcome: string
  try {
    outcome = await syncJobByRunId(svc, runId)
  } catch (e) {
    outcome = `error: ${e instanceof Error ? e.message : String(e)}`
  }
  // Start enrichment straight away so the batch fills in even when nobody
  // has the page open; the page tick continues from here.
  const tick = await runScrapeTick({ enrichRows: 4, enrichDeadlineMs: 20_000 }).catch(e => ({
    error: e instanceof Error ? e.message : String(e),
  }))
  return Response.json({ ok: true, event: body.eventType ?? null, runId, outcome, tick })
}
