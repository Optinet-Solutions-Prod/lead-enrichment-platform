# SaaS Build Plan — Tenancy, Integrations, Sources

> Status: **proposed, pending Chris's review** · Written 2026-09-04, grounded in a full code
> audit (auth, data access, integrations, sources/countries, Monday coupling — findings inline).
> This is the concrete execution plan for Phase 1 of `02-SAAS-PLAN.md`.

---

## 0. Decisions this plan proposes (read this first)

| Question | Recommendation | Why (short) |
|---|---|---|
| Monolith or microservices? | **Modular monolith** — one Next.js app + Postgres, VM workers stay the one satellite | 1–2 person team; the only split that matters (scraping) already exists; microservices would multiply deploy/observability cost with zero tenancy benefit |
| Tenancy model | `organizations` + `org_members` + `org_invites` + `org_settings`; **one org per user in v1** (switcher later) | Simplest model that passes the leakage test; the new DB is empty so there's no backfill — greenfield tenancy |
| Where isolation is enforced | **RLS as the backstop + org-aware RPCs**, migrating the dashboard off the service-role client | Audit found 99% of data access bypasses RLS today; app-layer-only isolation is one missed filter away from a leak |
| Integrations | **BYO API keys per org**, encrypted at rest, verify-on-save, resolved at runtime (org key → pooled key if plan allows → feature off) | Shifts variable cost *and* ToS exposure to the customer; near-zero COGS; standard SaaS pattern (Zapier/Make/Clay all do this) |
| Sources | **Google (Chrome/VM + Apify organic) always on** — the foundation. Bing/YouTube/Twitch/Kick/X/FB/TikTok/Snapchat/Telegram are **per-org opt-in toggles** | Matches the product thesis; each optional source declares the integration it needs |
| Countries | Per-org allowlist in `org_settings`; platform capacity (GoLogin profiles) stays shared with per-org quotas | Country capacity is a finite fleet resource — gate access per org, meter usage |
| Monday.com | **Full removal** (code + 11 DB functions + cron); inventory in §7 | Not part of the SaaS; three pages are already broken because the mirror tables were dropped |
| Roles | `owner` / `admin` / `member` per org, plus a separate **platform_admin** flag (today's `is_admin` becomes staff-only) | Current app has only a global `is_admin` boolean; SaaS needs org-scoped roles and a clean staff/customer split |

---

## 1. What the code audit established (the constraints)

1. **RLS is decorative today.** `createServiceClient()` (bypasses RLS) is imported in 68 files;
   ~570 `.from()` call sites and 90/92 `.rpc()` sites run on it. The session client is used for
   auth only (one data call repo-wide). Only 4 RLS policies exist across 164 migrations.
   Isolation is app-layer (`applyShadowFilter`, `requireAdmin`, `requireLeadAccess`) — a missed
   call is a silent leak. **This is the central thing Phase 1 fixes.**
2. **Auth has no self-signup.** Users are admin-created with synthetic `<username>@rooster.local`
   emails, or JIT-provisioned via the portal SSO. `user_profiles` is boolean flags, no roles.
3. **The integration seam already half-exists.** Two secrets are DB-backed with env-first
   fallback (`apify_api_token`, `twocaptcha_api_key` in `system_settings`, resolved by
   `_resolve_apify_token()` / `_resolve_twocaptcha_key()` on the VM). The per-org vault
   generalizes exactly this pattern. 15+ providers are called in live code; **ScrapingBee is
   not one of them** (legacy n8n only — it's a *future* provider option, not a port).
4. **Engines are one text column** (`scrape_queue.search_engine`, 10 values, CHECK constraint)
   with a central registry already in code (`ENGINE_CONFIGS`, currently at
   `lib/monday/engine-config.ts` — the one Monday-free file in that folder; salvage it to
   `lib/engines.ts`). Google fans out to 2 jobs (Apify organic + VM PPC); Bing is Apify-only;
   social is VM-only.
5. **The country list *is* `gologin_profiles`** (19 rows, one browser profile per country,
   `is_active` flag, `languages[]`). Every domain table FKs to it.
6. **Any gate added only in the enqueue form is bypassable**: the scheduler tick inserts
   `scrape_queue` rows from `scheduled_keyword_items` with no engine/country re-validation.
   → Entitlement enforcement must live in the DB (trigger / RPC), not the UI.
7. **Three pages are broken right now** (they query the dropped Monday mirror tables at load):
   the `/` overview (`daily-report-queries.ts`), `/stag-mapping`, and `/monday-dashboard`.
   The app likely won't demo until §7 step 0 lands.

---

## 2. Architecture answer: modular monolith

**SaaS ≠ microservices.** The tenant boundary lives in the *database*, not in service
boundaries. The shape we keep:

```
┌───────────────────────────┐     ┌──────────────────────────────┐
│  Next.js app (Vercel)     │     │  Supabase Postgres           │
│  UI + server actions +    │────▶│  RLS + org-aware RPCs        │
│  scheduler tick (cron)    │     │  = THE tenancy boundary      │
└───────────────────────────┘     └──────────────▲───────────────┘
                                                 │ service role,
┌───────────────────────────┐                    │ org_id from job
│  VM worker fleet (Phase 2)│────────────────────┘
│  already a separate       │   claims jobs, stamps org_id on results
│  deployable — keep as-is  │   (trigger-enforced, see §4)
└───────────────────────────┘
```

- One repo, one app deploy, one schema. Modules stay folders (`lib/integrations/`,
  `lib/orgs/`, `lib/engines.ts`), not network services.
- The workers are already the only piece that needs independent scaling/isolation, and they're
  already separate processes. That's the entire benefit microservices would have bought.
- Revisit only when a concrete pressure appears (e.g., an outreach sender with its own
  deliverability infra, or per-tenant dedicated fleets). Extraction later is straightforward
  because the DB contract (queue tables + RPCs) is already the interface.

---

## 3. Tenancy schema (Milestone B)

New tables (all timestamps/audit columns implied):

```sql
organizations   (id uuid pk, name, slug unique, plan text default 'pilot',
                 status text default 'active', created_by uuid)
org_members     (org_id fk, user_id fk → auth.users, role text
                 check (role in ('owner','admin','member')), pk (org_id, user_id))
org_invites     (id uuid pk, org_id fk, email citext, role text, token_hash text,
                 invited_by uuid, expires_at, accepted_at, unique (org_id, email))
org_settings    (org_id pk fk, enabled_sources text[] default '{google}',
                 enabled_countries text[] default '{}',   -- empty = all allowed (dev), plan-gated later
                 daily_scrape_cap int, max_concurrent_per_country int)
usage_events    (id bigint pk, org_id fk, kind text, qty int, meta jsonb, created_at)
                 -- scrape_job, lead_enriched, captcha_solve … fuels metering + billing later
```

`org_id uuid not null` (FK → organizations) goes on every per-tenant table. From the audit,
that set is:

- **Core:** `google_lead_gen_table`, `scrape_queue`, `enrichment_fetch_queue`, `s_tags_table`,
  `contact_table`, `interactive_checkpoints`, `enrichment_stage_runs`,
  `scheduled_keyword_sets`, `scheduled_keyword_items`, `qa_feedback`,
  `lead_alert_recipients`, `activity_log`, `fetched_html_cache`.
- **Social results:** all 8 creator tables + their 8 `*_links` tables (they're a tenant's scrape
  output; global dedup/caching is a later optimization).
- **Storage:** `lead-screenshots` bucket paths become `org_id/…` prefixed, with a storage policy.
- **Stays global (readable reference):** `rooster_brands`, `operator_domains_denylist`,
  `batch_counter`, `system_settings` (becomes *platform* settings; org knobs move to
  `org_settings`).
- **Stays platform-infra (no tenant access at all):** `gologin_profiles`,
  `active_profile_locks`, `proxy_bandwidth_snapshots`, `google_login_credentials`.

Because the new project has **zero data**, every `org_id` column ships `NOT NULL` from day
one — no nullable-then-backfill dance. A seed script creates two demo orgs for the leakage test.

**Org context:** a Supabase **custom access token hook** stamps `org_id` and `org_role` into
the JWT at sign-in (single-org v1 keeps this trivial). RLS policies then check the claim —
no per-row membership join. `user_profiles` keeps profile prefs; membership lives in
`org_members`. The shadow-user machinery (`is_shadow`, `applyShadowFilter`, cohort rules in
`require-lead-access.ts`) is **retired** — org isolation supersedes it.

## 3b. Auth changes (invites)

Today: no `signUp` call exists anywhere; synthetic `@rooster.local` emails. For SaaS:

1. Real email + password auth (Supabase native), email confirmation on.
2. **Invite flow:** org admin enters email + role → `org_invites` row (hashed token) → email
   with `/invite/<token>` link → recipient signs up (or in) → server action validates token,
   inserts `org_members`, stamps `accepted_at`. Resend/revoke in the members UI.
3. **First-run flow:** fresh signup with no invite → create-organization screen → becomes `owner`.
4. Keep the portal-SSO callback working (it JIT-provisions by real email already), but it must
   land users in an org — map portal users to a designated org or route them through invites.
5. `is_admin` → rename to **`platform_admin`** (staff). The 34 `requireAdmin()` sites split:
   platform pages (`/admin/system`, ops, fleet) stay staff-only; org-level actions move to
   org-role checks (`requireOrgRole('admin')`).
6. Retire the username→`@rooster.local` mapping for new users; keep parsing it at login so any
   legacy account still works.

---

## 4. Isolation enforcement — the RLS migration (Milestone C, the big one)

Strategy: **make the database the backstop, then walk the app onto it.**

1. **Policies first.** Every per-tenant table gets
   `USING (org_id = (auth.jwt()->>'org_id')::uuid)` for `authenticated` (select/insert/update/
   delete variants), plus `WITH CHECK` on writes. Platform-infra tables get *no* authenticated
   policies (deny by default). Reference tables get read-only policies.
2. **New client:** `lib/supabase/tenant.ts` — the cookie-aware session client, i.e., RLS
   *applies*. Then migrate the dashboard file-by-file off `createServiceClient()` (68 files).
   Most list queries get *simpler*: RLS replaces the manual shadow/ownership filtering.
   `createServiceClient()` survives only for: scheduler tick, bearer-token API routes,
   auth admin operations, and platform-admin pages — each surviving import gets a
   `// service-role justified:` comment, and a lint rule (`no-restricted-imports` scoped to
   `app/(dashboard)`) stops new ones creeping in.
3. **RPCs become org-aware.** The ~45 TS-called functions (148 sites) get one of two shapes:
   - Called from the dashboard → security definer, **derive org internally**
     (`v_org := (auth.jwt()->>'org_id')::uuid`), never trust an org param from the client.
   - Called by workers/cron (service role) → explicit `p_org_id` argument taken **from the
     job row**, not from config.
   Highest-leverage first: `get_system_setting` (20 sites — split platform vs org settings),
   `is_admin` (26 sites — becomes `platform_admin` + org-role checks),
   `claim_scrape_job`, `complete_scrape_job`, `advance_enrichment_chain`,
   `delete_scrape_job_cascade`, `count_user_scrapes_today` (becomes per-org).
4. **Trigger-stamped inheritance.** Results always inherit `org_id` from their parent:
   `google_lead_gen_table.org_id` from `scrape_queue`, `enrichment_fetch_queue` and
   `s_tags_table`/`contact_table` from their lead, checkpoint rows from their job. BEFORE
   INSERT triggers stamp it server-side so a buggy worker *cannot* mislabel tenant data.
   Workers keep service-role but only ever pass through job ids.
5. **The acceptance gate — an automated leakage suite.** Seed org A + org B with distinct
   data; run every read surface (each page query, each RPC) authenticated as each org; assert
   zero cross-rows; run every write surface against the other org's ids and assert rejection.
   This suite is CI-blocking from Milestone C onward. **Phase 1 is done when this passes, not
   before.**

---

## 5. Integrations — per-org BYO API keys (Milestone D)

How this works in a SaaS (the pattern the user asked about), mapped onto what exists:

### Data model

```sql
org_integrations (
  org_id uuid fk, provider text,            -- 'apify' | 'twocaptcha' | 'hunter' | 'openai' | …
  credentials jsonb,                        -- encrypted at rest (below), shape per provider
  status text default 'unverified',         -- unverified | active | error
  last_verified_at timestamptz, last_error text,
  created_by uuid, updated_at timestamptz,
  primary key (org_id, provider)
)
```

- **Provider registry in code** (`lib/integrations/registry.ts`): slug, display name, category,
  credential fields + validation, `verify()` adapter, and **what it unlocks** (see table).
- **Encryption:** Supabase Vault (pgsodium) — ciphertext in the table, decryption only via a
  `security definer` function `get_org_integration_secret(p_org, p_provider)` with EXECUTE
  revoked from everyone except `service_role`. No key-distribution problem for the VM workers
  (they're already service-role). Upgrade path later: app-layer envelope encryption
  (AES-256-GCM, key in Vercel env) if we want "DB dump alone reveals nothing."
- **Never round-trip to the browser.** Save → verify → store; UI shows provider status +
  last-4 only. Rotating = paste a new key.
- **Verify-on-save:** each adapter makes one cheap authenticated call (Apify `GET /v2/users/me`,
  Hunter `GET /v2/account`, OpenAI `GET /v1/models`, 2Captcha `getBalance`, …) and stamps
  `status`/`last_error`. A nightly re-verify sweep in the scheduler tick flags dead keys before
  a scrape fails at 2am.

### Runtime resolution (generalizes today's `_resolve_apify_token()`)

```
resolveCredential(org, provider):
  1. org's own verified key            (org_integrations)
  2. platform pooled key, if the org's plan includes it   → metered to usage_events
  3. null → the feature reports "connect <provider> to enable this" instead of erroring
```

Workers resolve per-job: `claim_scrape_job` returns `org_id` → worker calls the secret RPC →
uses that org's key for that job. The VM's `~/.env` keeps only *platform* credentials
(GoLogin fleet, Supabase) — tenant keys never land in a file.

### Provider ↔ capability map (v1)

| Provider | Org-facing? | Unlocks |
|---|---|---|
| Apify | ✅ BYO | Google organic + Bing scraping (near-mandatory — first onboarding step) |
| Hunter.io | ✅ BYO | Contact enrichment (email discovery) |
| OpenAI | ✅ BYO | LLM contact fallback + borderline affiliate classifier |
| 2Captcha | ✅ BYO (optional) | Auto captcha solving on VM scrapes |
| YouTube API key / Twitch client / Kick client | ✅ BYO | Their respective sources |
| Telegram API id+hash, X session | ✅ BYO (advanced, flag as fragile) | Their sources |
| ScrapingBee | ⬜ future option | Alternative HTML-fetch backend for enrichment (not in live code today) |
| GoLogin, Enigma proxy, MyMemory | ❌ platform-owned | Fleet/infra — tenants never see these |

UI: `/settings/integrations` — a card per provider (connect / verify status / what it enables),
gated to org `owner`/`admin`. Features elsewhere read capability state and render their own
"requires Apify — connect it here" empty-states instead of failing.

---

## 6. Sources & countries per org (Milestone E)

- **Registry:** move `ENGINE_CONFIGS` → `lib/engines.ts`; add per-engine metadata:
  `alwaysOn` (google), `requiresIntegration` ('apify' for bing, 'youtube' for youtube, …),
  `runsOn` (vm | apify | both).
- **Google is the foundation:** always in `enabled_sources`, not toggleable off, seeded by
  default. Everything else is opt-in per org.
- **Enforcement in the DB** (because of audit finding #6): a BEFORE INSERT trigger on
  `scrape_queue` validates `search_engine ∈ org_settings.enabled_sources` and
  `country_code ∈ enabled_countries` (or countries empty = unrestricted). The UI reads the same
  settings to render only-enabled options — but the trigger is the actual gate, so the
  scheduler path, reruns, and any future insert path are all covered.
- **Dependency check at toggle time:** enabling Bing without an Apify key → allowed but shown
  as "enabled, waiting on Apify key" (or block — decide in UI review). Scheduler skips jobs
  whose provider resolution returns null, with a visible org-level notice, never a silent stall.
- **Countries:** per-org allowlist; the *platform* still owns capacity
  (`gologin_profiles.is_active`, per-country concurrency). Org-level `max_concurrent_per_country`
  and `daily_scrape_cap` come from `org_settings` (replacing the global
  `daily_scrape_cap_per_user`), with platform-level caps as the outer bound. Plan-gating the
  number of countries is a natural pricing lever (see §8).
- Fix while in there: `SEARCH_ENGINE_OPTIONS` in `lib/filters/columns-jobs.ts` is missing
  `twitch`; `x` stays hidden in the form but keep it in the registry (flagged unstable).

---

## 7. Monday removal (Milestone A — do first, the app is broken without it)

Full file-level inventory came out of the audit; the condensed playbook:

0. **Unbreak the app:** `/` overview (`_lib/daily-report-queries.ts:39-50`),
   `/stag-mapping` (`_lib/queries.ts` `getMondayFreshness`), and `monday-dashboard-queries.ts`
   query the **dropped** mirror tables at page load. Gate or strip these first so `npm run dev`
   demos.
1. **Salvage shared pieces:** move `pagination.tsx`, `sort-header.tsx`, `search-bar.tsx`,
   `scroll-sync.tsx` (+ `PAGE_SIZE_OPTIONS`) out of `app/(dashboard)/monday/_components/` into
   the neutral `_components/`; move `engine-config.ts` → `lib/engines.ts`.
2. **Delete:** `lib/monday/` (12 remaining files), `app/api/monday*` (5 routes),
   `app/(dashboard)/monday/` + `monday-dashboard/`, the 3 Monday-only components
   (`push-to-monday-button`, `monday-status-cell`, `monday-label-editor`),
   `scripts/monday/` (8 files), ~33 Monday QA scripts.
3. **Edit (~30 files):** `vercel.json` (8 Monday cron entries), `proxy.ts` webhook/sync
   allowlist, `package.json` scripts, login redirect `/monday/leads` → `/scrape`, nav items,
   dashboard tiles, leads table/drawer/actions Monday blocks, `scrape/actions.ts` Monday
   branches (`checkMondayDuplicates`, s-tag Monday matching, affiliates shortcut), pipeline
   stage `monday_check`, the 8 social tables' "On Monday" column, enrichment `score-row`
   Monday fallback, scheduler `is_on_monday` gates, onboarding/help copy, admin users
   `monday_user_id` UI.
4. **DB:** drop the 11 Monday functions (`search_website_on_monday`,
   `search_s_tag_on_monday`, `search_monday_candidates`, `mark_monday_duplicates_for_job`,
   `rematch_monday_for_leads`, `rematch_monday_for_all_leads`, `get_monday_item_for_lead`,
   `inherit_monday_data_for_lead`, `inherit_monday_data_batch`,
   `backfill_monday_overridden_chunk`, `sync_affiliate_from_monday_board` + its trigger);
   unschedule pg_cron `inherit-monday-data`; **edit, don't drop:** `advance_enrichment_chain`
   (remove the inherit call + `is_on_monday` gates), `mark_s_tag_duplicates_for_job`,
   `replace_and_verify_s_tags_for_lead`.
5. **Columns last** (separate migration once code no longer references them): the 10
   `monday_*`/`is_on_monday` columns on `google_lead_gen_table`, s-tag/link Monday columns on
   9 tables, `user_profiles.monday_user_id`.

## 7b. Security cleanup (fold into Milestone A)

- **Rotate the ScrapingBee key** hard-coded in plaintext in `docs/n8n-workflows-catalog.md`
  (it's in the forked full history — rotation is the only real fix), then scrub the doc.
- Audit `vm/.env.example` — placeholder values are shaped like real secrets; confirm and blunt.
- Root `.env.example` drift: add the actually-used-but-undocumented vars
  (`HUNTER_API_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`, `INTERNAL_API_TOKEN`), delete the
  dead ones (PMS, Google Ads, Monday OAuth).
- `app/(dashboard)/admin/users/actions.ts` has a local duplicate `requireAdmin` — unify on
  `lib/auth/require-admin.ts`.

---

## 8. Profitability

**The unit-economics insight:** BYO keys means the expensive, legally-exposed part (Apify
runs, captcha solves, LLM calls) is billed by the providers directly to the customer. What we
sell is the *orchestration*: pipeline, dedup, enrichment chain, scheduling, QA surface, team
workflow. Marginal cost per org ≈ Supabase/Vercel slice → **~85–90% gross margin** until we
operate a pooled fleet.

Suggested ladder (numbers are starting points to test in Phase 1.5, not gospel — comparable
tools: Clay $149–800/mo, PhantomBuster $69–439/mo, Captain Data $399+/mo):

| Tier | Price (test) | What gates it |
|---|---|---|
| **Pilot / concierge** (now) | $500–1,000/mo, 1–3 design partners | We run it for them — keys, fleet, QA. Manual, high-touch, validates willingness-to-pay (Phase 1.5 gate) and funds the build |
| **Starter** | ~$149/mo | BYO keys, Google + 2 sources, 5 countries, 2 seats, daily cap |
| **Growth** | ~$399/mo | All sources, all countries, 5+ seats, schedules, priority queue |
| **Scale / managed** | $1k+/mo | Pooled credentials + usage credits, dedicated fleet capacity, SLAs — only after Phase 2 fleet exists |

Levers that make it compound:
1. **Usage credits on pooled resources** (Phase 2): sell scrape-job / enriched-lead credits at
   2–3× raw cost once we operate shared Apify/captcha/fleet. Meter via `usage_events` from day
   one so the data exists before billing does.
2. **Plan-gated entitlements** we're building anyway: number of sources, countries, seats,
   daily caps, schedule slots — the `org_settings` columns *are* the pricing page.
3. **Vertical playbooks as premium modules:** the casino-affiliate IP (rooster scoring, s-tag
   extraction, operator denylists) is genuinely hard-won — package it as an add-on rather than
   diluting the neutral core. Repeat per vertical later (SaaS-affiliate, iGaming-adjacent, etc.).
4. **Outreach add-on** (roadmap): per-mailbox pricing like Instantly/Smartlead ($37–97/mo/box)
   — attaches naturally to the leads we already produce and lifts ARPU without touching
   scrape costs.
5. **Payments reality check:** casino-adjacent gets flagged by Stripe/Paddle. Either lead with
   a neutral vertical for self-serve, or line up a permissive processor before public launch;
   pilots can run on invoices + bank transfer meanwhile.

**Rough break-even math for the pilot phase:** fixed platform cost ≈ Supabase Pro + Vercel Pro
(≈ $45–70/mo) until the fleet returns; a single $500/mo pilot is profitable on day one. The
Phase 2 fleet (~EC2 + GoLogin + proxies, historically low hundreds $/mo) needs roughly one
Growth-tier org to cover it.

---

## 9. Milestones & order of work

| # | Milestone | Contents | Size | Done when |
|---|---|---|---|---|
| **A** | Boots & clean | §7 Monday removal + §7b security cleanup + local run against new Supabase, scraper stubbed | M | `npm run dev` shows every page; zero Monday references; leakage of broken queries gone |
| **B** | Organizations core | §3 schema + §3b auth (signup, invites, roles, JWT org claim) + minimal org admin UI (members, invites) | M | Two orgs, invite flow works end-to-end, JWT carries org_id |
| **C** | Isolation (the big one) | §4: RLS policies, tenant client migration (68 files), org-aware RPCs, trigger-stamped org_id, **leakage test suite** | L–XL | Leakage suite green in CI; service-role imports down to the justified list |
| **D** | Integrations vault | §5: registry + `org_integrations` + Vault encryption + verify adapters + settings UI + worker resolution | M | Org can connect Apify/Hunter/OpenAI/2Captcha; keys never at rest in plaintext; dead-key sweep runs |
| **E** | Sources & countries | §6: engine registry, org toggles, DB trigger enforcement, dependency-aware UI | S–M | Org with only Google sees only Google; scheduler can't smuggle a disabled source |
| **F** | Metering & billing (Phase 2, after a paying pilot) | `usage_events` rollups, Stripe/processor, plan enforcement, pooled-key metering | L | First self-serve subscription |

A → B → C are strictly ordered. D and E can interleave after B (they don't depend on the full
C migration, only on `org_settings`/`org_integrations` existing — but their *enforcement*
tightens when C lands). The Phase 1 acceptance gate from `02-SAAS-PLAN.md` — two orgs, zero
leakage — is Milestone C's exit criterion.

## 10. Open questions for Chris

1. **Pilot posture:** start Milestone A immediately, or first line up 1–2 pilot conversations
   so Phase 1.5 validation runs in parallel with the build?
2. **Bing toggle UX:** block enabling a source until its key verifies, or allow "enabled,
   pending key"? (§6)
3. **Social creator dedup:** per-org copies in v1 (proposed) — accept the duplicate-scrape cost
   until a global-cache optimization is justified?
4. **Portal SSO:** keep it for the SaaS (mapped to one org), or retire it and go pure
   email-invite? (§3b.4)
5. **Pricing tests:** comfortable opening pilot conversations at $500–1k/mo managed? (§8)
