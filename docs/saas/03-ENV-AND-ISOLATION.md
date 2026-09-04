# Environments, Isolation & Setup

The two parallel stacks, the rules that keep them apart, and how to bring the SaaS one online.

## The two stacks

| | Production (do not touch) | SaaS (this line) |
|---|---|---|
| **GitHub repo** | `Optinet-Solutions-AI/Google-Lead-Gen` | `Optinet-Solutions-Prod/lead-enrichment-platform` |
| **Local folder** | `c:\Users\Chris-Optinet\Google-Lead-Gen` | `c:\Users\Chris-Optinet\lead-enrichment-platform` |
| **Supabase ref** | `veqfloktkejmyueskltp` | `zxxeuyixqnbwmnlvjkbr` |
| **Supabase URL** | `https://veqfloktkejmyueskltp.supabase.co` | `https://zxxeuyixqnbwmnlvjkbr.supabase.co` |
| **Supabase account** | (prod account — my PAT is scoped here) | **different account** (needs its own access token) |
| **AWS/VM fleet** | VM1 `54.79.22.202`, VM2 `3.24.160.131` | **none yet** (Phase 2 — must be separate) |
| **GoLogin/proxies** | prod GoLogin account | **must be separate** when the fleet is built |

### The isolation rule
The SaaS stack shares **nothing live** with production — not the repo, DB, VMs, GoLogin
profiles, proxies, API keys, or Vercel project. The moment staging points at a prod resource,
the safety this whole exercise buys is gone.

### Which folder → which repo (say it before every push)
```bash
pwd
git remote get-url origin
# ...Optinet-Solutions-Prod/lead-enrichment-platform  → SaaS  ✅
# ...Optinet-Solutions-AI/Google-Lead-Gen             → PRODUCTION — stop
```
The SaaS clone already has Chris's commit identity set locally
(`ChrisOptinet <chris@optinetsolutions.com>`), so commits here are attributed to Chris.

## Hardcoded prod references to repoint

These files carry the **prod** repo URL, the prod Supabase ref, or the prod VM IPs. Until they
point at SaaS resources (or the fleet exists), leave them — but they **must** be changed before
this stack does any real scraping, or staging could reach back into production. Found at fork
time (verify with a fresh grep for `Optinet-Solutions-AI/Google-Lead-Gen`, `veqfloktkejmyueskltp`,
`54.79.22.202`, `3.24.160.131`):

- `vm/README.md`, `vm/stag_render_worker.py` — VM deploy `BASE` URL → prod repo raw.githubusercontent
- `docs/runbook-novnc.md`, `docs/runbook-stag-render-worker.md`, `docs/runbook-multi-vm.md`
- `lib/interactive/signed-vnc-url.ts` — VM VNC host/IPs
- `supabase/migrations/20260526000000_interactive_checkpoint_vnc_host.sql`
- `app/(dashboard)/help/page.tsx`
- `scripts/monday/README.md`, `Lead Gen - Rebuild Task List.md`
- `scripts/qa/_pms-log-0729.ts`, `scripts/qa/_pms-log-0729-part2.ts`
- `Lead Generator _ Add data to SupaBase (Subflow).json`,
  `GoogleLeadGen/Lead Generator _ Add data to SupaBase (Subflow).json` (legacy n8n export)

## `.env.local` (not committed — gitignored)

Fill from the new Supabase project + fresh service accounts. **Never** point these at prod.
Real keys go in this file only; never in git or these docs.

```ini
# --- New Supabase project (zxxeuyixqnbwmnlvjkbr) ---
NEXT_PUBLIC_SUPABASE_URL=https://zxxeuyixqnbwmnlvjkbr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<new project anon key>
SUPABASE_SERVICE_ROLE_KEY=<new project service_role key>
SUPABASE_PROJECT_ID=zxxeuyixqnbwmnlvjkbr
SUPABASE_ACCESS_TOKEN=<personal access token for the NEW project's account>

# --- App / cron ---
CRON_SECRET=<new random secret>

# --- Scraper credentials (Phase 2 — keep OFF/stubbed in Phase 0) ---
# APIFY_TOKEN=...        # separate from prod
# GOLOGIN_API_TOKEN=...  # separate GoLogin account
# TWOCAPTCHA_API_KEY=... # separate
```
> The anon + service-role keys for the new project were provided at fork time — place them here
> when setting up the local run. They are **data-plane** keys (REST API); they **cannot** create
> the schema.

## Cloning the schema into the new project

**Goal:** reproduce the prod schema (structure only — **no data**) in `zxxeuyixqnbwmnlvjkbr`,
**minus** the 8 Monday mirror tables (and Monday-only functions).

**Status: DONE (2026-09-04).** Method used (no `pg_dump` needed — none installed): with a
Supabase personal access token for the new project's account, the repo's **164 migration
files** were replayed onto the new project via the Management API
(`POST /v1/projects/zxxeuyixqnbwmnlvjkbr/database/query`). 4 migrations failed on **schema
drift** — 15 columns + 3 functions that prod added *live* and never wrote to a migration
(`created_by_is_shadow`, `created_by_email`, twitch `brand`/`s_tag`/`is_new_lead_candidate`,
etc.). Those columns were pulled from prod (`format_type` + `pg_get_expr`) and applied, then the
4 migrations re-ran clean. Result: **38 tables, 90 functions, full parity with prod** (0 missing
cols/fns). Then the 8 Monday tables were dropped (below) and prod config cleared.

> **Drift note for the SaaS migrations:** the from-files build needs those 15 live-only columns
> to exist. If you ever rebuild from scratch, add them before migrations `20260528220000`,
> `20260528230000`, `20260628000000`, `20260805150000`, or fold them into a new migration.

**Still TODO (code refactor, not DB):** remove the Monday-only *functions*
(`search_website_on_monday`, `mark_monday_duplicates_for_job`, `rematch_monday_*`,
`inherit_monday_data_for_lead`, …) and edit the Monday step out of `complete_scrape_job`. The
tables are already gone; these functions are now dead code (plpgsql is late-binding, so they
didn't break anything, but they'll error if called).

**Monday drop list** (run after migrations apply):
```sql
drop table if exists
  leads_table, leads_updates_table,
  affiliates_table, affiliates_updates_table,
  not_relevant_leads_table, not_relevant_leads_updates_table,
  email_undelivered_leads_table, email_undelivered_leads_updates_table cascade;
-- also drop Monday-only functions: search_website_on_monday, mark_monday_duplicates_for_job,
-- rematch_monday_*, inherit_monday_data_for_lead, etc. Then edit complete_scrape_job to remove
-- its Monday step. (plpgsql is late-binding, so dropping tables won't break other DDL, only
-- runtime calls — which the SaaS won't make.)
```

## Running it (Phase 0)

```bash
cd c:/Users/Chris-Optinet/lead-enrichment-platform
npm install
# create .env.local (above) pointing at the NEW Supabase
# clone the schema first (see above) — the app needs the tables to boot
npm run dev
```
Keep the scraper **off/stubbed** in Phase 0 — you're validating the app + tenancy layer, not
scraping. No VM fleet is required to build and test multi-tenancy with seed data.
