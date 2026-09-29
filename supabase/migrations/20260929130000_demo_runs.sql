-- ============================================================================
-- Public landing-page demo (2026-09-29): a visitor runs one real Google
-- scrape (1 page, 1 country) without an account, the app opens the top
-- results, classifies them and pulls contacts, and the page shows the
-- outcome. Runs live here, never in the org tables: no workspace, no
-- quota, no credits. Service-role only.
-- ============================================================================
create table if not exists public.demo_runs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  ip_hash       text,
  keyword       text not null,
  country_code  text not null,
  language      text not null default 'en',
  status        text not null default 'searching'
                check (status in ('searching', 'enriching', 'done', 'failed')),
  apify_run_id  text,
  dataset_id    text,
  results       jsonb not null default '[]'::jsonb,
  total         integer not null default 0,
  enriched      integer not null default 0,
  lock_until    timestamptz,
  error         text
);
create index if not exists demo_runs_ip_idx      on public.demo_runs (ip_hash, created_at desc);
create index if not exists demo_runs_created_idx on public.demo_runs (created_at desc);
alter table public.demo_runs enable row level security;  -- deny-all: service-role only

-- Abuse limits (admin-editable). A demo costs one Apify page plus a few
-- HTTP fetches, so the caps are generous for humans and tight for scripts.
insert into public.system_settings (key, value) values
  ('demo_enabled',         'true'::jsonb),
  ('demo_per_ip_per_hour', '3'::jsonb),
  ('demo_per_day',         '120'::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
