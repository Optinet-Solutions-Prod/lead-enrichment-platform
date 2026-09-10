# SaaS Conversion — Handoff / Start Here

> **Purpose of this folder:** full context for anyone (human or a fresh Claude session)
> picking up the conversion of this codebase into a multi-tenant SaaS. Read these four
> docs in order and you should not need any prior conversation to continue the work.
>
> Last updated: **2026-09-04**

---

## What this project is

This repo (`lead-enrichment-platform`, org **Optinet-Solutions-Prod**) is a **full-history
fork** of an internal single-tenant tool called **Google-Lead-Gen** (org
Optinet-Solutions-AI). We are converting that tool into a **multi-tenant SaaS**.

The product is an **end-to-end outbound engine**: it **scrapes** search engines (Google/Bing
via Apify + a VM browser fleet) and social platforms for a keyword × country, **enriches**
what it finds (affiliate detection, contact extraction, brand/"rooster" scoring), and is
being extended toward **outreach**. It started in the casino-affiliate niche but is being
made **vertical-neutral** — "any niche, scrape → enrich → reach."

## Golden rules (do not violate)

1. **Production is untouchable.** The original lives in a *different* repo and a *different*
   Supabase account. Nothing in this SaaS line may point at, write to, or share resources
   with production. See `03-ENV-AND-ISOLATION.md`.
2. **Which folder → which repo.** Edits in `…/lead-enrichment-platform` push to the SaaS
   repo; edits in `…/Google-Lead-Gen` push to **prod**. Always check `git remote get-url origin`
   before pushing.
3. **This is Next.js 16+ with breaking changes** from older Next. The repo's root
   `AGENTS.md` says: read the guide in `node_modules/next/dist/docs/` before writing Next code.
   Middleware is `proxy.ts` (not `middleware.ts`).
4. **Secrets never get committed.** `.env.local` is gitignored. Keys live there and in the
   DB `system_settings` table — never in source or in these docs.

## Current state (2026-09-04)

- ✅ Repo mirrored from prod with **full history (574 commits)**; both branches present
  (`main`, `fix/scraper-gologin-badzip-backoff`).
- ✅ History **re-authored** so all of "Hannah Porter"'s commits are now
  **ChrisOptinet `<chris@optinetsolutions.com>`**. Jose's commits preserved. Local clone has
  Chris's identity set (`git config user.name/email`), so new commits continue as Chris.
- ✅ New Supabase project provisioned: ref **`zxxeuyixqnbwmnlvjkbr`**
  (URL `https://zxxeuyixqnbwmnlvjkbr.supabase.co`).
- ✅ **Schema cloned into the new project** (2026-09-04): 164 migrations applied + 15 drifted
  columns / 3 functions reconciled from prod → **38 tables, 90 functions**. **No data copied**
  (leads/scrape all empty). The **8 Monday mirror tables were dropped**. Prod-specific config
  (`gologin_profiles`, `system_settings`) was cleared for isolation; harmless vertical
  reference data kept (`operator_domains_denylist`, `rooster_brands`, `batch_counter`).
  `.env.local` written (gitignored) with the new project's keys. Details in
  `03-ENV-AND-ISOLATION.md`.
- 📝 **Build plan written (2026-09-04):** `04-BUILD-PLAN.md` — concrete plan for tenancy
  (orgs/invites/RLS), per-org BYO integrations, source/country entitlements, Monday removal,
  pricing. Grounded in a full code audit.
