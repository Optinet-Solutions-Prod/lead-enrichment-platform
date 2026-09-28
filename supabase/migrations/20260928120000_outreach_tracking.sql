-- ============================================================================
-- Outreach tracking (2026-09-28): the product is "lead → outreach → monitor",
-- not scraping. Both lead objects get the same small outreach record so an
-- operator can mark who was contacted, what happened, and when to follow up —
-- and the home page can surface follow-ups that are due.
--   property_leads    — Malta owner leads (property vertical)
--   website_profiles  — partner / publisher sites (discovery vertical)
-- ============================================================================

do $$ begin
  create type public.outreach_status as enum ('new', 'contacted', 'replied', 'won', 'not_now', 'lost');
exception when duplicate_object then null; end $$;

alter table public.property_leads
  add column if not exists outreach_status      public.outreach_status not null default 'new',
  add column if not exists contacted_at         timestamptz,
  add column if not exists next_follow_up_at    date,
  add column if not exists outreach_note        text,
  add column if not exists outreach_updated_at  timestamptz,
  add column if not exists outreach_updated_by  text;

create index if not exists idx_property_leads_follow_up
  on public.property_leads (org_id, next_follow_up_at)
  where next_follow_up_at is not null and outreach_status not in ('won', 'lost');

create index if not exists idx_property_leads_outreach_status
  on public.property_leads (org_id, outreach_status);

alter table public.website_profiles
  add column if not exists outreach_status      public.outreach_status not null default 'new',
  add column if not exists contacted_at         timestamptz,
  add column if not exists next_follow_up_at    date,
  add column if not exists outreach_note        text,
  add column if not exists outreach_updated_at  timestamptz,
  add column if not exists outreach_updated_by  text;

create index if not exists idx_website_profiles_follow_up
  on public.website_profiles (next_follow_up_at)
  where next_follow_up_at is not null and outreach_status not in ('won', 'lost');

notify pgrst, 'reload schema';
