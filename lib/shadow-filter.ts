import 'server-only'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgContext } from '@/lib/orgs/context'

/**
 * Visibility context for the current request: the active workspace, plus
 * shadow-user isolation inside it.
 *
 * Bidirectional isolation:
 *   - non-shadow viewer (default everyone) should NOT see rows that
 *     belong to a shadow account.
 *   - shadow viewer should NOT see rows that belong to anyone else,
 *     even other shadow accounts — each shadow is its own silo.
 *
 * The dashboard uses service-role clients everywhere, so this
 * isolation is application-layer only (RLS would be a nice
 * follow-up). Every list query that surfaces user-attributed data
 * must call applyShadowFilter or one of the table-specific helpers
 * below.
 */
export type ShadowContext = {
  /** Lowercased email of the current viewer; null when anonymous. */
  email: string | null
  /** True when the viewer's user_profiles.is_shadow = true. */
  isShadow: boolean
  /** The viewer's active workspace. Every scrape job and result belongs to
   *  exactly one organization; lists only ever show the active one's. */
  orgId: string | null
}

/** Resolves the current request's shadow context. Cheap — uses the
 *  same in-flight auth.getUser() + a single user_profiles lookup. */
export async function getShadowContext(): Promise<ShadowContext> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { email: null, isShadow: false, orgId: null }

  const svc = createServiceClient()
  const [{ data, error }, org] = await Promise.all([
    svc.rpc('is_shadow_user', { p_user_id: user.id }),
    getOrgContext(),
  ])
  if (error) {
    // FAIL CLOSED. Defaulting a failed shadow check to isShadow=false would
    // treat a shadow user as a normal viewer and leak every non-shadow row
    // to them (isolation breach). Throw so the request surfaces an error
    // instead of silently returning the wrong visibility context.
    console.error('[getShadowContext] is_shadow_user RPC failed:', error.message)
    throw new Error('Could not resolve viewer visibility context')
  }
  return {
    email: (user.email ?? '').toLowerCase() || null,
    isShadow: data === true,
    orgId: org?.orgId ?? null,
  }
}

/**
 * Apply the shadow-visibility filter to a Supabase query builder.
 *
 * Pass the column names that hold the row's owner email and shadow
 * flag respectively. Both default to the canonical scrape_queue /
 * google_lead_gen_table column names.
 *
 * Returns the chained query (call .select().eq() etc. before AND
 * after).
 */
export function applyShadowFilter<Q extends QueryWithFilters>(
  query: Q,
  ctx: ShadowContext,
  opts?: {
    /** Owner-email column on this table. Default: 'created_by_email'. */
    emailColumn?: string
    /** Shadow-flag column on this table. Default: 'created_by_is_shadow'. */
    shadowColumn?: string
    /** Organization column on this table. Default: 'org_id'. */
    orgColumn?: string
  },
): Q {
  const emailColumn = opts?.emailColumn ?? 'created_by_email'
  const shadowColumn = opts?.shadowColumn ?? 'created_by_is_shadow'
  // Workspace isolation first. FAIL CLOSED: no active org → nothing matches.
  query = query.eq(opts?.orgColumn ?? 'org_id', ctx.orgId ?? '00000000-0000-0000-0000-000000000000') as Q

  if (ctx.isShadow) {
    // Shadow viewer: only their own rows. The owner-email match is
    // case-insensitive on the application side via toLowerCase() at
    // context creation; Supabase's `eq` is case-sensitive but emails
    // are stored lowercase by the enqueue action so this is fine.
    if (!ctx.email) {
      // Defensive: no email → return a guaranteed-empty result rather
      // than leak everything. Use an impossible value.
      return query.eq(emailColumn, '__shadow_no_email__') as Q
    }
    return query.eq(emailColumn, ctx.email) as Q
  }

  // Non-shadow viewer: everything EXCEPT shadow-owned rows.
  // `eq` with false is what we want; the column default is false, so
  // existing rows from before the migration also pass.
  return query.eq(shadowColumn, false) as Q
}

/**
 * Minimal interface the helper needs from a Supabase query builder.
 * Using a structural type means we can apply the same helper to any
 * builder shape (.from(...).select(...), .rpc(...), etc.) without
 * importing Supabase's generic type machinery.
 */
type QueryWithFilters = {
  eq: (column: string, value: unknown) => unknown
}
