'use client'

import { useActionState, useState } from 'react'
import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react'
import {
  ingestAirbnbAction,
  runPropertyScrapeAction,
  type RunState,
  type SourceResult,
} from '../actions'

const initialState: RunState = null

type Source = {
  key: string
  label: string
  blurb: string
  usesKeyword?: boolean
  defaultOn?: boolean
  comingSoon?: boolean
}

/** Grouped by the research plan's source tiers so the form reads as the
 *  strategy, not a random site list. */
const TIERS: Array<{ name: string; hint: string; sources: Source[] }> = [
  {
    name: 'Tier 2 · Direct-from-owner sites',
    hint: 'Owners list without an agent, so name + phone sit in the listing. Fastest path to contactable leads — feeds Owner Leads.',
    sources: [
      {
        key: 'homesinmalta',
        label: 'HomesInMalta',
        blurb: 'Owner name + mobile on every listing. Checks the 30 newest.',
        defaultOn: true,
      },
      {
        key: 'propertiesfromowner',
        label: 'PropertiesFromOwner',
        blurb: 'Every active listing with the owner’s mobile, one API call.',
        defaultOn: true,
      },
      {
        key: 'directfromowner',
        label: 'DirectFromOwner.eu',
        blurb: 'In the research plan — scraper not built yet.',
        comingSoon: true,
      },
      {
        key: 'darscover',
        label: 'Darscover (by owner)',
        blurb: 'In the research plan — scraper not built yet.',
        comingSoon: true,
      },
    ],
  },
  {
    name: 'Tier 3 · Maltapark classifieds',
    hint: 'Malta’s biggest classifieds. Phones are login-gated, but sellers often write them in the ad text — we mine those. Feeds Owner Leads.',
    sources: [
      {
        key: 'maltapark',
        label: 'Maltapark keyword search',
        blurb: 'Top 10 results for your keyword; phones mined from ad text.',
        usesKeyword: true,
      },
    ],
  },
  {
    name: 'Tier 1 · Official licence register',
    hint: 'The MTA register of every legal short-let. Highest-quality target list (each address IS a short-let operator) but address-only — outreach by mail or after enrichment. Feeds Short-Let Register.',
    sources: [
      {
        key: 'mta',
        label: 'MTA licence register refresh',
        blurb: 'Re-downloads the full official register (Malta + Gozo, ~8,300 premises).',
      },
    ],
  },
  {
    name: 'Market scan · Airbnb',
    hint: 'Live Airbnb inventory for Malta + Gozo via a real-browser crawl. Feeds Airbnb Listings, and PM Prospects recomputes from it.',
    sources: [
      {
        key: 'airbnb',
        label: 'Airbnb (via Apify)',
        blurb: 'Starts a ~300-listing crawl on Apify (~$1); ingest it below when it finishes.',
      },
    ],
  },
]

function ResultRow({ r }: { r: SourceResult }) {
  const Icon =
    r.status === 'ok' ? CheckCircle2 : r.status === 'started' ? CircleDashed : XCircle
  const color =
    r.status === 'ok'
      ? 'text-green-700'
      : r.status === 'started'
        ? 'text-amber-700'
        : 'text-red-700'
  return (
    <li className="flex items-start gap-2 text-[13px]">
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
      <span>
        <span className="font-medium text-[color:var(--color-text-primary)]">{r.source}</span>{' '}
        <span className="text-[color:var(--color-text-secondary)]">— {r.detail}</span>
      </span>
    </li>
  )
}

export function RunForm() {
  const [state, formAction, pending] = useActionState(runPropertyScrapeAction, initialState)
  const [ingestState, ingestAction, ingestPending] = useActionState(
    async (prev: RunState) => ingestAirbnbAction(prev),
    initialState,
  )
  const [maltaparkOn, setMaltaparkOn] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {TIERS.map(tier => (
          <fieldset
            key={tier.name}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-3"
          >
            <legend className="px-1 text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              {tier.name}
            </legend>
            <p className="mb-2 text-[12px] text-[color:var(--color-text-secondary)]">
              {tier.hint}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {tier.sources.map(s => (
                <label
                  key={s.key}
                  className={[
                    'flex items-start gap-2 rounded-lg border border-[color:var(--color-border)] p-3',
                    s.comingSoon
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer bg-[color:var(--color-bg-primary)] hover:bg-[color:var(--color-bg-secondary)]',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    name="sources"
                    value={s.key}
                    defaultChecked={s.defaultOn}
                    disabled={s.comingSoon}
                    onChange={
                      s.usesKeyword ? e => setMaltaparkOn(e.currentTarget.checked) : undefined
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--color-text-primary)]">
                      {s.label}
                      {s.comingSoon && (
                        <span className="rounded-full border border-[color:var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                          soon
                        </span>
                      )}
                    </span>
                    <span className="block text-[12px] text-[color:var(--color-text-secondary)]">
                      {s.blurb}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {tier.sources.some(s => s.usesKeyword) && (
              <label className="mt-2 flex max-w-sm flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
                Maltapark keyword {maltaparkOn ? '' : '(tick Maltapark to use)'}
                <input
                  type="text"
                  name="keyword"
                  defaultValue="apartment for rent"
                  disabled={!maltaparkOn}
                  className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)] disabled:opacity-50"
                />
              </label>
            )}
          </fieldset>
        ))}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-fit items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? 'Scraping…' : 'Scrape selected sources'}
        </button>

        {state && 'error' in state && state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{state.error}</p>
        )}
        {state && 'results' in state && (
          <ul className="flex flex-col gap-1.5 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-3">
            {state.results.map((r, i) => (
              <ResultRow key={`${r.source}-${i}`} r={r} />
            ))}
          </ul>
        )}
      </form>

      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-3">
        <p className="text-[12px] text-[color:var(--color-text-secondary)]">
          Airbnb runs on Apify’s browser fleet, so it finishes a few minutes after you start
          it. Pull the results in here — Airbnb Listings and PM Prospects update automatically.
        </p>
        <form action={ingestAction} className="mt-2">
          <button
            type="submit"
            disabled={ingestPending}
            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-[13px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-bg-secondary)] disabled:opacity-50"
          >
            {ingestPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {ingestPending ? 'Checking…' : 'Ingest last Airbnb run'}
          </button>
        </form>
        {ingestState && 'error' in ingestState && ingestState.error && (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {ingestState.error}
          </p>
        )}
        {ingestState && 'results' in ingestState && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {ingestState.results.map((r, i) => (
              <ResultRow key={`${r.source}-${i}`} r={r} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
