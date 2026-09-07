-- ============================================================================
-- Property-management prospect view over the Airbnb harvest.
--
-- A PM prospect = an Airbnb host with 1-4 listings whose name reads as a
-- PERSON, not a lettings brand — i.e. a self-managing owner who could buy
-- property management. Hosts with 5+ listings or agency-style names are
-- competitors/pros and are filtered out. `purest` marks 1-2-listing hosts
-- (the most clearly self-managed). Live view: recomputes as airbnb_listings
-- grows with each harvest.
-- ============================================================================
create or replace view public.airbnb_pm_prospects as
select
  host_id,
  max(host_name)                        as host_name,
  count(*)::int                         as listings_count,
  (count(*) <= 2)                       as purest,
  array_agg(distinct locality)          as localities,
  (array_agg(url order by id))[1]       as sample_listing_url,
  'https://www.airbnb.com/users/show/' || host_id as host_profile_url
from public.airbnb_listings
where host_id is not null and host_id <> '' and host_name is not null
group by host_id
having count(*) <= 4
  and max(host_name) !~* '\y(malta|gozo|estates?|propert(y|ies)|homes?|rentals?|lets|letting(s)?|group|ltd|limited|keys|stays?|host(s|ing)?|management|realty|apartments?|suites?|boutique|collection|getaways?|bnb|airbnb|villas?|residences?|holiday(s)?|accommodation)\y'
  and max(host_name) !~* '(shortlets|quicklets|holidaylets|maltastay|staymalta)';

notify pgrst, 'reload schema';
