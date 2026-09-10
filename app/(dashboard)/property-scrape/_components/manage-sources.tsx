'use client'

import { useActionState } from 'react'
import { Download, FileUp, Loader2, Trash2 } from 'lucide-react'
import {
  removeSourceDefAction,
  uploadSourceYamlAction,
  type SourceManageState,
} from '../actions'

const initialState: SourceManageState = null

export type ManagedSource = { key: string; name: string; description: string | null }

type Props = {
  /** The template YAML, rendered inline so the format is visible in the UI. */
  templateYaml: string
  sources: ManagedSource[]
  canManage: boolean
}

export function ManageSources({ templateYaml, sources, canManage }: Props) {
  const [state, formAction, pending] = useActionState(uploadSourceYamlAction, initialState)
  const [removeState, removeAction, removePending] = useActionState(
    removeSourceDefAction,
    initialState,
  )

  return (
    <section className="rounded-lg border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
      <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
        Add your own source (YAML)
      </h2>
      <p className="mt-1 max-w-2xl text-[12px] text-[color:var(--color-text-secondary)]">
        Have a JSON API that lists properties? Describe it in YAML — the endpoint plus which
        fields hold the listing link, owner name and phone — upload it, and it becomes a
        source you can tick above (and use in Workflows). Runs merge into Owner Leads like
        the built-ins.
      </p>

      {canManage ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href="/property-scrape/source-template"
            download
            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-border)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-bg-secondary)]"
          >
            <Download className="h-3.5 w-3.5" />
            Download template
          </a>

          <form action={formAction} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input
              type="file"
              name="yaml_file"
              accept=".yaml,.yml,text/yaml"
              required
              className="w-full text-[12px] text-[color:var(--color-text-secondary)] file:mr-2 file:rounded-md file:border file:border-[color:var(--color-border)] file:bg-[color:var(--color-bg-primary)] file:px-2 file:py-1.5 file:text-[12px] file:text-[color:var(--color-text-primary)] sm:w-auto sm:max-w-60"
            />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
              {pending ? 'Uploading…' : 'Upload'}
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-[color:var(--color-text-secondary)]">
          Ask an organization admin to add or change custom sources.
        </p>
      )}

      {state?.ok && (
        <p className="mt-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800">
          {state.ok}
        </p>
      )}
      {state?.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{state.error}</p>
      )}

      {sources.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {sources.map(s => (
            <li
              key={s.key}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--color-border)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
                  {s.name}{' '}
                  <code className="rounded bg-[color:var(--color-bg-secondary)] px-1 text-[11px] text-[color:var(--color-text-secondary)]">
                    {s.key}
                  </code>
                </p>
                {s.description && (
                  <p className="truncate text-[12px] text-[color:var(--color-text-secondary)]">
                    {s.description}
                  </p>
                )}
              </div>
              <a
                href={`/property-scrape/source-export?key=${encodeURIComponent(s.key)}`}
                download
                className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border)] px-2.5 py-1.5 text-[12px] text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-secondary)]"
              >
                <Download className="h-3 w-3" />
                YAML
              </a>
              {canManage && (
                <form action={removeAction}>
                  <input type="hidden" name="key" value={s.key} />
                  <button
                    type="submit"
                    disabled={removePending}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1.5 text-[12px] text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {removeState?.ok && (
        <p className="mt-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800">
          {removeState.ok}
        </p>
      )}
      {removeState?.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {removeState.error}
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] font-medium text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]">
          View the YAML format
        </summary>
        <div className="mt-2 overflow-x-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
          <pre className="min-w-[560px] whitespace-pre p-3 text-[11px] leading-relaxed text-[color:var(--color-text-primary)]">
            {templateYaml}
          </pre>
        </div>
      </details>
    </section>
  )
}
