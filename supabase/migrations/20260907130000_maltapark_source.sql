-- ============================================================================
-- Maltapark scrape source (SaaS-only; classifieds marketplace, Malta).
--
-- Engine 'maltapark' runs on the VM worker as a PLAIN-HTTP scraper
-- (vm/maltapark_search.py) — no GoLogin/Chromium involved. Search endpoint:
--   GET https://www.maltapark.com/search?c=s1&search=<keyword>&page=<n>
-- Listing cards carry data-itemid + /item/details/<id> links (server-rendered).
--
-- The MT gologin_profiles row exists only to satisfy the enqueue-side
-- country validation + FK; its gologin_profile_id is a placeholder that no
-- code path ever launches (the maltapark worker branch skips GoLogin).
-- ============================================================================

alter table public.scrape_queue drop constraint if exists scrape_queue_search_engine_check;
alter table public.scrape_queue add constraint scrape_queue_search_engine_check
  check (search_engine in (
    'google','bing','youtube','twitch','kick','x','facebook','tiktok',
    'snapchat','telegram','maltapark'
  ));

create table if not exists public.maltapark_listings (
  id            bigint generated always as identity primary key,
  listing_id    bigint not null unique,
  scrape_job_id uuid references public.scrape_queue(id) on delete set null,
  keyword       text,
  title         text,
  url           text not null,
  price_text    text,
  thumbnail_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists maltapark_listings_job_idx
  on public.maltapark_listings (scrape_job_id);

-- Malta country row (placeholder profile id — see header comment).
insert into public.gologin_profiles
  (country_code, country_name, gologin_profile_id, is_active, languages)
values
  ('MT', 'Malta', 'maltapark-http-only', true, array['en'])
on conflict (country_code) do nothing;

notify pgrst, 'reload schema';
