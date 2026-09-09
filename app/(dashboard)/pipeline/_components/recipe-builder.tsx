'use client'

import { useActionState, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { saveRecipeAction, type RecipeState } from '../actions'

const initialState: RecipeState = null

export type StepOption = {
  key: string
  label: string
  cost: number
  hint: string
  usesKeyword?: boolean
}

export function RecipeBuilder({ steps }: { steps: StepOption[] }) {
  const [state, formAction, pending] = useActionState(saveRecipeAction, initialState)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [crossmatch, setCrossmatch] = useState(false)

  const toggle = (key: string, on: boolean) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const cost = [...selected].reduce(
    (sum, k) => sum + (steps.find(s => s.key === k)?.cost ?? 1),
    0,
  )
  const keywordOn = steps.some(s => s.usesKeyword && selected.has(s.key))

  return (
    <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
      <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
        Build a workflow
      </h2>
      <form action={formAction} className="mt-3 flex flex-col gap-3">
        <label className="flex max-w-sm flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
          Name
          <input
            type="text"
            name="name"
            required
            minLength={2}
            maxLength={60}
            placeholder="e.g. Monday owner refresh"
            className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
          />
        </label>

        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--color-text-secondary)]">
            Scrape steps
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {steps.map(s => (
              <label
                key={s.key}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-[color:var(--color-border)] p-3 hover:bg-[color:var(--color-bg-secondary)]"
              >
                <input
                  type="checkbox"
                  name="sources"
                  value={s.key}
                  onChange={e => toggle(s.key, e.currentTarget.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
                    {s.label}{' '}
                    <span className="text-[11px] font-normal text-[color:var(--color-text-secondary)]">
                      · {s.cost} credit{s.cost > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="block text-[12px] text-[color:var(--color-text-secondary)]">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {keywordOn && (
          <label className="flex max-w-sm flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
            Maltapark keyword
            <input
              type="text"
              name="keyword"
              defaultValue="apartment for rent"
              className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
            />
          </label>
        )}

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[color:var(--color-border)] p-3 hover:bg-[color:var(--color-bg-secondary)]">
          <input
            type="checkbox"
            name="crossmatch"
            checked={crossmatch}
            onChange={e => setCrossmatch(e.currentTarget.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
              Finish with the Airbnb cross-match{' '}
              <span className="text-[11px] font-normal text-[color:var(--color-text-secondary)]">· free</span>
            </span>
            <span className="block text-[12px] text-[color:var(--color-text-secondary)]">
              Links new Owner Leads to Airbnb listings by first name + locality (candidates to verify).
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {pending ? 'Saving…' : 'Save workflow'}
          </button>
          <span className="text-[12px] tabular-nums text-[color:var(--color-text-secondary)]">
            Runs will cost {cost} credit{cost === 1 ? '' : 's'}
          </span>
        </div>

        {state?.ok && (
          <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800">
            {state.ok}
          </p>
        )}
        {state?.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{state.error}</p>
        )}
      </form>
    </section>
  )
}
