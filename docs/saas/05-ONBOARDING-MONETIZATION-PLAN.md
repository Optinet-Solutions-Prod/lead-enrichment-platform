# Onboarding → Monetization: research + proposal (2026-09-10)

Status: **PROPOSAL — nothing here is built yet.** Stripe checkout is pending (keys), so
this maps the whole journey around it: registration → guided first value → top-up →
promo, plus the platform-admin levers (disable pricing, gift credits), a mobile-first
pass, and help + notifications. Each section ends with a concrete build recommendation.

---

## 1. What exists today (grounding)

| Stage | Today |
|---|---|
| Registration | `/signup` (email+password; **email confirmation ON but no SMTP** — real signups would stall), invite path bypasses confirmation |
| Workspace | `/welcome` bare create-org form; new orgs get modules `['property']`, **100 free credits** |
| First value | `/property-scrape` hub with Meny-plan stepper + tiered source form; runs debit credits |
| Tour | none (legacy `/onboarding` checklist is affiliate-era, localStorage-based, hidden) |
| Top-up | `/settings/billing`: balance, price list, ledger, admin manual grant; **"Buy credits — coming soon"** |
| Promo | none |
| Currency | credits only; no money shown anywhere |
| Admin levers | grant credits to **own active org only**; no way to disable pricing |
| Mobile | sidebar has a mobile drawer; tables scroll horizontally; never audited end-to-end |
| Help | PageIntro "About this data" per page; `/help` + `/onboarding` hidden (stale affiliate content) |
| Notifications | none |

---

## 2. The proposed journey, end to end

```
Land → Sign up → Confirm email → Create workspace (pick vertical)
  → Welcome tour (interactive, skippable)  → Getting-started checklist
  → First scrape on free credits (aha: real owner leads with phones)
  → Low-balance nudges → Top-up page (packs, EUR/$, promo code) → Pay (Stripe)
  → Ongoing: notifications bell + help menu keep them oriented
```

### 2.1 Registration

Keep the current shape, fix two gaps:

1. **SMTP before launch.** Confirmation emails currently have no sender. Recommend
   **Resend** (3k emails/mo free, 5-min Supabase SMTP setup) — also unlocks invite
   emails, welcome email, and low-balance emails later. Alternative: toggle "Confirm
   email" off until launch (weaker, but zero-cost).
2. **Vertical choice at org creation.** `/welcome` gains one radio: *"What are you here
   for?"* → **Property owner leads** (default) / **Affiliate scraping** → sets
   `enabled_modules`. One decision, right nav from minute one.
3. Surface the gift: "Your workspace starts with **100 free credits** — enough for ~50
   scrape runs or a full pilot batch." on the welcome screen + first notification.

### 2.2 Interactive tour (step-by-step, skippable)

**Library research** (React 19 / Next 16 App Router compatibility):

| Library | Size (gz) | Verdict |
|---|---|---|
| **driver.js** ⭐ | ~5 KB | Framework-agnostic, MIT, works in a `'use client'` component, no deps, mobile-safe positioning. **Recommended.** |
| react-joyride v3 | ~34 KB+ | Supports React 16.8–19, but heavier and historically brittle across React majors |
| Onborda / NextStepjs | ~45 KB | Purpose-built for App Router but drags in Framer Motion; oriented at shadcn stacks (we use plain Tailwind v4) |
| Intro.js | ~10 KB | AGPL/commercial license — avoid |

**Design:**

- `TourProvider` client component mounted in the dashboard shell; steps target stable
  `data-tour="..."` attributes (survive refactors better than CSS selectors).
- **Per-module scripts.** Property tour (7 steps): workspace switcher → Collect Data
  tiers → credits chip ("runs cost credits — you have 100 free") → Run button →
  Owner Leads → Workflows → Billing & Help. Affiliate orgs get their own short script.
- **Skip everywhere** ("Skip tour" on every step), Back/Next, progress dots.
- **State in DB, not localStorage:** `user_profiles.tour_state jsonb`
  (`{version, completedAt|skippedAt, step}`) — survives devices; bump `version` to
  re-offer after big UI changes. "Restart tour" lives in the Help menu.
- Auto-start only on the **first** dashboard visit after org creation; never interrupt
  invited members mid-task (offer a dismissible "Take the 60-second tour?" toast instead).

### 2.3 Getting-started checklist (the activation driver)

