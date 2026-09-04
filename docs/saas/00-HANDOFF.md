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
- ⏳ **Schema clone into the new project: PENDING** — blocked on a Supabase access token (or
  DB password) for the new project's account. Plan is documented in
  `03-ENV-AND-ISOLATION.md` → "Cloning the schema".
- ⬜ Not started: `.env.local`, local run, org/tenancy model, RLS, removing Monday, outreach.

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
