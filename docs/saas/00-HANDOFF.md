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
- ✅ **Stripe pre-wired (2026-09-10, keys expected ~2026-09-13/14):** the whole Phase B
  code path ships DARK — gated on `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` env
  presence, zero behavior change until both exist. `lib/stripe.ts` (hosted Checkout via
  inline price_data — NO Stripe-dashboard product setup needed; metadata carries
  org_id/pack/credits), `startCheckoutAction` (org admin only, amounts resolved
  server-side from CREDIT_PACKS, currency from the page toggle),
  `/api/stripe/webhook` (signature-verified `checkout.session.completed` → idempotent by
  session id via ledger meta → `grant_credits` reason 'purchase' + org notification),
  PacksPanel flips Buy buttons live automatically, billing page shows
  success/cancelled/error banners from `?purchase=`. **proxy.ts fix:** the middleware was
  redirecting unauthenticated POSTs to the webhook to /login (verified live — got login
  HTML) — `/api/stripe/webhook` is now excluded in both the early-exit list and the
  matcher (its auth IS the signature). Verified: unconfigured webhook answers 503, smoke
  23/23. **KEY DAY = 3 steps** (documented in .env.example): (1) sk_ key → Vercel env
  `STRIPE_SECRET_KEY`, (2) dashboard webhook endpoint
  `https://lead-enrichment-platform-nine.vercel.app/api/stripe/webhook` with event
  `checkout.session.completed`, (3) its whsec_ → `STRIPE_WEBHOOK_SECRET`, redeploy. Test
  with sk_test keys + card 4242 4242 4242 4242 first.
