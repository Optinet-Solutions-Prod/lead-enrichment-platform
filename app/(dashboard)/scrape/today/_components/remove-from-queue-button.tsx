'use client'

import { useActionState, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { cancelScrapeJob, type JobActionState } from '../../actions'

const initial: JobActionState = null

/** Remove a queued scrape that has not started. Confirms inline, then calls
 *  the same cancel action the batch page uses. */
export function RemoveFromQueueButton({ jobId, keyword }: { jobId: string; keyword: string }) {
  const [confirm, setConfirm] = useState(false)
  const [state, action, pending] = useActionState(cancelScrapeJob, initial)

  if (state?.status === 'ok') {
    return <span className="text-[11px] text-emerald-700">Removed</span>
  }
  if (confirm) {
    return (
      <form action={action} className="inline-flex items-center gap-1">
        <input type="hidden" name="job_id" value={jobId} />
        <input type="hidden" name="confirmation_text" value={keyword} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          Remove
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="rounded-md px-2 py-1 text-[11px] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
        >
          Keep
        </button>
        {state?.status === 'error' && <span className="text-[11px] text-red-700">{state.error}</span>}
      </form>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      title={`Remove "${keyword}" from the queue`}
      className="inline-flex items-center gap-1 rounded-md border border-[color:var(--color-border)] px-2 py-1 text-[11px] text-[color:var(--color-text-primary)] hover:border-red-200 hover:bg-red-50 hover:text-red-700"
    >
      <Trash2 className="h-3 w-3" /> Remove
    </button>
  )
}
