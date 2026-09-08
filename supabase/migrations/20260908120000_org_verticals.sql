-- ============================================================================
-- Verticals become organizations (2026-09-08).
--
-- Three orgs, all owned by admin@optinetsolutions.com until ownership
-- transfer exists:
--   * Property Management  — owns the harvested property data; module
--     'property'. Backdated membership so it is admin's ACTIVE org (the JWT
--     hook and app context pick the EARLIEST membership; no switcher yet).
--   * Optinet Solutions    — already existed (created via /welcome); the
--     platform org; sees both modules.
--   * Rooster Partners     — the affiliate vertical's future home; module
--     'affiliate'.
--
-- Data homing: property_leads + airbnb_listings gain NOT NULL org_id
-- (existing rows stamped to Property Management); airbnb_pm_prospects is
-- rebuilt per-org. hfps_register stays GLOBAL — it is a public government
-- register (reference data), duplicating it per org would be wrong.
-- ============================================================================

alter table public.org_settings
  add column if not exists enabled_modules text[] not null default '{property}';

do $$
declare
  v_admin uuid;
  v_pm    uuid;
  v_rp    uuid;
begin
  select id into v_admin from auth.users where email = 'admin@optinetsolutions.com';
  if v_admin is null then
    raise exception 'admin@optinetsolutions.com not found — seed the admin first';
  end if;

  -- Property Management (admin's active org: earliest joined_at)
  insert into public.organizations (name, slug, created_by)
  values ('Property Management', 'property-management', v_admin)
  on conflict (slug) do nothing;
  select id into v_pm from public.organizations where slug = 'property-management';
  insert into public.org_members (org_id, user_id, role, joined_at)
  values (v_pm, v_admin, 'owner', '2026-09-01T00:00:00Z')
  on conflict (org_id, user_id) do nothing;
  insert into public.org_settings (org_id, enabled_modules)
  values (v_pm, '{property}')
  on conflict (org_id) do update set enabled_modules = '{property}';

  -- Rooster Partners (affiliate vertical shell)
  insert into public.organizations (name, slug, created_by)
  values ('Rooster Partners', 'rooster-partners', v_admin)
  on conflict (slug) do nothing;
  select id into v_rp from public.organizations where slug = 'rooster-partners';
  insert into public.org_members (org_id, user_id, role, joined_at)
  values (v_rp, v_admin, 'owner', now())
  on conflict (org_id, user_id) do nothing;
  insert into public.org_settings (org_id, enabled_modules)
  values (v_rp, '{affiliate}')
  on conflict (org_id) do update set enabled_modules = '{affiliate}';

  -- Optinet Solutions: platform org sees both verticals
  update public.org_settings
  set enabled_modules = '{property,affiliate}'
  where org_id = (select id from public.organizations where slug = 'optinet-solutions');

  -- Home the harvested property data to Property Management
  alter table public.property_leads
    add column if not exists org_id uuid references public.organizations(id) on delete cascade;
  alter table public.airbnb_listings
    add column if not exists org_id uuid references public.organizations(id) on delete cascade;
  update public.property_leads  set org_id = v_pm where org_id is null;
  update public.airbnb_listings set org_id = v_pm where org_id is null;
end $$;

alter table public.property_leads  alter column org_id set not null;
alter table public.airbnb_listings alter column org_id set not null;
create index if not exists property_leads_org_idx  on public.property_leads (org_id);
create index if not exists airbnb_listings_org_idx on public.airbnb_listings (org_id);

-- RLS: org members read their org's rows; the register reads for everyone
-- signed in (service role bypasses as usual for the app's writes).
alter table public.property_leads  enable row level security;
alter table public.airbnb_listings enable row level security;
alter table public.hfps_register   enable row level security;

drop policy if exists property_leads_member_read on public.property_leads;
create policy property_leads_member_read on public.property_leads
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists airbnb_listings_member_read on public.airbnb_listings;
create policy airbnb_listings_member_read on public.airbnb_listings
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists hfps_register_authenticated_read on public.hfps_register;
create policy hfps_register_authenticated_read on public.hfps_register
  for select to authenticated using (true);

-- Rebuild the prospects view per-org (column set changes → drop + create)
drop view if exists public.airbnb_pm_prospects;
create view public.airbnb_pm_prospects as
select
  org_id,
  host_id,
  max(host_name)                        as host_name,
  count(*)::int                         as listings_count,
  (count(*) <= 2)                       as purest,
  array_agg(distinct locality)          as localities,
  (array_agg(url order by id))[1]       as sample_listing_url,
  'https://www.airbnb.com/users/show/' || host_id as host_profile_url
from public.airbnb_listings
where host_id is not null and host_id <> '' and host_name is not null
group by org_id, host_id
having count(*) <= 4
  and max(host_name) !~* '\y(malta|gozo|estates?|propert(y|ies)|homes?|rentals?|lets|letting(s)?|group|ltd|limited|keys|stays?|host(s|ing)?|management|realty|apartments?|suites?|boutique|collection|getaways?|bnb|airbnb|villas?|residences?|holiday(s)?|accommodation)\y'
  and max(host_name) !~* '(shortlets|quicklets|holidaylets|maltastay|staymalta)';

notify pgrst, 'reload schema';
