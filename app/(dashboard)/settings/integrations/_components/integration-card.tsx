'use client'

import { useActionState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react'
import {
  disconnectIntegrationAction,
  saveAndTestIntegrationAction,
  type IntegrationActionState,
} from '../actions'

const initialState: IntegrationActionState = null

export type FieldView = {
  key: string
  label: string
  type: 'secret' | 'text'
  required: boolean
  placeholder: string | null
  /** Current saved value: full for text fields, masked hint for secrets. */
  savedDisplay: string | null
  hasSaved: boolean
}

type Props = {
  provider: string
  name: string
  category: string | null
  description: string | null
  docsUrl: string | null
  status: 'unconfigured' | 'unverified' | 'connected' | 'error'
  statusDetail: string | null
  fields: FieldView[]
  canManage: boolean
}

function StatusBadge({ status, detail }: { status: Props['status']; detail: string | null }) {
  if (status === 'connected') {
    return (
      <span
        title={detail ?? undefined}
        className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800"
      >
        <CheckCircle2 className="h-3 w-3" />
        {detail ?? 'Connected'}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span
        title={detail ?? undefined}
        className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800"
      >
        <XCircle className="h-3 w-3" />
        Connection failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-secondary)]">
      {status === 'unverified' ? 'Saved, untested' : 'Not connected'}
    </span>
  )
}

export function IntegrationCard({
  provider,
  name,
  category,
  description,
  docsUrl,
  status,
  statusDetail,
  fields,
  canManage,
}: Props) {
  const [state, formAction, pending] = useActionState(saveAndTestIntegrationAction, initialState)
  const [delState, delAction, delPending] = useActionState(
    disconnectIntegrationAction,
    initialState,
  )
  const mine = state?.provider === provider ? state : null
  const delMine = delState?.provider === provider ? delState : null

  return (
    <section className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
            {name}
          </h2>
          {category && (
            <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              {category}
            </span>
          )}
        </div>
        <StatusBadge status={status} detail={statusDetail} />
      </div>

      {description && (
        <p className="mt-1 max-w-2xl text-[12px] text-[color:var(--color-text-secondary)]">
          {description}
        </p>
      )}
      {docsUrl && (
        <a
          href={docsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[12px] text-[color:var(--color-text-secondary)] underline-offset-2 hover:underline"
        >
          Where to find your credentials <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {canManage ? (
        <form action={formAction} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="provider" value={provider} />
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(f => (
              <label
                key={f.key}
                className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]"
              >
                {f.label}
                {f.required ? ' *' : ''}
                <input
                  name={`field_${f.key}`}
                  type={f.type === 'secret' ? 'password' : 'text'}
                  autoComplete="off"
                  defaultValue={f.type === 'secret' ? '' : (f.savedDisplay ?? '')}
                  placeholder={
                    f.type === 'secret' && f.hasSaved
                      ? (f.savedDisplay ?? 'saved — leave blank to keep')
                      : (f.placeholder ?? '')
                  }
                  className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-secondary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pending ? 'Testing…' : 'Save & test connection'}
            </button>
            {status !== 'unconfigured' && (
              <button
                type="submit"
                formAction={delAction}
                disabled={delPending}
                className="rounded-md border border-[color:var(--color-border)] px-3 py-2 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                {delPending ? 'Removing…' : 'Disconnect'}
              </button>
            )}
          </div>

          {mine?.ok && (
            <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800">
              {mine.ok}
            </p>
          )}
          {mine?.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{mine.error}</p>
          )}
          {delMine?.ok && (
            <p className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]">
              {delMine.ok}
            </p>
          )}
          {delMine?.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {delMine.error}
            </p>
          )}
        </form>
      ) : (
        <p className="mt-3 text-[12px] text-[color:var(--color-text-secondary)]">
          Only organization owners/admins can manage integrations.
        </p>
      )}
    </section>
  )
}
