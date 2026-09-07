-- ============================================================================
-- Multi-site Malta property-owner lead collection (one-off harvest, SaaS line).
--
-- One row per listing/establishment lead harvested from a Malta property
-- source (maltapark, propertiesfromowner, dar.mt, timesofmalta, MTA licence
-- register, …). Populated by scripts/property/* collection runs — NOT wired
-- into scrape_queue; a future milestone can promote recurring sources to
-- proper engines the way maltapark was.
-- ============================================================================

create table if not exists public.property_leads (
  id            bigint generated always as identity primary key,
  source_site   text not null,                 -- registrable domain, e.g. 'dar.mt'
  listing_url   text,
  title         text,
  price_text    text,
  location      text,
  owner_name    text,
  contact_phone text,
  contact_email text,
  contact_type  text check (contact_type in ('owner','agency','unknown')) default 'unknown',
  keyword       text default 'properties in malta',
  notes         text,
  scraped_at    timestamptz not null default now()
);

create unique index if not exists property_leads_site_url_uidx
  on public.property_leads (source_site, listing_url)
  where listing_url is not null;
create index if not exists property_leads_site_idx on public.property_leads (source_site);

notify pgrst, 'reload schema';
