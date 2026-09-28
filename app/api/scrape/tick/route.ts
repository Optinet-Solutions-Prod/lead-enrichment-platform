import type { NextRequest } from 'next/server'
import { requireBearer } from '@/lib/auth/bearer'
import { runScrapeTick } from '@/lib/scrape/runner'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Drive the in-app scrape runner one step: start ready Google jobs on
 * Apify, ingest finished runs, and work the enrichment queue.
 *
 * Called by the /scrape pages' auto-refresh (any signed-in user — the work
 * is global and idempotent, so who triggers it does not matter) and by
 * schedulers with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(request: NextRequest) {
  const bearer = requireBearer(request.headers.get('authorization'), process.env.CRON_SECRET, {
    secretName: 'CRON_SECRET',
  })
  if (!bearer.ok) {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const report = await runScrapeTick()
  return Response.json(report, { headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
