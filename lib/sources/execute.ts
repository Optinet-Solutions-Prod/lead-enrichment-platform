import 'server-only'
import { CREDIT_COSTS } from '@/lib/credits'
import { createServiceClient } from '@/lib/supabase/service'
import { listSourceDefs, runCustomSource } from './custom'
import {
  runHomesInMalta,
  runMaltapark,
  runMtaRegister,
  runPropertiesFromOwner,
  startAirbnb,
} from './runners'

/**
 * One dispatcher for every way a scrape can start (Collect Data form,
 * Pipeline recipes): takes the selected source keys — built-ins plus
 * `custom:<key>` for org-uploaded YAML sources — and runs them in order.
 * Credit costing lives here too so the form and recipes can never disagree
 * on price.
 */

export type SourceResult = {
  source: string
  status: 'ok' | 'error' | 'started' | 'skipped'
  detail: string
}

export function costOfSources(sources: string[]): number {
  let total = 0
  for (const s of sources) {
    if (s === 'airbnb') total += CREDIT_COSTS.airbnb_start
    else if (s === 'mta') total += CREDIT_COSTS.mta_refresh
    else total += CREDIT_COSTS.source_run
  }
  return total
}

export async function executeSources(
  orgId: string,
  sources: string[],
  keyword: string,
): Promise<SourceResult[]> {
  const svc = createServiceClient()
  const results: SourceResult[] = []
  const run = async (source: string, fn: () => Promise<string>, started = false) => {
    try {
      const detail = await fn()
      results.push({ source, status: started ? 'started' : 'ok', detail })
    } catch (e) {
      results.push({ source, status: 'error', detail: (e as Error).message })
    }
  }

  if (sources.includes('homesinmalta')) await run('homesinmalta.com', () => runHomesInMalta(svc, orgId))
  if (sources.includes('propertiesfromowner'))
    await run('propertiesfromowner.com', () => runPropertiesFromOwner(svc, orgId))
  if (sources.includes('maltapark')) await run('maltapark.com', () => runMaltapark(svc, orgId, keyword))
  if (sources.includes('mta')) await run('mta.com.mt', () => runMtaRegister(svc))
  if (sources.includes('airbnb')) await run('airbnb.com', () => startAirbnb(svc, orgId), true)

  const customKeys = sources.filter(s => s.startsWith('custom:')).map(s => s.slice('custom:'.length))
  if (customKeys.length > 0) {
    const defs = await listSourceDefs(orgId)
    for (const key of customKeys) {
      const row = defs.find(d => d.key === key)
      if (!row) {
        results.push({ source: key, status: 'error', detail: 'custom source no longer exists' })
        continue
      }
      await run(row.definition.name, () => runCustomSource(svc, orgId, row.definition))
    }
  }

  return results
}