Tours show *where*; checklists make people *do*. Replace the legacy `/onboarding` with a
**server-computed** checklist card on the home page (collapsible, auto-hides when done):

- ☐ Run your first scrape *(property_leads count > 0)*
- ☐ Open your Owner Leads and flag one to contact *(page visit / first filter use)*
- ☐ Save a Workflow *(org_recipes ≥ 1)*
- ☐ Invite a teammate *(org_members ≥ 2 or invite created)*
- ☐ Connect an integration (Apify) *(org_integrations ≥ 1)*
- ☐ Top up credits *(first purchase — appears once billing is live)*

All computed from real org state — no localStorage, no drift, and it doubles as our
activation metric per org.

### 2.4 Top-up + promo page

`/settings/billing` grows into the money page (billing stays in-app; a public marketing
`/pricing` page is a later, separate thing):

- **Credit packs** (cards): pick pack → Stripe Checkout (hosted page; zero PCI burden).
- **Currency toggle €/$** on the page; org's preference saved (`org_settings.currency`).
- **Promo code**: field on the page + `allow_promotion_codes: true` at Checkout so codes
  can also be entered on Stripe's page.
- **"Need it invoiced / custom volume?"** mailto link — B2B escape hatch, costs nothing.
- Low-balance triggers that lead here: banner when balance < 20 credits, and every
  insufficient-credits error already names this page.

---

## 3. Pricing (needs your sign-off — numbers are a proposal)

**Cost anchor:** normal source runs cost us ~nothing (serverless HTTP). The only real
marginal cost is the Airbnb crawl: **~$1 of Apify compute per ~300-listing run** (5 credits
today). Whatever the credit price, that run must clear ~€0.95.

**Proposed packs** (Stripe supports one Price with both currency options — the checkout
charges whichever the customer picked; coupons/promotion codes are multi-currency the
same way):

| Pack | Credits | EUR | USD | €/credit |
|---|---|---|---|---|
| Starter | 100 | **€25** | **$29** | 0.25 |
| Growth *(most popular)* | 500 | **€99** | **$115** | 0.198 |
| Scale | 2,000 | **€299** | **$345** | 0.15 |

- Free tier stays: 100 credits at signup (≈ €25 value — a real trial, costs us cents
  unless they burn it all on Airbnb).
- **Airbnb pricing fix:** at €0.15–0.25/credit, a 5-credit Airbnb run sells for
  €0.75–1.25 against ~€0.95 cost — break-even-ish. Recommend: **platform-key Airbnb runs
  cost 15 credits; orgs that connect their OWN Apify key keep paying 5** (their Apify
  bill, our small margin). This also quietly pushes serious users toward BYO keys —
  exactly the SaaS integrations model we built.
- Round USD prices set manually (not auto-FX) so they stay stable and charm-priced.
- Later (not now): monthly subscription tiers mapping to Meny's 3-tier plan, with
  credits included — packs first, they're the simplest thing that can take money.

**Stripe wiring when keys arrive:** 3 Products × 1 multi-currency Price each →
`checkout.sessions.create` (mode `payment`, `allow_promotion_codes`) from a server
action → webhook route `/api/stripe/webhook` verifies signature → `grant_credits(org,
credits, 'purchase', {session_id})` → notification "500 credits added". Idempotent by
session id. Works fine on Vercel Hobby (webhooks are plain POSTs).

---

## 4. Admin levers

1. **Disable pricing** — two independent switches:
   - **Global kill-switch** `system_settings.billing_enabled` (default **off** until
     Stripe is live): when off, the UI shows **no prices, no balance chips, no top-up** —
     runs don't debit. This is the "we put it to pending" mode, made explicit and
     reversible from an admin toggle instead of code changes.
   - **Per-org** `org_settings.billing_mode`: `'credits'` (normal) | `'unlimited'`
     (spend_credits short-circuits; badge "Unlimited plan" on the billing page). For
     pilots, partners, and your own three orgs.
2. **Gift credits to any org or user** — today's grant form only reaches the admin's
   active org. Upgrade: pick target by **org dropdown** (all orgs) *or* **user email
   lookup** (resolves to the orgs they belong to; you pick which). Ledger reason
   `gift`, and the org's members get a notification: *"You received 250 gift credits 🎁"*.