- ✅ **Milestone A done (2026-09-04): Monday removed.** App code (lib/monday, /monday routes,
  monday-dashboard, push/label UI, ~30 coupled files edited, ~60 files deleted), the 8 Vercel
  Monday crons, the proxy allowlist, and the DB layer (11 Monday functions dropped, the
  `inherit-monday-data` pg_cron unscheduled, `advance_enrichment_chain` /
  `mark_s_tag_duplicates_for_job` / `replace_and_verify_s_tags_for_lead` rewritten Monday-free
  — migration `20260904120000_remove_monday.sql`, applied live). Monday *columns* intentionally
  kept (inert) for a later cleanup. Login now lands on `/scrape`. ScrapingBee key scrubbed from
  docs (⚠ still rotate it — it's in git history). `.env.example` de-drifted.
- ✅ **Milestone B done (2026-09-04): organizations core.** `organizations` / `org_members`
  (owner|admin|member) / `org_invites` (hashed tokens, 14-day expiry, email-bound) /
  `org_settings` (enabled_sources default `{google}`) / `usage_events` + RLS + write-RPCs —
  migration `20260904130000_organizations.sql`, applied live. Supabase Auth: signup enabled,
  12-char min passwords, `custom_access_token_hook` enabled (JWT carries `org_id`+`org_role`).
  App: `/signup` (invite-aware), `/invite/<token>`, `/welcome` (create org),
  `/settings/organization` (members, roles, invite links, rename); dashboard layout gates on
  org membership; sidebar shows the org name. **Verified live by
  `scripts/orgs/verify-tenancy.ts` — 19/19 checks green** (JWT claims, invite lifecycle, role
  enforcement, cross-org RLS isolation), and `scripts/orgs/smoke-pages.ts` — every dashboard
  page (incl. admin) renders 200 with a real session.
  Auth-config notes: email **confirmation is ON** for plain `/signup` (no SMTP configured —
  Supabase's built-in mailer is rate-limited; add SMTP or toggle "Confirm email" off in the
  dashboard for friction-free staging signups). Invited users bypass it entirely — the signup
  action admin-creates them pre-confirmed (the unguessable invite link + server-side email
  match is the vouch). No users are seeded; create the first account via `/signup` or
  `npm run auth:seed-admin`.
- ✅ **De-verticalized (2026-09-07):** `/stag-mapping` and `/brands` (Rooster Brands) routes
  deleted; the Rooster-partner concept removed from all dashboard UI (leads column/editor/
  drawer/bulk, overview KPI, enrichment stage card, onboarding/help copy); the auto enrichment
  chain is now **affiliate → complete** (migration `20260907120000_chain_stops_at_affiliate.sql`,
  applied live). S-tag extraction + contact extraction remain as operator-triggered features.
  Kept inert: rooster DB columns/`rooster_brands` table, the backend rooster scoring path in
  score-row (never invoked — no rooster jobs are enqueued), the `@rooster.local` auth email
  domain (functional), and the legacy `rooster_running` status label for historical rows.
  Root metadata rebranded to "Lead Engine".
- ✅ **Maltapark source added (2026-09-07, SaaS-only):** engine `maltapark` — plain-HTTP
  scraper of maltapark.com classifieds (`GET /search/?c=s1&search=<kw>&page=<n>`, verified
  live; parser tested against real HTML). New: `maltapark_listings` table + MT country row
  (migration `20260907130000_maltapark_source.sql`, applied), `vm/maltapark_search.py` +
  worker dispatch (pure-HTTP path, no GoLogin), enqueue-form option (country pinned to MT),
  job-page listings panel/table, jobs filter. NOTE: jobs queue but don't RUN until a worker
  process is pointed at THIS Supabase (a separate systemd unit on the existing EC2 box works —
  deploy `worker.py` + `maltapark_search.py` from THIS repo with an `~/.env` pointing here;
  never reuse the prod worker units).
- ✅ **Malta property-owner harvest (2026-09-07):** 98 leads in `public.property_leads`
  (migration `20260907140000_property_leads.sql`) from 10 of 18 requested sources, surfaced at
  `/property-leads` (nav → Tools). Loader: `scripts/property/insert-leads.ts` (replace-per-site,
  idempotent). Plain-HTTP harvest for most; Apify website-content-crawler (real browser) cracked
  myhive.mt. Dead ends with evidence: timesofmalta (no online classifieds exists — subdomains
  NXDOMAIN, homepage links none), maltaproperty.com (lead-form-only, zero contacts in 42 rendered
  pages), keysdirect/dar.mt/letify (login-gated contact), propertiesforsalemalta (dormant),
  maltadirectrentals (pre-launch). Best repeatable endpoints: homesinmalta.com WP REST
  (owner name+phone), propertiesfromowner.com `/api/map` (all owner mobiles), MTA licence CSVs.
- ✅ **Short-let intelligence layer (2026-09-07, PM-offer pivot):** `airbnb_listings`
  (1,560 Malta/Gozo listings via Apify tri_angle~airbnb-scraper, ~$6.30 total),
  `hfps_register` (8,294 licensed short-let addresses from MTA CSVs), and the
  `airbnb_pm_prospects` VIEW (894 self-managing hosts, 844 with 1-2 listings; lettings brands
  regex-filtered). UI: `/pm-prospects` (prospect list + town market map), `/airbnb-listings`,
  `/hfps-register`. Cross-checks: property_leads↔Airbnb = 1 candidate (name+locality);
  property_leads↔HFPS = 0 (none of our leads are licensed short-lets — conclusive negative);
  8 Airbnb listings displaying licence numbers were resolved to exact register addresses
  (licence→address de-anonymization works). Migrations `20260907150000` + `160000` + `170000`.
- ✅ **Property-first UX + deploy (2026-09-07):** live on Vercel at
  lead-enrichment-platform-nine.vercel.app (crons removed — Hobby plan; recurring-schedules
  feature deleted with them, `20260907180000`). Home = `/property-scrape` collect hub built on
  Meny's research deck (checked into repo root); PageIntro explainers on every data page;
  scrape-table filter/sort/search/pagination retrofitted onto all four data pages.
- ✅ **Verticals became organizations (2026-09-08, migration `20260908120000`, applied live):**
  three orgs, all owned by admin@optinetsolutions.com (ownership transfer = future feature):
  **Property Management** (owns the harvest — property_leads + airbnb_listings gained NOT NULL
  `org_id` + RLS member-read, per-org `airbnb_pm_prospects`; admin's ACTIVE org via backdated
  membership — no switcher yet), **Optinet Solutions** (platform org, modules
  {property,affiliate}), **Rooster Partners** (affiliate shell). `org_settings.enabled_modules`
  drives per-org nav: property pages tagged `property`; the old Scrape/Leads pages are now
  `affiliate`-module items (visible only to orgs with that module). `hfps_register` stays
  GLOBAL reference data. All page queries + Collect Data actions org-scoped; Apify run record
  per-org (`airbnb_last_run:<org_id>`); out-of-range pagination on empty orgs renders empty
  (PGRST103) instead of 500.
- ✅ **Org switcher + integrations vault v1 (2026-09-09, migration `20260909120000`):**
  `user_profiles.active_org_id` + `set_active_org()` RPC; the JWT hook and app context prefer
  the chosen org (fallback: earliest membership). Sidebar org name is now a workspace
  dropdown for anyone with 2+ memberships. Scraping infra pages (Interactive Checkpoints,
  Country Profiles) joined the affiliate module — visible in Optinet Solutions / Rooster
  Partners, never in Property Management. Integrations (Milestone D v1): YAML catalog at
  `lib/integrations/catalog.yaml` (adding an integration = adding a block: fields + one
  declarative HTTP connection test), per-org storage in `org_integrations` (RLS deny-all →
  service-role only, secrets never reach the browser; Vault = upgrade path),
  `/settings/integrations` page (Save & test, masked secrets, disconnect), and the Airbnb
  scraper resolves the org's connected Apify account before the platform env token.
  next.config traces the YAML into serverless bundles (`outputFileTracingIncludes`).
- ✅ **YAML uploads for integrations (2026-09-09, migration `20260909130000`):** the
  integrations catalog is now catalog.yaml built-ins + per-org uploaded defs
  (`org_integration_defs`, RLS deny-all). `/settings/integrations`: template download +
  inline format viewer, YAML upload (32KB / 10 entries, built-in keys reserved, SSRF-guarded
  test URLs), per-def re-download + remove. Custom defs behave exactly like built-ins
  (Save & test, org-scoped credentials).
- ✅ **Custom sources + workflows + credits (2026-09-09, migration `20260909140000`, applied
  live):** the approved feature trio (#2 #4 #5).
  **Custom YAML scrape sources** — orgs upload a YAML describing any JSON API
  (`lib/sources/template.ts` format: https GET url, `list_path`, field mapping via dot-paths
  or `{dot.path}` templates, `listing_url` = dedupe key) → stored in `org_source_defs`
  (PK org_id+key, RLS deny-all), validated hard (https-only, private hosts blocked, ≤10
  entries/32KB), runnable from Collect Data as a "Your sources" tier and inside workflows
  (`lib/sources/custom.ts`). Template/export routes under `/property-scrape/source-*`.
  **Workflows (`/pipeline`, nav "Workflows")** — saved recipes in `org_recipes.steps` jsonb
  `{sources[], keyword, crossmatch}`; one-click run executes the shared dispatcher
  (`lib/sources/execute.ts` — same code path as Collect Data) then optionally the Airbnb
  cross-match, a TS port of the harvest matcher (`lib/sources/crossmatch.ts`: STOP-words,
  town aliases, first-name+locality → patches `airbnb_url`/`airbnb_match_basis`); last run
  result stored on the recipe card. Source runners extracted from the page action into
  `lib/sources/runners.ts` (shared by form + recipes).
  **Credits (`/settings/billing`, nav "Billing & Credits")** — `org_settings.credits_balance`
  (default 100; existing orgs seeded 1,000 via `launch_grant`), atomic `spend_credits` /
  `grant_credits` SECURITY DEFINER RPCs (service-role only; spend returns -1 when short,
  nothing deducted — verified live incl. overspend rejection), `org_credit_ledger` audit
  trail. Prices in `lib/credits.ts` `CREDIT_COSTS`: source run 1, MTA refresh 1, Airbnb
  crawl 5, cross-match free. Every Collect Data / workflow run debits up-front and errors
  politely (naming Billing & Credits) when short. Billing page: balance, price list, ledger,
  platform-admin manual grant form (`is_admin` RPC gate — org owners can't mint credits).
  **Stripe checkout is the missing piece** — user confirmed Stripe; wire it to
  `grant_credits` once keys are provided. Gate: tsc ✓, build ✓, smoke 23/23 (incl.
  /pipeline + /settings/billing) ✓, verify-tenancy 19/19 ✓, live credit RPC check ✓.
- ✅ **User management round-out (2026-09-10, migration `20260910120000`, applied live):**
  feature-queue #1 finished. **Ownership transfer** — `transfer_org_ownership(p_user_id)`
  RPC (owner-only, target must be a member; new owner promoted, old owner steps down to
  admin) + "Danger zone" section on Team & Users (owner picks the new owner from a dropdown,
  confirm dialog, session refresh re-mints the demoted JWT). **Leave organization** —
  `leave_organization()` RPC (owners blocked until they transfer; clears active_org_id) +
  self-service button in the same section for non-owners (lands on the next workspace or
  /welcome). **Multi-org membership unlocked** — `accept_org_invite` guard relaxed from
  "already in ANY org" to per-org, so one user can be invited into several orgs (the
  workspace switcher already handles it); accepting an invite now also sets the new org as
  the active workspace. Create-org via /welcome still allows only one owned org.
  verify-tenancy grew to **27 checks** (multi-org join, active-org-on-accept, leave, owner
  can't leave, member can't transfer, role swap, demoted JWT) — all green live; smoke 23/23.
- ✅ **Onboarding + monetization Phase A (2026-09-10, migration `20260910130000`, applied
  live):** docs/saas/05 built end-to-end with all decisions taken as proposed.
  **Tour** — driver.js (~5KB) TourController on Collect Data: 7 skippable steps over
  `data-tour` anchors (org switcher, sources, credits, nav items, bell), auto-starts once
  per user (`user_profiles.tour_state` jsonb), restart via `/property-scrape?tour=1` from
  the Help page. **Getting-started checklist** — server-computed from real org state
  (leads/recipes/members/integrations), collapses and retires itself when done.
  **Billing page v2** — EUR/$ toggle (org_settings.currency, EUR default), 3 credit packs
  (€25/100 · €99/500 popular · €299/2,000; $29/$115/$345) with Buy disabled until Stripe,
  voucher redeem box, BYO-vs-platform Airbnb price list. **Credits engine** —
  `chargeCredits()` wrapper (all actions use it): honors global kill-switch + per-org
  unlimited, debits atomically, low-balance (<20) notification;
  `CREDIT_COSTS.airbnb_start_byo=5 / airbnb_start_platform=15` resolved per-org by
  connected Apify integration. **Admin levers** — billing kill-switch
  (system_settings.billing_enabled, seeded ON for review; OFF hides all pricing +. stops
  debits), per-org billing_mode credits|unlimited, gift credits to ANY org (dropdown or
  member-email lookup), voucher codes (create/list/delete; `redeem_voucher` RPC:
  row-locked, once per org, expiry + max-uses — admin-only redeem). **Notifications** —
  `notifications` table + bell (sidebar header + mobile top bar, unread badge, mark-all-
  read); emitters: scrape/workflow finished, Airbnb ingested, low credits, gift, voucher,
  member joined, ownership transferred, welcome. **Welcome** — vertical picker (property/
  affiliate radio → enabled_modules) + 100-free-credits welcome note. **Help** — rebuilt
  user-facing (journey, credits paragraph, YAML how-tos, tour restart, contact), un-hidden
  in nav. **Mobile** — sticky scrape CTA, 44px targets on new surfaces, full-width file
  inputs, stacking pack cards. verify-tenancy now **30 checks** (voucher redeem/dupe/role)
  — all green; smoke 23/23; tsc + build clean. Pricing/copy = owner reviewing (comments
  expected).
- ⬜ Not started: Stripe checkout (Phase B — needs keys from user; packs render, Buy
  disabled), SMTP/Resend (Phase C — needs owner DNS; signup email confirmation still has
  no sender), full Milestone C (org_id + RLS on the legacy affiliate tables +
  tenant-client migration), E (source/country toggles), outreach tracker, repointing
  hardcoded prod refs, VM fleet.

## The plan in one screen

- **Phase 0 — Isolated clone (cheap, no prod risk):** new repo (done) + new Supabase +
  schema (no data) + local run with the scraper stubbed. **No AWS/VM fleet yet.**
- **Phase 1 — Prove multi-tenancy:** add `organizations` + `org_id` + RLS; log in as two
  fake orgs; prove **zero cross-tenant data leakage**. This is the real technical risk.
- **Phase 1.5 — Validate demand** before spending on infra (one paying pilot).
- **Phase 2 — Only then:** isolated scraper fleet (own GoLogin/proxies), billing, self-serve.

Full reasoning, trade-offs and risks are in `02-SAAS-PLAN.md`.

## Index

| Doc | What's in it |
|---|---|
| `00-HANDOFF.md` | This file — orientation, current state, rules. |
| `01-ARCHITECTURE.md` | How the inherited system works: stack, subsystems, DB (44 tables / 89 functions), VM fleet, what to keep vs drop. |
| `02-SAAS-PLAN.md` | Tenancy model, phased plan, the hard parts, business/legal risks. |
| `03-ENV-AND-ISOLATION.md` | The two repos + two Supabase projects, isolation rules, the hardcoded prod references to repoint, how to run, cloning the schema. |
| `04-BUILD-PLAN.md` | The concrete Phase 1+ execution plan: tenancy schema, RLS migration, per-org BYO integrations, source/country entitlements, Monday removal playbook, pricing model, milestones A–F. |
| `05-ONBOARDING-MONETIZATION-PLAN.md` | PROPOSAL (2026-09-10, not built): registration → interactive tour (driver.js) → activation checklist → top-up/promo page; EUR/$ credit packs + Stripe wiring plan; admin levers (billing kill-switch, per-org unlimited, gift credits, vouchers); mobile-first audit; help + notifications design; phased build order + decisions needed. |
