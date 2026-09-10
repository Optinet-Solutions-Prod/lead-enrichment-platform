'use client'

import { useActionState } from 'react'
import { createOrganizationAction, type CreateOrgState } from '../actions'

const initialState: CreateOrgState = null

export function CreateOrgForm() {
  const [state, formAction, pending] = useActionState(createOrganizationAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[12px] text-[color:var(--color-text-secondary)]">
        Organization name
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          placeholder="Acme Outbound"
          className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] px-3 py-2 text-[13px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-secondary)] focus:border-[color:var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[12px] text-[color:var(--color-text-secondary)]">
          What are you here for?
        </legend>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[color:var(--color-border)] p-3 hover:bg-[color:var(--color-bg-secondary)]">
          <input type="radio" name="vertical" value="property" defaultChecked className="mt-0.5" />
          <span>
            <span className="block text-[13px] font-medium text-[color:var(--color-text-primary)]">
              Property owner leads
            </span>
            <span className="block text-[12px] text-[color:var(--color-text-secondary)]">
              Find property owners, cross-match Airbnb, win management clients.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[color:var(--color-border)] p-3 hover:bg-[color:var(--color-bg-secondary)]">
          <input type="radio" name="vertical" value="affiliate" className="mt-0.5" />
          <span>
            <span className="block text-[13px] font-medium text-[color:var(--color-text-primary)]">
              Affiliate scraping
            </span>
            <span className="block text-[12px] text-[color:var(--color-text-secondary)]">
              Search-result scraping, lead enrichment and checkpoint tooling.
            </span>
          </span>
        </label>
      </fieldset>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-[color:var(--color-accent)] px-3 py-2 text-[13px] font-medium text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-accent-hover)] disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create organization'}
      </button>
    </form>
  )
}
