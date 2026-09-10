'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { saveTourStateAction } from '../_actions/tour'

export const TOUR_VERSION = 1

/** Steps target stable data-tour attributes; anything not present or not
 *  visible on this viewport (e.g. the sidebar on mobile) is filtered out at
 *  start, so the tour degrades gracefully instead of erroring. */
const ALL_STEPS: DriveStep[] = [
  {
    element: '[data-tour="org-switcher"]',
    popover: {
      title: 'Your workspace',
      description:
        'Everything — leads, credits, settings — lives inside an organization. When you belong to more than one, switch here.',
    },
  },
  {
    element: '[data-tour="run-sources"]',
    popover: {
      title: 'Collect data',
      description:
        'Tick the sources you want and hit Scrape. The direct-from-owner sites are the fastest path to owners with a real phone number.',
    },
  },
  {
    element: '[data-tour="credits"]',
    popover: {
      title: 'Credits',
      description:
        'Runs cost credits — your workspace starts with 100 free. The Airbnb crawl costs more because it uses real browser compute.',
    },
  },
  {
    element: '[data-tour="nav-owner-leads"]',
    popover: {
      title: 'Owner Leads',
      description: 'Every owner with contact details lands here — filter, sort, and work the list.',
    },
  },
  {
    element: '[data-tour="nav-workflows"]',
    popover: {
      title: 'Workflows',
      description: 'Save a scrape recipe once — sources, keyword, cross-match — and run it all in one click.',
    },
  },
  {
    element: '[data-tour="nav-billing"]',
    popover: {
      title: 'Billing & Credits',
      description: 'Your balance, the price list, and a ledger of where every credit went.',
    },
  },
  {
    element: '[data-tour="bell"]',
    popover: {
      title: 'Notifications',
      description:
        'Finished runs, low balance and team events appear here. That’s the tour — go collect your pilot batch!',
    },
  },
]

type Props = {
  /** True on the first dashboard visit (no tour_state on the profile). */
  autoStart: boolean
}

export function TourController({ autoStart }: Props) {
  const searchParams = useSearchParams()
  const forced = searchParams.get('tour') === '1'
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current || (!autoStart && !forced)) return
    startedRef.current = true

    // Give the page a beat to paint before measuring highlight targets.
    const timer = setTimeout(() => {
      const steps = ALL_STEPS.filter(s => {
        const el = document.querySelector(s.element as string)
        return el instanceof HTMLElement && el.offsetParent !== null
      })
      if (steps.length === 0) return

      let finished = false
      const d = driver({
        showProgress: true,
        progressText: '{{current}} of {{total}}',
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Done',
        steps,
        onDestroyStarted: () => {
          finished = d.isLastStep()
          d.destroy()
        },
        onDestroyed: () => {
          const fd = new FormData()
          fd.set('status', finished ? 'completed' : 'skipped')
          fd.set('version', String(TOUR_VERSION))
          void saveTourStateAction(fd)
        },
      })
      d.drive()
    }, 600)
    return () => clearTimeout(timer)
  }, [autoStart, forced])

  return null
}
