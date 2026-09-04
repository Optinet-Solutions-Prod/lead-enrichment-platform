# SaaS Conversion Plan

The strategy, the phasing, and the reasoning behind it. Decisions already made are marked ✅.

## The core problem

The inherited app is **deeply single-tenant**: every table assumes one organization's data,
one set of Monday boards (being removed), one GoLogin fleet, one set of API keys. Copying the
repo just gives a second single-tenant instance. The real work is adding a **tenant boundary**
through the whole stack, and turning the shared, finite, expensive scraper fleet into a
**metered multi-customer service**.

## Decisions made ✅

- **Convert a fork, never the live app.** Production keeps running untouched while we build.
- **De-risk cheap-first.** Clone code + DB schema (cheap) and prove multi-tenancy with seed
  data *before* rebuilding the expensive scraper fleet. The scraper fleet is plumbing we
  already know works; it is **not** where the SaaS risk lives.
- **Start B2B/managed** (a few onboarded pilot clients), get tenancy right, add self-serve later.
- **Vertical-neutral** positioning: scrape → enrich → outreach, any niche (not just casino).
- **Converge back to one codebase eventually.** The fork is a build/validate line; a permanent
  divergent fork is a maintenance tax. End state: one tenant-aware codebase where today's prod
  becomes "tenant #1."

## Where the real risk is

For a data SaaS, the failure that kills the product is **cross-tenant data leakage** — one
customer seeing another's leads. That is answered with **RLS + seed data and zero scrapers**.
Prove it first.

## Phases

### Phase 0 — Isolated clone (cheap, no prod risk)
- ✅ New private repo, full history, re-authored to Chris.
- ✅ New Supabase project (`zxxeuyixqnbwmnlvjkbr`).
- ⏳ Clone schema into it (no data; Monday dropped). *(blocked on new-account access — see
  `03-ENV-AND-ISOLATION.md`)*
- ⬜ New `.env.local` → new Supabase; run locally with the **scraper stubbed/off**.
- ⬜ Repoint the hardcoded prod references (list in `03`).
- **No AWS/VM fleet in this phase.**

### Phase 1 — Prove multi-tenancy (make-or-break)
- Add `organizations` + `memberships` (user↔org, roles: owner/operator/viewer).
- Add `org_id` to every domain table (`google_lead_gen_table`, `scrape_queue`,
  `enrichment_fetch_queue`, `gologin_profiles`, `scheduled_keyword_sets`, …).
- **Row-Level Security** on all of them, keyed to the caller's org.
- Rework the **89 security-definer RPCs** to filter by `org_id` (they assume global scope today
  — this is the bulk of the work).
- Auth + org management (signup, invite, roles, org switcher). Supabase Auth has the primitives.
- **Acceptance test:** log in as two fake orgs, confirm **zero** cross-tenant leakage.

### Phase 1.5 — Validate demand
Before spending on isolated infra + billing, land **one paying pilot**. The vertical has real
headwinds (below) — validate willingness-to-pay first.

### Phase 2 — Productionize (only after 1 + 1.5)
- Per-tenant config: API keys (bring-your-own **or** pooled+metered), quotas, allowed countries.
- **Isolated scraper fleet:** AMI → new AWS, its **own GoLogin account/profiles + proxies +
  2Captcha/Apify keys**. Extend `scrape_queue` with `org_id` + quotas/priority for fair-usage.
- Billing (Stripe or a gambling-friendly processor), usage metering, self-serve onboarding,
  marketing site, per-tenant observability + abuse controls.

## The hard part — the shared scraper fleet

VMs, one-GoLogin-profile-per-country, residential-proxy bandwidth, Apify, 2Captcha are
**finite, shared, expensive**. Two models (pick before pricing — this **is** the unit economics):
- **Pooled + fair-usage:** you own the fleet + cost; `scrape_queue` carries `org_id` + quotas;
  you price to cover it.
- **Bring-your-own-credentials:** each tenant plugs in their own GoLogin/Apify/proxy accounts;
  lower cost + legal exposure for you, more onboarding friction for them.

## Risks that bite a SaaS specifically (not an internal tool)

- **Scraping Google/Bing for resale** violates their ToS and is legally contested; as a paid
  product it's a bigger target, and it leans on a fragile anti-detection stack
  (GoLogin fingerprints, proxies, 2Captcha) that platforms actively fight.
- **Gambling vertical:** Stripe/PayPal, app stores, ad networks restrict casino-adjacent
  businesses — line up a permissive processor early (or lead with a non-gambling vertical).
- **Leads contain personal contact data** → as a SaaS you're a **data processor** for customers
  (GDPR/DPA, deletion, etc.).
- **Cost scales with usage** (proxies, GoLogin seats, VM fleet) — margins live or die on the
  fleet model above.

## Removing Monday (part of Phase 0/1 cleanup)

Monday.com CRM matching is **not** in the SaaS. Drop the 8 mirror tables + Monday-only
functions, and edit the Monday step out of `complete_scrape_job`. See `01-ARCHITECTURE.md` →
"Monday.com mirror tables" for the exact list and coupling.
