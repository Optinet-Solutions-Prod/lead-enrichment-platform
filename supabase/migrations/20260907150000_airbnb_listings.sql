-- ============================================================================
-- Airbnb Malta listings harvest + cross-match against property_leads.
--
-- airbnb_listings is filled from an Apify airbnb-scraper run (Malta + Gozo).
-- property_leads gains two nullable columns recording a match: the Airbnb
-- listing URL and the basis of the match ('licence' = Malta tourism licence
-- number seen on both sides; 'name+locality' = host first name equals the
-- lead's owner first name in the same locality — a CANDIDATE, not proof).
-- ============================================================================

create table if not exists public.airbnb_listings (
  id          bigint generated always as identity primary key,
  airbnb_id   text unique,
  url         text,
  title       text,
  host_name   text,
  host_id     text,
  locality    text,
  licence_no  text,
  price_text  text,
  lat         double precision,
  lng         double precision,
  room_type   text,
  raw         jsonb,
  scraped_at  timestamptz not null default now()
);
create index if not exists airbnb_listings_locality_idx on public.airbnb_listings (locality);

alter table public.property_leads add column if not exists airbnb_url text;
alter table public.property_leads add column if not exists airbnb_match_basis text;

notify pgrst, 'reload schema';
