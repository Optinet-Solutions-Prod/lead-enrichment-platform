-- Inline scrape runner + in-app enrichment worker.
--
-- This deployment has no browser fleet (the prod repo's scraper.py / GoLogin
-- VMs). Google jobs run on Apify's google-search-scraper, started from the
-- app, and enrichment fetches (affiliate detection, contact extraction) run
-- inside the app on each /api/scrape/tick. See lib/scrape/runner.ts.

-- 1. Platform secrets — service-role only. system_settings is readable by
--    every signed-in user through get_system_setting(), so a platform API
--    token must not live there.
create table if not exists public.platform_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_secrets enable row level security;
revoke all on public.platform_secrets from anon, authenticated;
grant select, insert, update, delete on public.platform_secrets to service_role;

-- 2. Runner bookkeeping on the queue.
alter table public.scrape_queue
  add column if not exists runner_run_id            text,
  add column if not exists runner_dataset_id        text,
  add column if not exists auto_stages              jsonb,
  add column if not exists auto_contact_enqueued_at timestamptz;

create index if not exists idx_scrape_queue_runner_running
  on public.scrape_queue (started_at)
  where status = 'running' and runner_run_id is not null;

-- 3. Countries. scrape_queue.country_code still references gologin_profiles,
--    so every country the Apify actor can search needs a row here. The
--    placeholder profile id says which runner owns it; no browser exists.
insert into public.gologin_profiles
  (country_code, country_name, gologin_profile_id, is_active, languages, requires_google_login, is_google_logged_in)
values
  ('GB', 'United Kingdom',        'apify-google', true, array['en'],             false, false),
  ('US', 'United States',         'apify-google', true, array['en','es'],        false, false),
  ('IE', 'Ireland',               'apify-google', true, array['en'],             false, false),
  ('MT', 'Malta',                 'apify-google', true, array['en','mt'],        false, false),
  ('DE', 'Germany',               'apify-google', true, array['de','en'],        false, false),
  ('AT', 'Austria',               'apify-google', true, array['de','en'],        false, false),
  ('CH', 'Switzerland',           'apify-google', true, array['de','fr','it','en'], false, false),
  ('FR', 'France',                'apify-google', true, array['fr','en'],        false, false),
  ('IT', 'Italy',                 'apify-google', true, array['it','en'],        false, false),
  ('ES', 'Spain',                 'apify-google', true, array['es','en'],        false, false),
  ('PT', 'Portugal',              'apify-google', true, array['pt','en'],        false, false),
  ('NL', 'Netherlands',           'apify-google', true, array['nl','en'],        false, false),
  ('BE', 'Belgium',               'apify-google', true, array['nl','fr','en'],   false, false),
  ('SE', 'Sweden',                'apify-google', true, array['sv','en'],        false, false),
  ('NO', 'Norway',                'apify-google', true, array['no','en'],        false, false),
  ('DK', 'Denmark',               'apify-google', true, array['da','en'],        false, false),
  ('FI', 'Finland',               'apify-google', true, array['fi','sv','en'],   false, false),
  ('PL', 'Poland',                'apify-google', true, array['pl','en'],        false, false),
  ('CZ', 'Czechia',               'apify-google', true, array['cs','en'],        false, false),
  ('HU', 'Hungary',               'apify-google', true, array['hu','en'],        false, false),
  ('RO', 'Romania',               'apify-google', true, array['ro','en'],        false, false),
  ('GR', 'Greece',                'apify-google', true, array['el','en'],        false, false),
  ('TR', 'Turkey',                'apify-google', true, array['tr','en'],        false, false),
  ('CA', 'Canada',                'apify-google', true, array['en','fr'],        false, false),
  ('AU', 'Australia',             'apify-google', true, array['en'],             false, false),
  ('NZ', 'New Zealand',           'apify-google', true, array['en'],             false, false),
  ('BR', 'Brazil',                'apify-google', true, array['pt','en'],        false, false),
  ('MX', 'Mexico',                'apify-google', true, array['es','en'],        false, false),
  ('IN', 'India',                 'apify-google', true, array['en','hi'],        false, false),
  ('JP', 'Japan',                 'apify-google', true, array['ja','en'],        false, false),
  ('AE', 'United Arab Emirates',  'apify-google', true, array['en','ar'],        false, false),
  ('ZA', 'South Africa',          'apify-google', true, array['en'],             false, false)
on conflict (country_code) do update set
  country_name       = excluded.country_name,
  gologin_profile_id = excluded.gologin_profile_id,
  is_active          = true,
  languages          = excluded.languages,
  updated_at         = now();

-- 4. Runner settings (admin System page can change them).
insert into public.system_settings (key, value) values
  ('apify_google_max_pages', '2'::jsonb),
  ('inline_runner_enabled',  'true'::jsonb)
on conflict (key) do nothing;

-- 5. Data fix: the old enqueue split every Google batch into an Apify
--    organic job plus a VM-only PPC job. Nothing here can run the VM half,
--    and Apify returns paid results inside the organic job anyway.
update public.scrape_queue
set status        = 'cancelled',
    error_message = 'The PPC pass needs the browser fleet, which is not connected to this deployment. Paid results arrive with the Google job.',
    updated_at    = now()
where scrape_source = 'vm'
  and status = 'pending';

notify pgrst, 'reload schema';
