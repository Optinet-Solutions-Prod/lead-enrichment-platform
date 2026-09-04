# Inherited System Architecture

How the tool works today (single-tenant), so you know what you're converting. Verify against
current code before relying on any file path — this reflects the state at fork time (2026-09-04).

## Stack

- **Next.js 16** (App Router). Middleware file is **`proxy.ts`**, not `middleware.ts`.
  Breaking changes vs older Next — read `node_modules/next/dist/docs/` before writing Next code.
- **React 19**, **TypeScript**, **Tailwind v4**.
- **Supabase Postgres** as the database + auth. Business logic lives largely in
  **security-definer RPCs** (Postgres functions), called from server actions via `supabase.rpc()`.
- **Vercel** hosting + **Vercel Cron** hitting `app/api/scheduler/tick/route.ts` every minute
  (the "orchestrator": advances enrichment, fires scheduled scrapes, housekeeping sweeps).
- **VM scraper fleet** on AWS EC2 (see below).
- **Apify** actors for search scraping; **2Captcha** for captcha solving; **GoLogin/Orbita**
  for anti-detection browser profiles.

## The database (44 tables, 89 functions)

### Core pipeline tables (keep)
- **`google_lead_gen_table`** — the leads. One row per scraped result (organic or PPC).
  Central table; most enrichment columns hang off it (`is_affiliate`, `affiliate_checked_at`,
  `rooster_checked_at`, `is_on_monday`, `monday_*`, `contact_*`, `s_tag_*`, `result_type`,
  `country_code`, `keyword`, `scrape_job_id`, generated `body_domains`, etc.).
- **`scrape_queue`** — the job queue. VM/Apify workers claim jobs via `claim_scrape_job`.
  Columns include `keyword`, `country_code`, `pages`, `engine`, `scrape_source` (apify|vm),
  `result_type_filter` (PPC|Organic), `batch_group_id`, `with_enrichment`, `enrichment_status`,
  `scheduled_at`, `is_rerun`.
- **`enrichment_fetch_queue`** — per-lead enrichment fetch jobs (stages: affiliate, rooster,
  contact, s-tag). Processed by `enrichment_worker.py` on the VM.
- **`contact_table`, `s_tags_table`, `rooster_brands`** — enrichment reference/results.
- **`gologin_profiles`** — one GoLogin browser profile per country (`country_code`,
  `gologin_profile_id`, `is_active`, `requires_google_login`, `is_google_logged_in`,
  `languages`). **Finite, per-country — a key SaaS scaling constraint.**
- **`google_login_credentials`** — Google account creds per country for logged-in scraping.
- **`scheduled_keyword_sets` / `scheduled_keyword_items`** — cron-scheduled scrapes.
- **`interactive_checkpoints`** — human-in-the-loop captcha checkpoints (noVNC).
- **`active_profile_locks`** — PK on `country_code`; serializes same-country scrapes.
- **`system_settings`** — runtime toggles + some secrets (captcha solver on/off, etc.).
- **`user_profiles`, `activity_log`, `batch_counter`, `operator_domains_denylist`,
  `proxy_bandwidth_snapshots`, `qa_feedback`, `fetched_html_cache`.**

### Monday.com mirror tables (DROP for SaaS — not needed)
Mirrors of the operator's Monday.com CRM boards, used to match/dedupe leads against the CRM:
- `leads_table` + `leads_updates_table`
- `affiliates_table` + `affiliates_updates_table`
- `not_relevant_leads_table` + `not_relevant_leads_updates_table`
- `email_undelivered_leads_table` + `email_undelivered_leads_updates_table`

**Coupling to watch:** several functions reference these — e.g. `search_website_on_monday`,
`mark_monday_duplicates_for_job`, `rematch_monday_*`, `inherit_monday_data_for_lead`, and a
step inside **`complete_scrape_job`**. When Monday is dropped, those functions must be removed
or stubbed, and `complete_scrape_job`'s Monday step edited out. Monday matching is **not part
of the SaaS** — leads just won't be cross-checked against an external CRM.

