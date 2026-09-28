'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

type Props = {
  /** When true, the component ticks the runner and refreshes every `intervalMs`. */
  enabled: boolean
  intervalMs?: number
  /** Drive the in-app scrape runner (/api/scrape/tick) before each refresh.
   *  On for the scrape pages; the runner is what moves a job from pending
   *  to completed here, since no worker fleet is connected. */
  tick?: boolean
}

/**
 * Polls router.refresh() so Server Component data (the jobs table) re-fetches
 * without a full page reload. Only runs when there are pending/running jobs.
 */
export function AutoRefresh({ enabled, intervalMs = 5000, tick = true }: Props) {
  const router = useRouter()
  const inFlight = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    const run = async () => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        if (tick) {
          await fetch('/api/scrape/tick', { method: 'POST', cache: 'no-store' }).catch(() => null)
        }
      } finally {
        inFlight.current = false
      }
      if (!stopped) router.refresh()
    }
    void run()
    const id = setInterval(run, intervalMs)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [enabled, intervalMs, router, tick])

  return null
}
