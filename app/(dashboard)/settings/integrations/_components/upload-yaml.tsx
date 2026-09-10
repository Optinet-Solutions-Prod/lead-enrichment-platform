'use client'

import { useActionState } from 'react'
import { Download, FileUp, Loader2 } from 'lucide-react'
import { uploadIntegrationYamlAction, type IntegrationActionState } from '../actions'

const initialState: IntegrationActionState = null

type Props = {
  /** The template YAML, rendered inline so the format is visible in the UI. */
  templateYaml: string
}

export function UploadYaml({ templateYaml }: Props) {
  const [state, formAction, pending] = useActionState(uploadIntegrationYamlAction, initialState)

  return (
    <section className="rounded-lg border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-4">
      <h2 className="text-[14px] font-medium text-[color:var(--color-text-primary)]">
        Add an integration (YAML)
      </h2>
      <p className="mt-1 max-w-2xl text-[12px] text-[color:var(--color-text-secondary)]">
        Integrations are defined in YAML: a name, the credential fields to ask for, and one
        https request that proves a connection works. Download the template, fill it in,
        upload it — the new card appears below for your organization only.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href="/settings/integrations/template"
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

      {state?.ok && (
        <p className="mt-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800">
          {state.ok}
        </p>
      )}
      {state?.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {state.error}
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
