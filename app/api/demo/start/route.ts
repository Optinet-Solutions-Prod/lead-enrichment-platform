import type { NextRequest } from 'next/server'
import { hashIp, startDemoRun } from '@/lib/demo/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Start a landing-page demo scrape. Public; rate-limited per visitor and per day. */
export async function POST(request: NextRequest) {
  let body: { keyword?: unknown; country?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Send a keyword and a country.' }, { status: 400 })
  }
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  const result = await startDemoRun({ keyword: body.keyword, country: body.country, ipHash: hashIp(ip) })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
  return Response.json({ id: result.id }, { headers: { 'Cache-Control': 'no-store' } })
}