3. **Voucher codes (in-house, free credits)** — independent of Stripe, usable NOW:
   `credit_vouchers` table (code, credits, max_redemptions, expires_at, per-org-once)
   + "Redeem a code" box on the billing page → `grant_credits(..., 'voucher')`. This is
   your promo mechanism for launch/partners before payments even exist; Stripe
   promotion codes (percent/amount off paid packs) come with checkout later.

---

## 5. Mobile-first pass

The shell already has a mobile drawer and tables scroll horizontally, but the flow was
never audited. Concrete work list (audit at 390×844, iPhone-class):

- **Tap targets ≥ 44px** on: source checkboxes, member-row selects/buttons, bell items.
- **Sticky "Scrape selected sources" bar** on Collect Data (button drifts far below the
  fold under 4 fieldsets on mobile).
- Billing pack cards, recipe cards, checklist: single-column stacks (mostly free via
  existing `sm:` grids — verify each).
- File-upload inputs (YAML) are cramped — full-width on mobile.
- Tour: driver.js handles small-viewport popover repositioning; verify each step anchor
  is visible/scrolled-to on mobile.
- **Add a 390px viewport smoke pass**: extend `smoke-pages.ts` with a mobile
  user-agent/viewport render check, or a small Playwright script over the same PAGES
  list. Keeps mobile from regressing silently.

New surfaces from this plan (tour, checklist, bell, top-up) get built mobile-first.

---

## 6. Help + notifications

### Help
- **Help menu** (sidebar Account group + a `?` in the top bar): links to the rebuilt
  Help page, **Restart tour**, contact (mailto / WhatsApp deep link).
- **Rebuild `/help`** for the property vertical: the journey in 5 short sections
  (collect → leads → register/airbnb → prospects → workflows), the credit price list,
  YAML how-tos (link the two templates), FAQ. Un-hide it in the nav. The per-page
  "About this data" intros stay — they're the contextual layer.

### Notifications (in-app bell — no external service needed)
- **Table `notifications`**: `id, org_id, user_id, kind, title, body, href, created_at,
  read_at` (fan out one row per member on emit; RLS: owner-only rows).
- **Bell in the top bar** with unread badge (count fetched server-side with the layout;
  light 60s client poll while open — no websockets, Vercel-friendly).
- Dropdown: latest 20, click → `href` + mark read; "mark all read".
- **Emitters** (all server-side moments we already own): scrape/workflow run finished
  (with results summary), Airbnb ingest completed, credits low (< 20, once per
  crossing), gift/voucher credits received, purchase confirmed (later), member joined,
  ownership transferred.
- Email mirroring (Resend) later for: low balance, purchase receipt, member joined.

---

## 7. Build order + what I need from you

**Phase A — no dependencies, buildable now (~1–2 focused days):**
tour (driver.js) + getting-started checklist + help menu/rebuilt help + notifications
core (table, bell, first 5 emitters) + admin levers (global billing kill-switch,
per-org unlimited, gift-to-any-org, voucher codes) + `/welcome` vertical picker +
mobile audit fixes + 390px smoke pass. Billing UI honors the kill-switch (prices hidden
until you flip it on).

**Phase B — needs Stripe keys (~half day):**
products/prices (EUR+USD), Checkout server action, webhook → `grant_credits`,
promotion codes, purchase notifications/receipts. Flip `billing_enabled` on.

**Phase C — polish:** Resend SMTP (signup confirmations become reliable + all emails),
public `/pricing` marketing page, subscription tiers if packs prove out.

**Decisions needed from you:**
1. Pricing sign-off (pack sizes + the €25/€99/€299 ladder, USD points, 15-credit
   platform-key Airbnb rule) — or give me your numbers.
2. Stripe keys when ready (test keys first are fine — full flow works in test mode).
3. SMTP: OK to set up Resend on a domain you control (needs one DNS record)?
4. Default currency display: EUR (suggested — Malta-first) with $ toggle?

**Sources:** [driver.js / tour-library comparison](https://userorbit.com/blog/best-open-source-product-tour-libraries) ·
[App Router-compatible tour tools](https://usertourkit.com/blog/product-tour-tool-nextjs-app-router) ·
[React onboarding libraries 2026](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared) ·
[Stripe multi-currency Prices](https://docs.stripe.com/payments/checkout/multi-currency-prices) ·
[Stripe Checkout discounts/promotion codes](https://docs.stripe.com/payments/checkout/discounts) ·
[Stripe products & prices](https://docs.stripe.com/products-prices/manage-prices?dashboard-or-api=api)