- ✅ **Ported from Google-Lead-Gen (2026-09-24, per prod's `docs/for-saas-repo-2026-09-24.md`
  @ 24b7cf2; migrations `20260924120000` + `20260924130000`, applied live).** No shared git
  ancestor, so re-applied by hand from prod's FINAL definitions (prod clone at
  `C:\Users\Chris-Optinet\Google-Lead-Gen`, read-only). Monday stripped everywhere the brief
  lists. **DB:** website_profiles / appearances / relations / known_non_affiliate_domains,
  lead profile_id + system_flag + SERP title/description + relevance columns, lead→profile
  sync trigger, complete_scrape_job with the **job-scoped dedupe** (never prod's all-time
  predicate that hid re-seen websites' rows), lead-domain functional index, AI triage/crawl
  columns + website_cta_links, relevance-gated ai_candidates_for_job, two-way
  job_analysis_summary, search_scrape_jobs/facets (pg_trgm), replay_missing_leads.
  **Deliberate SaaS deviations:** our chain keeps its affiliate terminus (prod's
  chain_stops_at_rooster NOT ported; no rooster re-check enqueue); Rooster UI wording →
  "partner brand"; "Already exists?" is two-way (external/CRM slot reserved in code);
  prod's dedupe-setting copy (which described the old buggy behaviour) rewritten; no Vercel
  cron for AI (Hobby) — `/api/ai-analysis/run` is bearer-auth'd and excluded from the
  session middleware; prod's new-scrape wizard / admin integrations+reports / GoLogin
  proxy tooling are outside the brief and not ported. **App:** `/websites/[domain]` page
  (built on OUR Monday-free drawer sections; drawer removed, `?lead=` permalinks redirect),
  leads table (website links, recency dot, system-flag pill, "What it is", ExistsBadge),
  honest counts (jobs Results column + batch header + analysis strip), advanced batch
  search, `/affiliates` (nav: Tools, affiliate module), AI libs (relevance + crawl, OFF by
  default; key = system setting `openai_api_key` or env `OPENAI_API_KEY` — none set yet),
  admin System → Website profiles settings, loading.tsx on all 28 dashboard pages,
  `staleTimes` router cache (org switch / leave / invite / create now purge it), worker
  keeps the SERP snippet. **Gate:** new `scripts/orgs/verify-websites.ts` — 21 end-to-end
  checks incl. the brief's §12 regression (re-scrape of known sites keeps its rows) — plus
  smoke (26 pages), verify-actions (real browser), tenancy 30/30: all green. Note: with
  loading.tsx, notFound()/redirect() stream in-page (HTTP 200 + meta refresh) — expected.
- ✅ **Public site + new auth UI + tour on signup (2026-09-28):** `/` is now the marketing
  landing page (route group `app/(marketing)`: hero with a JSX product mock — no real
  screenshots, they would expose real owners' phones — proof numbers, what-it-is, six
  services, how-it-works, pricing, FAQ, closing CTA) and `/pricing`; both are public via
  the proxy allowlist (`pathname === '/'`, `/pricing`). The old dashboard Overview moved to
  `/overview` (admin-gate redirects and the sidebar bandwidth link follow). **Pricing
  decision (research: Apollo/Clay/Hunter/PhantomBuster all converged on it) = hybrid:**
  monthly plans that include credits — Free €0/100 once · Starter €49 (€39 yearly)/400 ·
  Growth €149 (€119)/1,500 · Scale €399 (€319)/5,000, USD ≈ ×1.1 — plus the existing
  never-expiring top-up packs; single source of truth `lib/pricing.ts` (lib/billing
  re-exports the packs). Plans are MARKETING today: every CTA lands on the free signup
  (`?plan=` is only echoed as a notice); subscription checkout is the next Stripe step
  after packs. Auth pages moved to `app/(auth)/{login,signup}` with a shared split-panel
  `AuthShell` (brand panel + form; password show/hide; strength hint on signup; input
  names unchanged so the action + verify-actions selectors still hold). **Tour:** the
  TourController now has `script: 'property' | 'affiliate'`; the affiliate script is
  mounted on `/scrape` (anchors `scrape-form`, `jobs-table`, nav `nav-leads`,
  `nav-affiliates`), so a brand-new account gets a guided tour whichever vertical it
  picks; welcome copy says so; Help offers the restart for both. verify-actions now
  ASSERTS both tours auto-start; smoke checks `/`, `/pricing`, `/login` are reachable
  signed-out and the app redirects signed-out (29 pages + 4 auth-gate checks). Gate:
  tsc, eslint, build, smoke, verify-actions, verify-websites 21/21, tenancy 30/30 — green.
- ✅ **Repositioning + outreach tracking (2026-09-28, migration `20260928120000`, applied
  live):** owner's direction — casino/iGaming affiliates are Optinet's COMPETITORS, never
  customers, and the product is "lead → outreach → monitor", not scraping. Research
  (Grovia/Publisher Discovery/Breezy stop at discovery; affiliate spend: e-commerce 38%,
  finance 15%, SaaS 9%; SaaS 22.5% recurring commissions, hosting longest cookies) →
  landing page now leads with the four-stage journey, a "Who it's for" grid of ten
  industries (property management flagged as live; VPN, hosting, B2B SaaS, fintech,
  e-commerce, cybersecurity, education, travel, insurance comparison), services incl.
  "Partner & publisher discovery" and "Outreach tracking", a team section, and an honest
  FAQ ("Does it send the outreach? Not yet — sequences on the roadmap"). All casino /
  affiliate wording scrubbed from public surfaces; nav "Partners (AI)", welcome "Partner &
  publisher discovery" (module key stays `affiliate`, URLs unchanged). **Outreach layer
  (backs the claim):** `outreach_status` enum (new/contacted/replied/won/not_now/lost) +
  `contacted_at` / `next_follow_up_at` / `outreach_note` on BOTH `property_leads` (org-
  scoped) and `website_profiles`; one server action (`_actions/outreach.ts`) + one client
  editor (`OutreachEditor`, compact in the Owner Leads table, full on the website page);
  filterable/sortable columns; "Follow-ups due" chip; **Outreach pulse** card on Collect
  Data (contacted/replied/won + the due list). Free on every plan. ⚠ Still to do before
  selling discovery to other industries: `lib/ai-analysis` prompts are casino-tuned (from
  prod) — make them vertical-neutral / keyword-driven. verify-actions asserts the editor
  renders on Owner Leads.
- ✅ **Affiliate-first repositioning (2026-09-28, same day, owner correction):** property /
  Airbnb is "just another feature"; the MAIN product is affiliate discovery for brands that
  recruit affiliates (VPN, hosting, SaaS, fintech… — still never casino). Landing page now
  leads "Recruit the affiliates your competitors already have", five-stage journey Scrape →
  Classify → Contacts → Outreach → Monitor, ten affiliate-recruiting industries (VPN, hosting,
  B2B SaaS, fintech/brokers, cybersecurity, e-commerce, education, travel, insurance, health &
  supplements), property as an "also in the box" module. Product mock is now the Partners
  (AI) table (fictional VPN-review domains). Proof tiles: 85k+ results profiled, 9 engines &
  platforms (Google, Bing, YouTube, TikTok, Twitch, Kick, Snapchat, Telegram, FB Ad Library),
  10 contact channels, 8,294 property owners (module). Pricing features lead with keyword ×
  country search, contact enrichment and creator search; CREDIT_USAGE states keyword searches
  are a daily quota (lib/scrape-quota, 20/user/day default), AI + enrichment + outreach free.
  Auth side panel and FAQ rewritten to match. **Welcome picker now defaults to the affiliate
  vertical** (`app/welcome/actions.ts` fallback too) → new orgs land on `/scrape`. Scrape form
  keyword placeholder is a VPN example, not casino. ⚠ Consequence: the default signup path
  now needs the scraping worker connected (owner-side pending item) — a new affiliate org
  that queues a keyword today sees the job wait forever.
- ✅ **Scraping actually runs here (2026-09-29, migration `20260929120000`, applied live):**
  the SaaS had no worker consuming `scrape_queue` (prod runs scraper.py on GoLogin VMs), so
  every scrape sat pending. Now: **Google jobs run on Apify's `google-search-scraper`**
  started from the app (`lib/scrape/apify-google.ts`), ingested through the same
  `complete_scrape_job` RPC the VM worker would call (so website profiles, dedupe, chain all
  work unchanged). **Enrichment runs in-app** (`lib/scrape/inline-enrich.ts`): claims
  `enrichment_fetch_queue` rows, plain-fetches homepage (+ contact pages for the contact
  stage), writes `fetched_html_cache`, scores via `lib/enrichment/score-stage.ts` (shared
  with `/api/enrichment/score-row`). Affiliate scorer gained `nicheKeywords` (from the job
  keyword) so VPN/hosting outbound links count like casino ones. **Driver:**
  `POST /api/scrape/tick` (session or Bearer CRON_SECRET) — called by AutoRefresh on the
  scrape pages every 5 s, by the Apify webhook (`/api/scrape/apify-webhook?key=<derived
  from CRON_SECRET>`) and by `/api/scheduler/tick`. Enqueue starts the runs immediately.
  One Apify job per Google keyword now (no VM PPC sibling; Apify returns page-one ads).
  Only Google is offered; other sources are "coming soon" in the wizard. **Token:** Vercel
  has no APIFY_TOKEN (`.env.vercel` lists only 5 vars, Vercel CLI not logged in) → the
  platform token lives in `platform_secrets` (RLS, service-role only; system_settings is
  readable by every user via get_system_setting so it must NOT go there). Resolver: env
  APIFY_TOKEN first. **Countries:** 32 rows seeded in `gologin_profiles` with
  `gologin_profile_id='apify-google'` (FK needs them). Settings: `apify_google_max_pages`
  (2), `inline_runner_enabled`. **UI port from prod** (Monday stripped): `/scrape` list
  (scope bar day+owner, Create button, EmptyDay, card paging, flags/source icons),
  `/scrape/new` wizard (desktop form + phone stepper, saved setup, quota pill, ticket),
  `/scrape/today`, duplicate-warning modal, `?demo=casino|vpn|property` one-click presets
  (2 keywords × 2 pages, affiliate+contact). `scripts/orgs/verify-scrape-runner.ts` runs a
  real demo end to end (costs 2 Apify runs); `scripts/orgs/seed-demo-scrapes.ts` queues the
  three demo batches under the admin account. **Live examples seeded 2026-09-29 under
  admin@optinetsolutions.com** (visible on /scrape → Everyone or as admin): casino GB 18+9
  leads / 9 affiliates / 7 with contacts; VPN GB 14+13 leads / 10 affiliates / 14 with
  contacts; property MT 9+15 leads / 18 with contacts. The owner's original stuck job
  ("best vpn for streaming" MT) also completed (16 leads). ⚠ Not run here: s-tag extraction, PPC
  screenshots, social engines (all need the browser fleet). ⚠ Apify Starter has no
  concurrency cap but each run costs ~$0.003/page.
- ✅ **Property module secluded (2026-09-29):** it is moving to its own repository,
  `Optinet-Solutions-Prod/property-listings-scraper` (extraction pushed: the module's pages,
  actions, libs, shell dependency closure, the original migrations, and one paste-able
  `0001_property_listings.sql` for a fresh Supabase project — tenancy core, user_profiles,
  system_settings, integrations, activity/notifications, credits + vouchers, property tables,
  sources/recipes, outreach). In the SaaS the code stays but is dark behind
  `lib/modules.ts#PROPERTY_MODULE_ENABLED` (env `NEXT_PUBLIC_PROPERTY_MODULE=on` to show it):
  `getOrgContext()` drops `property` from every org's modules (nav/help/tour hide themselves),
  `proxy.ts` redirects `/property-scrape|/property-leads|/pm-prospects|/airbnb-listings|
  /hfps-register|/pipeline` → `/scrape`, login/signup/welcome land on `/scrape`, the welcome
  picker no longer offers the vertical, landing/pricing/FAQ/billing/help lost the Airbnb and
  licence-register wording. Data (property_leads, airbnb_listings, hfps_register) is untouched
  in the SaaS DB until exported. Later the same day the owner found a "Property management —
  Malta" Google demo preset still on the landing page and in the wizard: every property example
  is gone now (landing presets VPN / hosting / SaaS / fitness; wizard + seeder casino / VPN /
  hosting; the seeded property batches were deleted). Rule: no property or Malta-rental wording
  anywhere a visitor or user can see. The "Property Management" org was renamed **Optinet
  Discovery** (slug `optinet-discovery`; verify-actions / verify-scrape-runner use it) and both
  admin orgs now have `enabled_modules = {affiliate}`. activity_log and notifications held no
  property rows. The property tables still hold the Malta data under that org_id, invisible.
- ✅ **Landing page = live demo (2026-09-29, migration `20260929130000` applied live):** the
  owner wants visitors to run the product without signing up. Hero is now a 4-slide carousel
  (tagline "Type a keyword. Meet the sites that rank for it — and the people behind them.") whose
  "Try it now" scrolls to `#demo`. `LiveDemo` (`app/(marketing)/_components/live-demo.tsx`):
  presets (VPN GB, hosting US, SaaS US, property MT — no casino on the public page), keyword +
  country (12), Run → `POST /api/demo/start` → one Apify Google page → `GET /api/demo/[id]`
  polled every 3 s advances a state machine in `lib/demo/run.ts` (searching → enriching → done):
  up to 8 non-platform results are fetched (homepage + 1 contact page), scored with
  `scoreAffiliate` (niche keywords) and mined with `extractContacts`. Results open in a modal:
  cards with favicon, title, position/Ad, snippet, verdict chip (Affiliate / Possible / Publisher
  / could not open), evidence, contact chips (emails, phone, socials, contact page), Email / SMS
  buttons → prefilled draft → "Send" → confirmation that NOTHING was sent (no provider yet),
  "Add to list" + signup CTA. Runs live in `demo_runs` (service-role only), never in org tables;
  limits via system_settings `demo_enabled`, `demo_per_ip_per_hour` (3), `demo_per_day` (120);
  IP hashed with CRON_SECRET. `/api/demo/` is public in proxy.ts. Proof strip, product mock and
  team section removed from the landing. Test: `scripts/orgs/verify-demo.ts` (1 Apify page).
  **Same day, owner's pipeline spec:** the demo now runs the full flow: (1) Apify Google page →
  (2) relevance check per result (heuristic `judgeRelevanceHeuristic`: niche words + keyword
  words in title/snippet/URL; off-topic results are shown dimmed and NEVER opened) → (3) only
  relevant, non-platform results are crawled (max 8) → (4) classified affiliate / operator (a
  brand's own site) / publisher → (5) brands endorsed + CTA links (`extractBrands`: direct
  external CTAs via `ctaCandidates`, cloaked/tracking links unmasked with `unmask`, AND same-host
  review links like `/vpn/nordvpn` "9.4 Review" counted as endorsements) → (6) contacts. Cards
  show Relevant / kind chip / "Endorses: NordVPN ×3 · … — N CTA links" / contacts; the list
  button is a heart toggle (aria-label "Add to relevant list"). A "Casino brand" preset is on
  the landing (the owner asked; casino brands are customers, casino affiliates are not).
  `apifyJson` retries once on "fetch failed".
- ✅ **OpenAI on (2026-09-29, owner added `OPENAI_API_KEY` to Vercel; migration
  `20260929140000` applied, `ai_analysis_enabled=true`):** prompts in `lib/ai-analysis`
  (relevance, triage, audit) are vertical-neutral — the market is inferred from the keyword.
  Audit returns `site_kind` (affiliate / operator / publisher / other) + `market`, saved to
  `website_profiles.ai_site_kind / ai_market`; the website page tile "What is it?" shows them.
  Key is env-only (`readKey` no longer reads system_settings). **Workspace trigger:** the scrape
  tick runs an AI slice when the fetch queue is idle (`runAiAnalysis({days:3, triageLimit:10,
  auditLimit:1, deadlineMs:20s})`, module-level in-flight guard); tick/webhook `maxDuration=120`.
  `/api/ai-analysis/run?audit=N` (Bearer CRON_SECRET) still works for bulk runs. **Demo:** uses
  the same judges (`judgeRelevance` on the SERP rows, `audit` on each opened page) when the key
  exists; heuristics stand in otherwise. ⚠ Local `.env.local` has NO OpenAI key — the AI path is
  only testable against production. ⚠ `rooster_brands` (29 casino brands from prod) is still the
  global "our brands" list the audit is shown; a per-org brand list is future work.
- ⬜ Not started: SMTP/Resend (Phase C — needs owner DNS; signup email confirmation still
  has no sender), full Milestone C (org_id + RLS on the legacy affiliate tables +
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