### Social-scraper tables (keep — vertical-neutral value)
`fb_advertisers`/`fb_links`, `kick_streamers`/`kick_links`, `snapchat_creators`/`snapchat_links`,
`telegram_channels`/`telegram_links`, `tiktok_creators`/`tiktok_links`,
`twitch_streamers`/`twitch_links`, `x_creators`/`x_links`, `youtube_channels`/`youtube_channel_links`.
These back the social scrapers in `vm/*_search.py` / `vm/*_profile_scrape.py`.

## The scrape pipeline

1. **Enqueue** — `app/(dashboard)/scrape/actions.ts` inserts into `scrape_queue`.
   Google splits into **two sibling jobs** sharing a `batch_group_id`: an **Apify organic** job
   (`scrape_source='apify'`, `result_type_filter='Organic'`) and a **VM PPC** job
   (`scrape_source='vm'`, `result_type_filter='PPC'`). Bing is a single Apify job. The UI merges
   the siblings back into one row (organic shows immediately, PPC status trails).
2. **Claim** — VM `worker.py` (or the Apify path) calls `claim_scrape_job`
   (respects `scheduled_at`, `active_profile_locks` by country).
3. **Scrape** — VM runs `scraper.py` (Selenium + GoLogin/Orbita + 2Captcha), or an Apify actor
   (`apify~google-search-scraper`, `tri_angle~bing-search-scraper`). Apify→VM fallback exists.
4. **Store** — results land in `google_lead_gen_table`.

### Why Google PPC uses the VM (important, don't re-investigate)
Apify can't read Google's ad markup, so Google PPC is scraped by the VM. **BUT** Google gates
gambling/casino ads away from the VM's datacenter/proxy IP — confirmed 2026-08-19 the VM gets
**0 Google casino ads even when logged in** (`deep_aclk=0`). That's expected, not a bug. Bing
(via Apify) is the real casino-PPC source. Non-gambling verticals may still get Google ads.

## The enrichment chain

- On scrape completion, **`complete_scrape_job`** runs (Monday match [being removed],
  memory inheritance, override carry-forward).
- **`advance_enrichment_chain`** (called by the scheduler tick) orchestrates stages:
  `affiliate_running` → `all_running` (rooster) → `complete`.
- **Contact + s-tag are operator-triggered (manual)** — the chain intentionally **stops at
  rooster**. (Fixed 2026-09-01, migration `20260901120000` — before that it stalled forever
  waiting on the manual stages. See that migration for the exact logic; the "done" check is
  lenient: a stage is done once nothing is actively fetching a lead.)
- **`enrichment_worker.py`** on the VM processes `enrichment_fetch_queue`. Failures are mostly
  dead target sites + occasional GoLogin/Orbita launch flakiness; a healthy run is ~85–90%.

## The VM fleet (AWS EC2)

- **VM1** public `54.79.22.202` / private `ip-172-31-29-133`; **VM2** public `3.24.160.131` /
  private `ip-172-31-4-148`.
- Per-port workers on `9222–9227`, each pinned to X display `:N` where **N = port − 9220**
  (9222→:2 … 9227→:7). systemd units: `scrape-worker@<port>`, `enrichment-worker@<port>`,
  `xvnc-scrape@<N>`, `websockify-<port>`. noVNC web port = `6<port−3000>` (9222→6222).
- Only a few files live on the VM (`~/scraper.py`, `~/worker.py`, `~/kill_gologin.py`,
  systemd units, `~/.env`); they're pulled by curl from the repo's `main`. See `vm/README.md`.
- **GoLogin constraint:** one profile per country; a profile can't run in two Orbita instances
  at once. A SaaS staging fleet needs its **own GoLogin account/profiles + proxies**.

## Gotchas learned the hard way

- **Applying DDL:** prod has no `DATABASE_URL`; DDL is applied via the **Supabase Management
  API** (`POST /v1/projects/{ref}/database/query`, Bearer PAT). After creating functions,
  `NOTIFY pgrst, 'reload schema'` so PostgREST sees them. `CREATE INDEX CONCURRENTLY` works via
  the Management API (not tx-wrapped).
- **supabase-js:** call `.select()` before `.gte()/.eq()` filters or they silently fail.
- **dotenv:** load with `config({ path: '.env.local', quiet: true })` or the banner leaks into
  captured env vars.
- **libphonenumber:** default entry throws under `tsx`; use `/core` + explicit
  `metadata.min.json`.
