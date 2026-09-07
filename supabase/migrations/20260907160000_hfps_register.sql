-- ============================================================================
-- MTA HFPS register (Holiday Furnished Premises — every legally licensed
-- short-let address in Malta + Gozo, from mta.com.mt/licences/csv/hfps-*.csv).
-- Used to cross-match property_leads addresses: a hit means the property is
-- licensed to operate as a holiday let (i.e. Airbnb/Booking-style rental).
-- ============================================================================
create table if not exists public.hfps_register (
  ref           text primary key,
  island        text,
  establishment text,
  house_no      text,
  street        text,
  town          text,
  bedrooms      integer,
  beds          integer,
  full_name     text
);
create index if not exists hfps_register_town_idx on public.hfps_register (town);

alter table public.property_leads add column if not exists hfps_licence text;

notify pgrst, 'reload schema';
