'use client'

import { useActionState } from 'react'
import { CheckCircle2, CircleDashed, Loader2, Play, Trash2, XCircle } from 'lucide-react'
import {
  deleteRecipeAction,
  runRecipeAction,
  type RecipeLastRun,
  type RecipeState,
} from '../actions'

const initialState: RecipeState = null

export type RecipeView = {
  id: string
  name: string
  stepLabels: string[]
  keyword: string | null
  cost: number
  lastRun: RecipeLastRun | null
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'ok') return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-700" />
  if (status === 'started') return <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
  return <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-700" />
}

export function RecipeCard({ recipe, showCredits }: { recipe: RecipeView; showCredits: boolean }) {
  const [runState, runAction, running] = useActionState(runRecipeAction, initialState)
  const [delState, delAction, deleting] = useActionState(deleteRecipeAction, initialState)

  const last = recipe.lastRun

  return (
    <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">{recipe.name}</h3>
        {showCredits && (
          <span className="text-[11px] tabular-nums text-[color:var(--color-text-secondary)]">
            {recipe.cost} credit{recipe.cost === 1 ? '' : 's'} per run
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <form action={runAction}>
            <input type="hidden" name="recipe_id" value={recipe.id} />
            <button
              type="submit"
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {running ? 'Running…' : 'Run now'}
            </button>
          </form>
          <form action={delAction}>
            <input type="hidden" name="recipe_id" value={recipe.id} />
            <button
              type="submit"
              disabled={deleting}
              title="Delete workflow"
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1.5 text-[12px] text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </form>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {recipe.stepLabels.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="rounded-full border border-[color:var(--color-border)] px-2.5 py-0.5 text-[11px] text-[color:var(--color-text-secondary)]"
          >
            {i + 1}. {label}
          </span>
        ))}
        {recipe.keyword && (
          <span className="text-[11px] text-[color:var(--color-text-secondary)]">
            keyword: “{recipe.keyword}”
          </span>
        )}
      </div>

      {runState?.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{runState.error}</p>
      )}
      {runState?.ok && (
        <p className="mt-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800">
          {runState.ok}
        </p>
      )}
      {delState?.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{delState.error}</p>
      )}

      {last && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]">
            Last run {new Date(last.at).toLocaleString()} · {last.spent} credit{last.spent === 1 ? '' : 's'}
            {last.crossmatch && ` · cross-match linked ${last.crossmatch.matched}/${last.crossmatch.checked}`}
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-2.5">
            {last.results.map((r, i) => (
              <li key={`${r.source}-${i}`} className="flex items-start gap-2 text-[12px]">
                <StatusIcon status={r.status} />
                <span>
                  <span className="font-medium text-[color:var(--color-text-primary)]">{r.source}</span>{' '}
                  <span className="text-[color:var(--color-text-secondary)]">— {r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
