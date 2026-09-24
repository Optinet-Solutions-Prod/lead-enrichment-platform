-- ============================================================================
-- Port from Google-Lead-Gen (docs/for-saas-repo-2026-09-24.md §3, §9, §10):
-- website profiles + job-scoped dedupe. Monday.com stripped everywhere the
-- brief lists it; composed from prod's final definitions, not replayed in
-- sequence.
--
-- SaaS-specific decisions (differ from prod on purpose):
--   * enrichment chain keeps OUR terminus (stops at affiliate, 20260907120000)
--     — prod's chain_stops_at_rooster is not ported; Rooster is not a SaaS
--     stage, so complete_scrape_job queues no rooster re-checks either.
--     Rooster verdict COLUMNS stay on profiles (inert) so the sync trigger
--     and inherited lead columns stay symmetric with the lead table.
--   * the dedupe is JOB-scoped from day one (prod's 20260923120000 fix) —
--     prod's first all-time version hid every re-seen website's row.
--   * google_lead_gen_table is empty here, so the backfill is a no-op kept
--     only for correctness if this ever runs against data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Lead-domain functional index (prod 20260820150000). Without it
--    complete_scrape_job seq-scans the lead table per result and times out.
-- ---------------------------------------------------------------------------
create index if not exists idx_lead_norm_domain
  on public.google_lead_gen_table (normalize_domain(coalesce(domain, url)));

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.website_profiles (
  id                          bigint generated always as identity primary key,
  normalized_domain           text        not null unique,
  registered_domain           text        not null,
  brand_stem                  text,
  display_name                text,
  -- 'scrape' when a SERP result created it (prod also has 'monday').
  source                      text        not null default 'scrape',
  -- The one lead row that represents this website in the leads table.
  first_lead_id               bigint      references public.google_lead_gen_table(id) on delete set null,
  first_seen_at               timestamptz,
  last_seen_at                timestamptz,
  appearance_count            integer     not null default 0,
  -- Durable negatives
  is_not_relevant             boolean     not null default false,
  not_relevant_source         text,
  not_relevant_at             timestamptz,
  system_flag                 text,
  system_flag_source          text,
  system_flag_reason          text,
  system_flag_at              timestamptz,
  system_flag_checked_at      timestamptz,
  system_flag_llm_checked_at  timestamptz,
  system_flag_overridden_at   timestamptz,
  -- Verdicts (latest wins; an override always wins)
  is_affiliate                boolean,
  affiliate_confidence        text,
  affiliate_score             integer,
  affiliate_checked_at        timestamptz,
  affiliate_source            text,
  is_affiliate_overridden_at  timestamptz,
  is_rooster_partner          boolean,
  brand                       text,
  rooster_brands              jsonb,
  rooster_checked_at          timestamptz,
  rooster_source              text,
  is_rooster_overridden_at    timestamptz,
  has_contact_details         boolean,
  contact_checked_at          timestamptz,
  has_s_tags                  boolean,
  s_tags_checked_at           timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_website_profiles_registered   on public.website_profiles (registered_domain);
create index if not exists idx_website_profiles_brand_stem   on public.website_profiles (brand_stem) where brand_stem is not null;
create index if not exists idx_website_profiles_last_seen    on public.website_profiles (last_seen_at desc nulls last);
create index if not exists idx_website_profiles_system_flag  on public.website_profiles (system_flag) where system_flag is not null;
create index if not exists idx_website_profiles_unchecked    on public.website_profiles (created_at desc)
  where system_flag is null and system_flag_llm_checked_at is null and system_flag_overridden_at is null;

alter table public.website_profiles enable row level security;

create table if not exists public.website_appearances (
  id                    bigint generated always as identity primary key,
  profile_id            bigint      not null references public.website_profiles(id) on delete cascade,
  lead_id               bigint      references public.google_lead_gen_table(id) on delete set null,
  scrape_job_id         uuid,
  batch_id              bigint,
  keyword               text,
  country_code          text,
  search_engine         text,
  result_type           text,
  url                   text,
  page_number           integer,
  position_on_page      integer,
  overall_position      integer,
  seen_on               text,
  serp_screenshot_path  text,
  -- true when this sighting is the one that created the website's lead row
  created_lead          boolean     not null default false,
  seen_at               timestamptz not null default now()
);

create index if not exists idx_website_appearances_profile_seen on public.website_appearances (profile_id, seen_at desc);
create index if not exists idx_website_appearances_job          on public.website_appearances (scrape_job_id);
create index if not exists idx_website_appearances_batch        on public.website_appearances (batch_id);
create index if not exists idx_website_appearances_lead         on public.website_appearances (lead_id) where lead_id is not null;

alter table public.website_appearances enable row level security;

create table if not exists public.website_relations (
  id                  bigint generated always as identity primary key,
  profile_id          bigint      not null references public.website_profiles(id) on delete cascade,
  related_profile_id  bigint      not null references public.website_profiles(id) on delete cascade,
  -- same_registered_domain (other subdomain) | same_brand_stem (other TLD) | manual
  relation            text        not null,
  confidence          numeric(3,2) not null default 0.50,
  created_at          timestamptz not null default now(),
  constraint website_relations_distinct check (profile_id <> related_profile_id),
  constraint website_relations_ordered  check (profile_id < related_profile_id),
  unique (profile_id, related_profile_id, relation)
);

create index if not exists idx_website_relations_related on public.website_relations (related_profile_id);

alter table public.website_relations enable row level security;

-- Own-DB knowledge of websites that are obviously not affiliates. A lookup
-- table, not a pattern list — extend it from the admin side as we learn.
create table if not exists public.known_non_affiliate_domains (
  registered_domain text        primary key,
  category          text        not null,
  note              text,
  added_by          text        not null default 'seed',
  added_at          timestamptz not null default now()
);

alter table public.known_non_affiliate_domains enable row level security;

insert into public.known_non_affiliate_domains (registered_domain, category) values
  -- platforms / big tech
  ('google.com','platform'), ('youtube.com','platform'), ('apple.com','platform'), ('microsoft.com','platform'),
  ('amazon.com','platform'), ('amazon.co.uk','platform'), ('amazon.de','platform'), ('bing.com','search_engine'),
  ('yahoo.com','search_engine'), ('duckduckgo.com','search_engine'), ('cloudflare.com','platform'),
  ('wordpress.com','platform'), ('wordpress.org','platform'), ('blogspot.com','platform'), ('github.com','platform'),
  ('stackoverflow.com','platform'), ('imdb.com','platform'), ('netflix.com','platform'), ('ebay.com','platform'),
  ('shopify.com','platform'), ('wix.com','platform'), ('squarespace.com','platform'), ('godaddy.com','platform'),
  ('mozilla.org','platform'), ('adobe.com','platform'), ('oracle.com','platform'), ('ibm.com','platform'),
  ('salesforce.com','platform'), ('hubspot.com','platform'), ('mailchimp.com','platform'), ('zoom.us','platform'),
  ('slack.com','platform'), ('notion.so','platform'), ('trello.com','platform'), ('atlassian.com','platform'),
  ('dropbox.com','platform'), ('canva.com','platform'), ('archive.org','platform'),
  -- reference
  ('wikipedia.org','reference'), ('wikimedia.org','reference'), ('britannica.com','reference'), ('statista.com','reference'),
  ('investopedia.com','reference'), ('quora.com','reference'), ('trustpilot.com','reference'), ('glassdoor.com','reference'),
  ('indeed.com','reference'), ('crunchbase.com','reference'), ('similarweb.com','reference'), ('semrush.com','tool'),
  ('ahrefs.com','tool'),
  -- news
  ('bbc.co.uk','news'), ('bbc.com','news'), ('theguardian.com','news'), ('nytimes.com','news'), ('cnn.com','news'),
  ('reuters.com','news'), ('forbes.com','news'), ('bloomberg.com','news'), ('dailymail.co.uk','news'), ('telegraph.co.uk','news'),
  ('independent.co.uk','news'), ('mirror.co.uk','news'), ('thesun.co.uk','news'), ('express.co.uk','news'), ('metro.co.uk','news'),
  ('standard.co.uk','news'), ('sky.com','news'), ('itv.com','news'), ('channel4.com','news'), ('techcrunch.com','news'),
  ('wired.com','news'), ('theverge.com','news'), ('spiegel.de','news'), ('bild.de','news'), ('zeit.de','news'), ('faz.net','news'),
  ('welt.de','news'), ('sueddeutsche.de','news'), ('lemonde.fr','news'), ('lefigaro.fr','news'), ('elpais.com','news'),
  ('elmundo.es','news'), ('corriere.it','news'), ('repubblica.it','news'), ('nrk.no','news'), ('vg.no','news'), ('dn.se','news'),
  ('aftonbladet.se','news'), ('expressen.se','news'), ('nzz.ch','news'), ('srf.ch','news'), ('20min.ch','news'), ('orf.at','news'),
  ('derstandard.at','news'), ('krone.at','news'), ('rte.ie','news'), ('irishtimes.com','news'), ('independent.ie','news'),
  ('smh.com.au','news'), ('abc.net.au','news'), ('news.com.au','news'), ('nzherald.co.nz','news'), ('stuff.co.nz','news'),
  ('cbc.ca','news'), ('globalnews.ca','news'), ('nu.nl','news'), ('telegraaf.nl','news'), ('hs.fi','news'), ('yle.fi','news'),
  ('dr.dk','news'), ('bt.dk','news'),
  -- government / regulators / responsible gambling
  ('gov.uk','government'), ('europa.eu','government'), ('gamblingcommission.gov.uk','regulator'), ('mga.org.mt','regulator'),
  ('spelinspektionen.se','regulator'), ('kansspelautoriteit.nl','regulator'), ('adm.gov.it','regulator'), ('anj.fr','regulator'),
  ('gluecksspiel-behoerde.de','regulator'), ('spillemyndigheden.dk','regulator'), ('lotteritilsynet.no','regulator'),
  ('begambleaware.org','responsible_gambling'), ('gamcare.org.uk','responsible_gambling'), ('gamblersanonymous.org','responsible_gambling'),
  ('gamstop.co.uk','responsible_gambling'), ('gamblingtherapy.org','responsible_gambling'),
  -- payments
  ('paypal.com','payment'), ('stripe.com','payment'), ('visa.com','payment'), ('mastercard.com','payment'), ('skrill.com','payment'),
  ('neteller.com','payment'), ('trustly.com','payment'), ('klarna.com','payment'), ('paysafecard.com','payment'), ('revolut.com','payment')
on conflict (registered_domain) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Lead columns
-- ---------------------------------------------------------------------------

alter table public.google_lead_gen_table
  add column if not exists profile_id  bigint references public.website_profiles(id) on delete set null,
  add column if not exists system_flag text;

create index if not exists idx_leads_profile_id  on public.google_lead_gen_table (profile_id) where profile_id is not null;
create index if not exists idx_leads_system_flag on public.google_lead_gen_table (system_flag) where system_flag is not null;

-- ---------------------------------------------------------------------------
-- 3. Settings (admin control)
-- ---------------------------------------------------------------------------

insert into public.system_settings (key, value) values
  ('verdict_ttl_days',        '{"affiliate": 90, "rooster": 60, "contact": 180, "stags": 90}'::jsonb),
  ('recency_bands_days',      '{"fresh": 7, "recent": 30, "aging": 90}'::jsonb),
  ('profile_dedupe_enabled',  'true'::jsonb),
  ('system_flag_llm_enabled', 'false'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2b. What the search engine said about each result, and whether it is
--     relevant to the keyword (prod 20260921160000 §1). Relevance is per
--     (website, keyword) so it lives on the lead; the site description is
--     per website so it lives on the profile.
-- ---------------------------------------------------------------------------

alter table public.google_lead_gen_table
  add column if not exists serp_title              text,
  add column if not exists serp_description        text,
  add column if not exists is_relevant             boolean,
  add column if not exists relevance_reason        text,
  add column if not exists relevance_checked_at    timestamptz,
  add column if not exists relevance_source        text,
  add column if not exists relevance_overridden_at timestamptz;

create index if not exists idx_leads_relevance_pending
  on public.google_lead_gen_table (created_at desc)
  where is_relevant is null and is_not_relevant = false;

create index if not exists idx_leads_irrelevant
  on public.google_lead_gen_table (is_relevant)
  where is_relevant = false;

alter table public.website_profiles
  add column if not exists ai_site_description text,
  add column if not exists ai_site_category    text;

-- ---------------------------------------------------------------------------
-- 4. Relations: link a profile to hosts that share its registered domain
--    (subdomain variants) or its brand stem (TLD variants).
-- ---------------------------------------------------------------------------

create or replace function public.link_profile_relations(p_profile_ids bigint[])
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  v_m integer := 0;
begin
  if p_profile_ids is null or array_length(p_profile_ids, 1) is null then
    return 0;
  end if;

  -- Other hosts under the same registered domain. Social platforms and
  -- domains with more than 50 hosts (blog farms) are not linked — the
  -- relation would say nothing.
  insert into public.website_relations (profile_id, related_profile_id, relation, confidence)
  select distinct least(a.id, b.id), greatest(a.id, b.id), 'same_registered_domain', 0.80
  from public.website_profiles a
  join public.website_profiles b
    on b.registered_domain = a.registered_domain and b.id <> a.id
  where a.id = any(p_profile_ids)
    and a.registered_domain <> ''
    and not is_social_host(a.registered_domain)
    and (select count(*) from public.website_profiles c where c.registered_domain = a.registered_domain) <= 50
  on conflict do nothing;
  get diagnostics v_n = row_count;

  -- Same brand stem on another TLD (casinoreviews.com ↔ casinoreviews.co.uk).
  insert into public.website_relations (profile_id, related_profile_id, relation, confidence)
  select distinct least(a.id, b.id), greatest(a.id, b.id), 'same_brand_stem', 0.50
  from public.website_profiles a
  join public.website_profiles b
    on b.brand_stem = a.brand_stem
   and b.registered_domain <> a.registered_domain
  where a.id = any(p_profile_ids)
    and coalesce(a.brand_stem, '') <> ''
    and length(a.brand_stem) >= 12
    and (select count(*) from public.website_profiles c where c.brand_stem = a.brand_stem) <= 50
  on conflict do nothing;
  get diagnostics v_m = row_count;

  return v_n + v_m;
end;
$$;

grant execute on function public.link_profile_relations(bigint[]) to service_role;
revoke execute on function public.link_profile_relations(bigint[]) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. System flags from our own DB: operator denylist, social platforms,
--    known non-affiliate list. Mirrors onto the website's lead rows and
--    cancels enrichment that has not started. p_profile_ids null = every
--    profile not yet flagged.
-- ---------------------------------------------------------------------------

create or replace function public.apply_db_system_flags(p_profile_ids bigint[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_flagged bigint[];
begin
  perform set_config('app.skip_lead_profile_sync', '1', true);

  with cand as (
    select p.id, p.normalized_domain as nd, p.registered_domain as rd
    from public.website_profiles p
    where (p_profile_ids is null or p.id = any(p_profile_ids))
      and p.system_flag is null
      and p.system_flag_overridden_at is null
  ),
  judged as (
    select c.id,
           d.host_suffix,
           is_social_host(c.rd) as social,
           k.category
    from cand c
    left join lateral (
      select host_suffix from public.operator_domains_denylist d
      where c.nd = d.host_suffix or c.nd like '%.' || d.host_suffix
      limit 1
    ) d on true
    left join public.known_non_affiliate_domains k on k.registered_domain = c.rd
  ),
  flagged as (
    select id,
           case when host_suffix is not null then 'operator_site'
                when social then 'social_platform'
                else category end as flag,
           case when host_suffix is not null then 'operator_denylist'
                when social then 'social_host'
                else 'known_list' end as src,
           case when host_suffix is not null then 'Casino operator domain list: ' || host_suffix
                when social then 'Social / video platform host'
                else 'Known non-affiliate website (' || category || ')' end as reason
    from judged
    where host_suffix is not null or social or category is not null
  ),
  upd as (
    update public.website_profiles p
    set system_flag            = f.flag,
        system_flag_source     = f.src,
        system_flag_reason     = f.reason,
        system_flag_at         = v_now,
        system_flag_checked_at = v_now,
        is_not_relevant        = p.is_not_relevant or f.flag = 'operator_site',
        not_relevant_source    = coalesce(p.not_relevant_source, case when f.flag = 'operator_site' then 'operator_denylist' end),
        not_relevant_at        = coalesce(p.not_relevant_at,     case when f.flag = 'operator_site' then v_now end),
        updated_at             = v_now
    from flagged f
    where p.id = f.id
    returning p.id
  )
  select coalesce(array_agg(id), '{}'::bigint[]) into v_flagged from upd;

  -- Stamp the ones we looked at and left alone, so the LLM pass knows the
  -- DB pass already ran.
  update public.website_profiles p
  set system_flag_checked_at = v_now
  where (p_profile_ids is null or p.id = any(p_profile_ids))
    and p.system_flag is null
    and p.system_flag_checked_at is null;

  if array_length(v_flagged, 1) is null then
    return 0;
  end if;

  update public.google_lead_gen_table g
  set system_flag            = p.system_flag,
      is_not_relevant        = g.is_not_relevant or p.system_flag = 'operator_site',
      not_relevant_marked_by = coalesce(g.not_relevant_marked_by, case when p.system_flag = 'operator_site' then 'operator_denylist' end),
      not_relevant_marked_at = coalesce(g.not_relevant_marked_at, case when p.system_flag = 'operator_site' then v_now end)
  from public.website_profiles p
  where g.profile_id = p.id
    and p.id = any(v_flagged)
    and g.system_flag is distinct from p.system_flag;

  delete from public.enrichment_fetch_queue q
  using public.google_lead_gen_table g
  where q.lead_id = g.id
    and g.profile_id = any(v_flagged)
    and q.status = 'pending';

  return array_length(v_flagged, 1);
end;
$$;

grant execute on function public.apply_db_system_flags(bigint[]) to service_role;
revoke execute on function public.apply_db_system_flags(bigint[]) from anon, authenticated;

-- Set (or clear, with p_flag null) one website's system flag. Used by the
-- OpenAI pass and by operators. Clearing records an override so no automatic
-- pass re-applies it.
create or replace function public.set_profile_system_flag(
  p_profile_id bigint,
  p_flag       text,
  p_source     text,
  p_reason     text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  perform set_config('app.skip_lead_profile_sync', '1', true);

  update public.website_profiles p
  set system_flag                = p_flag,
      system_flag_source         = case when p_flag is null then null else p_source end,
      system_flag_reason         = case when p_flag is null then null else p_reason end,
      system_flag_at             = case when p_flag is null then null else v_now end,
      system_flag_checked_at     = v_now,
      system_flag_llm_checked_at = case when p_source = 'openai' then v_now else p.system_flag_llm_checked_at end,
      system_flag_overridden_at  = case when p_flag is null then v_now else p.system_flag_overridden_at end,
      updated_at                 = v_now
  where p.id = p_profile_id;

  update public.google_lead_gen_table g
  set system_flag = p_flag
  where g.profile_id = p_profile_id
    and g.system_flag is distinct from p_flag;

  if p_flag is not null then
    delete from public.enrichment_fetch_queue q
    using public.google_lead_gen_table g
    where q.lead_id = g.id
      and g.profile_id = p_profile_id
      and q.status = 'pending';
  end if;
end;
$$;

grant execute on function public.set_profile_system_flag(bigint, text, text, text) to service_role;
revoke execute on function public.set_profile_system_flag(bigint, text, text, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Lead → profile trigger. Enrichment results and operator overrides land
--    on lead rows; this keeps the website's profile the latest word. Bulk
--    profile→lead writers set app.skip_lead_profile_sync to avoid echo.
-- ---------------------------------------------------------------------------

create or replace function public.sync_lead_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_update boolean := (tg_op = 'UPDATE');
begin
  if new.profile_id is null then
    return new;
  end if;
  if coalesce(current_setting('app.skip_lead_profile_sync', true), '') = '1' then
    return new;
  end if;

  update public.website_profiles p
  set
    -- affiliate ---------------------------------------------------------
    is_affiliate = case
      when new.is_affiliate_overridden_at is not null then new.is_affiliate
      when p.is_affiliate_overridden_at   is not null then p.is_affiliate
      when new.affiliate_checked_at is not null and (p.affiliate_checked_at is null or new.affiliate_checked_at >= p.affiliate_checked_at) then new.is_affiliate
      else p.is_affiliate end,
    affiliate_confidence = case when new.affiliate_checked_at is not null and (p.affiliate_checked_at is null or new.affiliate_checked_at >= p.affiliate_checked_at) then new.affiliate_confidence else p.affiliate_confidence end,
    affiliate_score      = case when new.affiliate_checked_at is not null and (p.affiliate_checked_at is null or new.affiliate_checked_at >= p.affiliate_checked_at) then new.affiliate_score      else p.affiliate_score      end,
    affiliate_source     = case when new.affiliate_checked_at is not null and (p.affiliate_checked_at is null or new.affiliate_checked_at >= p.affiliate_checked_at) then new.affiliate_source     else p.affiliate_source     end,
    affiliate_checked_at       = greatest(p.affiliate_checked_at, new.affiliate_checked_at),
    is_affiliate_overridden_at = greatest(p.is_affiliate_overridden_at, new.is_affiliate_overridden_at),
    -- rooster -----------------------------------------------------------
    is_rooster_partner = case
      when new.is_rooster_overridden_at is not null then new.is_rooster_partner
      when p.is_rooster_overridden_at   is not null then p.is_rooster_partner
      when new.rooster_checked_at is not null and (p.rooster_checked_at is null or new.rooster_checked_at >= p.rooster_checked_at) then new.is_rooster_partner
      else p.is_rooster_partner end,
    brand          = case when new.rooster_checked_at is not null and (p.rooster_checked_at is null or new.rooster_checked_at >= p.rooster_checked_at) then coalesce(new.brand, p.brand) else p.brand end,
    rooster_brands = case when new.rooster_checked_at is not null and (p.rooster_checked_at is null or new.rooster_checked_at >= p.rooster_checked_at) then coalesce(new.rooster_brands, p.rooster_brands) else p.rooster_brands end,
    rooster_source = case when new.rooster_checked_at is not null and (p.rooster_checked_at is null or new.rooster_checked_at >= p.rooster_checked_at) then new.rooster_source else p.rooster_source end,
    rooster_checked_at       = greatest(p.rooster_checked_at, new.rooster_checked_at),
    is_rooster_overridden_at = greatest(p.is_rooster_overridden_at, new.is_rooster_overridden_at),
    -- contact / s-tags --------------------------------------------------
    has_contact_details = case when new.contact_checked_at is not null and (p.contact_checked_at is null or new.contact_checked_at >= p.contact_checked_at) then new.has_contact_details else p.has_contact_details end,
    contact_checked_at  = greatest(p.contact_checked_at, new.contact_checked_at),
    has_s_tags          = case when new.s_tags_checked_at is not null and (p.s_tags_checked_at is null or new.s_tags_checked_at >= p.s_tags_checked_at) then new.has_s_tags else p.has_s_tags end,
    s_tags_checked_at   = greatest(p.s_tags_checked_at, new.s_tags_checked_at),
    -- not relevant: a change on the lead is a decision, copy it ------------
    is_not_relevant = case
      when v_is_update and new.is_not_relevant is distinct from old.is_not_relevant then coalesce(new.is_not_relevant, false)
      when coalesce(new.is_not_relevant, false) then true
      else p.is_not_relevant end,
    not_relevant_source = case
      when coalesce(new.is_not_relevant, false) and (not v_is_update or old.is_not_relevant is distinct from new.is_not_relevant) then coalesce(new.not_relevant_marked_by, 'operator')
      when v_is_update and coalesce(old.is_not_relevant, false) and not coalesce(new.is_not_relevant, false) then null
      else p.not_relevant_source end,
    not_relevant_at = case
      when coalesce(new.is_not_relevant, false) and (not v_is_update or old.is_not_relevant is distinct from new.is_not_relevant) then coalesce(new.not_relevant_marked_at, now())
      when v_is_update and coalesce(old.is_not_relevant, false) and not coalesce(new.is_not_relevant, false) then null
      else p.not_relevant_at end,
    -- system flag: clearing it on a lead clears the website and records an override
    system_flag = case when v_is_update and new.system_flag is distinct from old.system_flag then new.system_flag else p.system_flag end,
    system_flag_overridden_at = case when v_is_update and old.system_flag is not null and new.system_flag is null then now() else p.system_flag_overridden_at end,
    updated_at = now()
  where p.id = new.profile_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_lead_to_profile on public.google_lead_gen_table;
create trigger trg_sync_lead_to_profile
after insert or update of
  is_affiliate, affiliate_confidence, affiliate_score, affiliate_checked_at, affiliate_source, is_affiliate_overridden_at,
  is_rooster_partner, brand, rooster_brands, rooster_checked_at, rooster_source, is_rooster_overridden_at,
  has_contact_details, contact_checked_at, has_s_tags, s_tags_checked_at,
  is_not_relevant, not_relevant_marked_by, not_relevant_marked_at, system_flag
on public.google_lead_gen_table
for each row execute function public.sync_lead_to_profile();

-- ---------------------------------------------------------------------------
-- 9. complete_scrape_job — prod's FINAL definition (20260923150000), Monday
--    stripped in the brief's four places, rooster re-check enqueue dropped.
--    known website  → still gets THIS job's lead row (job-scoped dedupe)
--    new website    → profile + lead row + appearance
--    Verdicts inherit from the profile while inside their TTL; an expired
--    affiliate verdict on a re-seen website queues a re-check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_scrape_job(p_job_id uuid, p_results jsonb, p_summary jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch_id      bigint;
  v_job           public.scrape_queue;
  v_country_name  text;
  v_logged_in     boolean;
  v_logged_in_raw text;
  v_dedupe        boolean;
  v_ttl           jsonb;
  v_ttl_aff       integer;
  v_ttl_roo       integer;
  v_ttl_con       integer;
  v_ttl_stag      integer;
  v_new_profiles  bigint[] := '{}'::bigint[];
  v_n_new         integer := 0;
  v_n_known       integer := 0;
  v_n_leads       integer := 0;
  v_n_app         integer := 0;
  v_n_recheck     integer := 0;
  v_tmp           integer := 0;
begin
  select * into v_job from public.scrape_queue where id = p_job_id;
  if v_job.id is null then
    raise exception 'scrape_queue row % not found', p_job_id;
  end if;

  select country_name into v_country_name
  from public.gologin_profiles
  where country_code = v_job.country_code;

  update public.batch_counter
  set next_value = next_value + 1
  where id = 1
  returning next_value - 1 into v_batch_id;

  v_dedupe   := coalesce(public.get_system_setting('profile_dedupe_enabled') = 'true'::jsonb, true);
  v_ttl      := coalesce(public.get_system_setting('verdict_ttl_days'), '{}'::jsonb);
  v_ttl_aff  := coalesce(nullif(v_ttl->>'affiliate', '')::integer, 90);
  v_ttl_roo  := coalesce(nullif(v_ttl->>'rooster',   '')::integer, 60);
  v_ttl_con  := coalesce(nullif(v_ttl->>'contact',   '')::integer, 180);
  v_ttl_stag := coalesce(nullif(v_ttl->>'stags',     '')::integer, 90);

  perform set_config('app.skip_lead_profile_sync', '1', true);

  if p_results is not null and jsonb_typeof(p_results) = 'array' then
    drop table if exists tmp_scrape_results;
    create temp table tmp_scrape_results on commit drop as
    select
      row_number() over (order by nullif(r->>'overall_position', '')::integer nulls last, ord) as rn,
      r,
      coalesce(public.normalize_domain(coalesce(nullif(r->>'full_url', ''), r->>'url')), '') as nd
    from jsonb_array_elements(p_results) with ordinality as t(r, ord)
    where coalesce(r->>'url', '') <> ''
      and (v_job.result_type_filter is null or r->>'resultType' = v_job.result_type_filter);

    with ins as (
      insert into public.website_profiles (normalized_domain, registered_domain, brand_stem, display_name, source, first_seen_at, last_seen_at)
      select distinct on (nd) nd, coalesce(public.registered_domain(nd), nd), public.brand_stem(nd), nd, 'scrape', now(), now()
      from tmp_scrape_results
      where nd <> ''
      order by nd, rn
      on conflict (normalized_domain) do nothing
      returning id
    )
    select coalesce(array_agg(id), '{}'::bigint[]) into v_new_profiles from ins;
    v_n_new := coalesce(array_length(v_new_profiles, 1), 0);

    perform public.link_profile_relations(v_new_profiles);
    perform public.apply_db_system_flags(v_new_profiles);

    drop table if exists tmp_lead_rows;
    create temp table tmp_lead_rows on commit drop as
    select t.rn, t.r, t.nd, p.id as profile_id
    from tmp_scrape_results t
    left join public.website_profiles p on p.normalized_domain = t.nd
    where (not v_dedupe)
       or t.nd = ''
       or t.rn = (select min(t2.rn) from tmp_scrape_results t2 where t2.nd = t.nd);

    with ins as (
      insert into public.google_lead_gen_table (
        keyword, country, country_code,
        url, domain,
        page_number, position_on_page, overall_position,
        result_type,
        batch_id, scrape_job_id,
        serp_screenshot_path, screenshot_content_link, seen_on,
        serp_title, serp_description,
        created_by_is_shadow, created_by_email,
        profile_id, system_flag,
        is_not_relevant, not_relevant_marked_at, not_relevant_marked_by,
        is_affiliate, affiliate_confidence, affiliate_score, affiliate_checked_at, affiliate_source, is_affiliate_overridden_at,
        is_rooster_partner, brand, rooster_brands, rooster_checked_at, rooster_source, is_rooster_overridden_at,
        has_contact_details, contact_checked_at,
        has_s_tags, s_tags_checked_at,
        inherited_from_lead_id, inherited_at
      )
      select
        coalesce(l.r->>'keyword', v_job.keyword),
        coalesce(l.r->>'country', v_country_name),
        v_job.country_code,
        l.r->>'url',
        l.r->>'full_url',
        nullif(l.r->>'page', '')::integer,
        nullif(l.r->>'position', '')::integer,
        nullif(l.r->>'overall_position', '')::integer,
        l.r->>'resultType',
        v_batch_id,
        v_job.id,
        nullif(l.r->>'serp_screenshot_path', ''),
        nullif(l.r->>'screenshot_content_link', ''),
        case lower(coalesce(l.r->>'seen_on', ''))
          when 'desktop' then 'desktop'
          when 'mobile'  then 'mobile'
          when 'both'    then 'both'
          else null
        end,
        nullif(l.r->>'title', ''),
        nullif(coalesce(l.r->>'description', l.r->>'snippet'), ''),
        coalesce(v_job.created_by_is_shadow, false),
        v_job.created_by_email,
        l.profile_id,
        p.system_flag,
        coalesce(p.is_not_relevant, false),
        case when p.is_not_relevant then coalesce(p.not_relevant_at, now()) end,
        case when p.is_not_relevant then coalesce(p.not_relevant_source, 'profile') end,
        case when p.is_affiliate_overridden_at is not null or p.affiliate_checked_at > now() - make_interval(days => v_ttl_aff) then p.is_affiliate end,
        case when p.is_affiliate_overridden_at is not null or p.affiliate_checked_at > now() - make_interval(days => v_ttl_aff) then p.affiliate_confidence end,
        case when p.is_affiliate_overridden_at is not null or p.affiliate_checked_at > now() - make_interval(days => v_ttl_aff) then p.affiliate_score end,
        case when p.is_affiliate_overridden_at is not null or p.affiliate_checked_at > now() - make_interval(days => v_ttl_aff) then p.affiliate_checked_at end,
        case when p.is_affiliate_overridden_at is not null or p.affiliate_checked_at > now() - make_interval(days => v_ttl_aff) then p.affiliate_source end,
        p.is_affiliate_overridden_at,
        case when p.is_rooster_overridden_at is not null or p.rooster_checked_at > now() - make_interval(days => v_ttl_roo) then p.is_rooster_partner end,
        case when p.is_rooster_overridden_at is not null or p.rooster_checked_at > now() - make_interval(days => v_ttl_roo) then p.brand end,
        case when p.is_rooster_overridden_at is not null or p.rooster_checked_at > now() - make_interval(days => v_ttl_roo) then p.rooster_brands end,
        case when p.is_rooster_overridden_at is not null or p.rooster_checked_at > now() - make_interval(days => v_ttl_roo) then p.rooster_checked_at end,
        case when p.is_rooster_overridden_at is not null or p.rooster_checked_at > now() - make_interval(days => v_ttl_roo) then p.rooster_source end,
        p.is_rooster_overridden_at,
        case when p.contact_checked_at > now() - make_interval(days => v_ttl_con) then p.has_contact_details end,
        case when p.contact_checked_at > now() - make_interval(days => v_ttl_con) then p.contact_checked_at end,
        case when p.s_tags_checked_at > now() - make_interval(days => v_ttl_stag) then p.has_s_tags end,
        case when p.s_tags_checked_at > now() - make_interval(days => v_ttl_stag) then p.s_tags_checked_at end,
        p.first_lead_id,
        case when p.affiliate_checked_at is not null or p.rooster_checked_at is not null or p.contact_checked_at is not null or p.s_tags_checked_at is not null then now() end
      from tmp_lead_rows l
      left join public.website_profiles p on p.id = l.profile_id
      returning id, profile_id
    ),
    firsts as (
      select distinct on (profile_id) profile_id, id
      from ins
      where profile_id is not null
      order by profile_id, id
    )
    update public.website_profiles p
    set first_lead_id = f.id, updated_at = now()
    from firsts f
    where p.id = f.profile_id
      and p.first_lead_id is null;

    select count(*) into v_n_leads from tmp_lead_rows;

    insert into public.website_appearances (
      profile_id, lead_id, scrape_job_id, batch_id,
      keyword, country_code, search_engine, result_type,
      url, page_number, position_on_page, overall_position, seen_on, serp_screenshot_path,
      created_lead, seen_at
    )
    select
      p.id, g.id, v_job.id, v_batch_id,
      coalesce(t.r->>'keyword', v_job.keyword),
      v_job.country_code,
      v_job.search_engine,
      t.r->>'resultType',
      t.r->>'url',
      nullif(t.r->>'page', '')::integer,
      nullif(t.r->>'position', '')::integer,
      nullif(t.r->>'overall_position', '')::integer,
      nullif(lower(t.r->>'seen_on'), ''),
      nullif(t.r->>'serp_screenshot_path', ''),
      (g.id is not null),
      now()
    from tmp_scrape_results t
    join public.website_profiles p on p.normalized_domain = t.nd
    left join tmp_lead_rows l on l.rn = t.rn
    left join lateral (
      select g0.id
      from public.google_lead_gen_table g0
      where l.rn is not null
        and g0.scrape_job_id = v_job.id
        and g0.profile_id = p.id
        and g0.url = t.r->>'url'
      order by g0.id
      limit 1
    ) g on true;
    get diagnostics v_n_app = row_count;

    update public.website_profiles p
    set last_seen_at     = now(),
        first_seen_at    = coalesce(p.first_seen_at, now()),
        appearance_count = p.appearance_count + s.n,
        updated_at       = now()
    from (select nd, count(*) as n from tmp_scrape_results where nd <> '' group by nd) s
    where p.normalized_domain = s.nd;

    select count(distinct nd) - v_n_new into v_n_known from tmp_scrape_results where nd <> '';

    if coalesce(v_job.with_enrichment, false) then
      insert into public.enrichment_fetch_queue (lead_id, country_code, url, want_html, want_screenshot, process_stages, created_by_email, created_by_is_shadow)
      select g.id, g.country_code, g.url, true, false, '["affiliate"]'::jsonb, v_job.created_by_email, coalesce(v_job.created_by_is_shadow, false)
      from public.website_profiles p
      join public.google_lead_gen_table g on g.id = p.first_lead_id
      where p.normalized_domain in (select nd from tmp_scrape_results where nd <> '')
        and not (p.id = any(v_new_profiles))
        and p.is_not_relevant = false
        and p.system_flag is null
        and p.is_affiliate_overridden_at is null
        and p.affiliate_checked_at is not null
        and p.affiliate_checked_at < now() - make_interval(days => v_ttl_aff)
        and g.url like 'http%'
        and g.country_code is not null
        and not exists (
          select 1 from public.enrichment_fetch_queue q
          where q.lead_id = g.id and q.status in ('pending', 'running', 'paused')
        );
      get diagnostics v_tmp = row_count;
      v_n_recheck := v_n_recheck + v_tmp;
    end if;

    drop table if exists tmp_lead_rows;
    drop table if exists tmp_scrape_results;
  end if;

  update public.scrape_queue
  set status         = 'completed',
      completed_at   = now(),
      batch_id       = v_batch_id,
      result_summary = coalesce(p_summary, '{}'::jsonb) || jsonb_build_object(
                         'websites_new',    v_n_new,
                         'websites_known',  v_n_known,
                         'lead_rows',       v_n_leads,
                         'appearances',     v_n_app,
                         'rechecks_queued', v_n_recheck
                       ),
      raw_results    = p_results,
      error_message  = null,
      updated_at     = now()
  where id = p_job_id;

  delete from public.active_profile_locks where job_id = p_job_id;

  if p_summary is not null then
    v_logged_in_raw := p_summary->>'is_logged_in';
    if v_logged_in_raw is not null and v_logged_in_raw <> 'null' then
      v_logged_in := (v_logged_in_raw = 'true');
      update public.gologin_profiles
      set is_google_logged_in      = v_logged_in,
          google_login_verified_at = now(),
          login_check_source       = 'auto',
          updated_at               = now()
      where country_code = v_job.country_code
        and not (
          v_logged_in = false
          and login_check_source = 'manual'
          and is_google_logged_in = true
        );
    end if;
  end if;

  return v_batch_id;
end;
$function$;

grant execute on function public.complete_scrape_job(uuid, jsonb, jsonb) to service_role;
revoke execute on function public.complete_scrape_job(uuid, jsonb, jsonb) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. advance_enrichment_chain: system-flagged leads are not enrichable.
--     Body = OUR deployed definition (20260907120000, stops at affiliate)
--     plus `system_flag is null` on every lead predicate. Prod's Monday
--     guards (force_enrich / is_on_monday / monday_inherited_at) and its
--     inherit_monday_data_for_lead() call are not ported.
-- ---------------------------------------------------------------------------

create or replace function public.advance_enrichment_chain(p_job_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_job         public.scrape_queue;
  v_total       integer;
  v_aff_done    integer;
  v_legacy_done integer;
  v_now         timestamptz := now();
begin
  select * into v_job from public.scrape_queue where id = p_job_id;
  if v_job.id is null then return null; end if;
  if not v_job.with_enrichment then return v_job.enrichment_status; end if;
  if v_job.status <> 'completed' then return v_job.enrichment_status; end if;
  if v_job.enrichment_status = 'complete' then return 'complete'; end if;

  -- Count only FETCHABLE enrichable leads (valid http url + country). A lead
  -- with no url/country is never enqueued, so it could never be marked "done"
  -- and would stall the stage forever — exclude it (it can't be enriched anyway).
  select count(*) into v_total
  from public.google_lead_gen_table
  where scrape_job_id = p_job_id
    and is_not_relevant = false
    and system_flag is null
    and url is not null and url like 'http%'
    and country_code is not null;

  if v_total = 0 then
    update public.scrape_queue
    set enrichment_status = 'complete', enrichment_completed_at = v_now
    where id = p_job_id;
    return 'complete';
  end if;

  -- Stage 1 (the only auto stage): affiliate
  if v_job.enrichment_status is null or v_job.enrichment_status = 'pending' then
    insert into public.enrichment_fetch_queue (
      lead_id, country_code, url, want_html, want_screenshot, process_stages
    )
    select g.id, g.country_code, g.url, true, (g.result_type = 'PPC'), '["affiliate"]'::jsonb
    from public.google_lead_gen_table g
    where g.scrape_job_id = p_job_id
      and g.url is not null and g.url like 'http%'
      and g.country_code is not null
      and g.is_not_relevant = false
      and g.system_flag is null
      and g.is_affiliate_overridden_at is null
      and g.affiliate_checked_at is null;

    update public.scrape_queue
    set enrichment_status = 'affiliate_running',
        enrichment_started_at = coalesce(enrichment_started_at, v_now)
    where id = p_job_id;
    return 'affiliate_running';
  end if;

  -- Wait for affiliate, then complete. S-tag + contact are operator-triggered
  -- and never block the chain.
  if v_job.enrichment_status = 'affiliate_running' then
    select count(*) into v_aff_done
    from public.google_lead_gen_table g
    where g.scrape_job_id = p_job_id
      and g.is_not_relevant = false
      and g.system_flag is null
      and g.url is not null and g.url like 'http%'
      and g.country_code is not null
      and (
        g.is_affiliate_overridden_at is not null
        or g.affiliate_checked_at is not null
        -- Done once nothing is actively fetching this lead's affiliate stage —
        -- covers success, failure, AND a fetch that was cleaned up or never
        -- enqueued. Only an in-flight fetch blocks.
        or not exists (
          select 1 from public.enrichment_fetch_queue q
          where q.lead_id = g.id and q.process_stages @> '["affiliate"]'::jsonb
            and q.status in ('pending', 'running', 'paused')
        )
      );

    if v_aff_done < v_total then
      return 'affiliate_running';
    end if;

    update public.scrape_queue
    set enrichment_status = 'complete', enrichment_completed_at = v_now
    where id = p_job_id;
    return 'complete';
  end if;

  -- Legacy 'all_running' (old rooster-wait status): complete once no rooster
  -- fetch is still in flight for the job's leads.
  if v_job.enrichment_status = 'all_running' then
    select count(*) into v_legacy_done
    from public.google_lead_gen_table g
    where g.scrape_job_id = p_job_id
      and g.is_not_relevant = false
      and g.system_flag is null
      and g.url is not null and g.url like 'http%'
      and g.country_code is not null
      and not exists (
        select 1 from public.enrichment_fetch_queue q
        where q.lead_id = g.id and q.process_stages @> '["rooster"]'::jsonb
          and q.status in ('pending', 'running', 'paused')
      );

    if v_legacy_done < v_total then
      return 'all_running';
    end if;

    update public.scrape_queue
    set enrichment_status = 'complete', enrichment_completed_at = v_now
    where id = p_job_id;
    return 'complete';
  end if;

  return v_job.enrichment_status;
end;
$$;

grant execute on function public.advance_enrichment_chain(uuid) to service_role;
revoke execute on function public.advance_enrichment_chain(uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10b. Backfill (prod 20260918120100 minus its Monday steps). The SaaS lead
--      table is empty today, so this is a no-op; kept so the migration is
--      correct against data. Idempotent: upserts / not-exists guards only.
-- ---------------------------------------------------------------------------

select set_config('app.skip_lead_profile_sync', '1', true);

insert into public.website_profiles (
  normalized_domain, registered_domain, brand_stem, display_name, source,
  first_lead_id, first_seen_at, last_seen_at, appearance_count
)
select x.nd, coalesce(public.registered_domain(x.nd), x.nd), public.brand_stem(x.nd), x.nd, 'scrape',
       x.first_id, x.first_seen, x.last_seen, x.n
from (
  select public.normalize_domain(coalesce(domain, url)) as nd,
         min(id) as first_id, min(created_at) as first_seen, max(created_at) as last_seen, count(*) as n
  from public.google_lead_gen_table
  group by 1
) x
where coalesce(x.nd, '') <> ''
on conflict (normalized_domain) do update
  set first_lead_id    = coalesce(website_profiles.first_lead_id, excluded.first_lead_id),
      first_seen_at    = least(website_profiles.first_seen_at, excluded.first_seen_at),
      last_seen_at     = greatest(website_profiles.last_seen_at, excluded.last_seen_at),
      appearance_count = greatest(website_profiles.appearance_count, excluded.appearance_count),
      updated_at       = now();

update public.google_lead_gen_table g
set profile_id = p.id
from public.website_profiles p
where g.profile_id is null
  and p.normalized_domain = public.normalize_domain(coalesce(g.domain, g.url));

-- Verdicts: the most recently checked lead per website wins; an override wins over everything.
with latest as (
  select distinct on (profile_id) profile_id, is_affiliate, affiliate_confidence, affiliate_score, affiliate_checked_at, affiliate_source
  from public.google_lead_gen_table
  where profile_id is not null and affiliate_checked_at is not null
  order by profile_id, affiliate_checked_at desc, id desc
)
update public.website_profiles p
set is_affiliate = l.is_affiliate, affiliate_confidence = l.affiliate_confidence, affiliate_score = l.affiliate_score,
    affiliate_checked_at = l.affiliate_checked_at, affiliate_source = l.affiliate_source
from latest l where p.id = l.profile_id and p.affiliate_checked_at is null;

with ov as (
  select distinct on (profile_id) profile_id, is_affiliate, is_affiliate_overridden_at
  from public.google_lead_gen_table
  where profile_id is not null and is_affiliate_overridden_at is not null
  order by profile_id, is_affiliate_overridden_at desc, id desc
)
update public.website_profiles p
set is_affiliate = o.is_affiliate, is_affiliate_overridden_at = o.is_affiliate_overridden_at
from ov o where p.id = o.profile_id and p.is_affiliate_overridden_at is null;

with latest as (
  select distinct on (profile_id) profile_id, has_contact_details, contact_checked_at
  from public.google_lead_gen_table
  where profile_id is not null and contact_checked_at is not null
  order by profile_id, contact_checked_at desc, id desc
)
update public.website_profiles p
set has_contact_details = l.has_contact_details, contact_checked_at = l.contact_checked_at
from latest l where p.id = l.profile_id and p.contact_checked_at is null;

with latest as (
  select distinct on (profile_id) profile_id, has_s_tags, s_tags_checked_at
  from public.google_lead_gen_table
  where profile_id is not null and s_tags_checked_at is not null
  order by profile_id, s_tags_checked_at desc, id desc
)
update public.website_profiles p
set has_s_tags = l.has_s_tags, s_tags_checked_at = l.s_tags_checked_at
from latest l where p.id = l.profile_id and p.s_tags_checked_at is null;

with nr as (
  select distinct on (profile_id) profile_id, not_relevant_marked_by, not_relevant_marked_at
  from public.google_lead_gen_table
  where profile_id is not null and is_not_relevant = true
  order by profile_id, not_relevant_marked_at desc nulls last, id desc
)
update public.website_profiles p
set is_not_relevant = true,
    not_relevant_source = coalesce(p.not_relevant_source, nr.not_relevant_marked_by, 'operator'),
    not_relevant_at     = coalesce(p.not_relevant_at, nr.not_relevant_marked_at, now())
from nr where p.id = nr.profile_id and p.is_not_relevant = false;

insert into public.website_appearances (
  profile_id, lead_id, scrape_job_id, batch_id, keyword, country_code, search_engine, result_type,
  url, page_number, position_on_page, overall_position, seen_on, serp_screenshot_path, created_lead, seen_at
)
select g.profile_id, g.id, g.scrape_job_id, g.batch_id, g.keyword, g.country_code, q.search_engine, g.result_type,
       g.url, g.page_number, g.position_on_page, g.overall_position, g.seen_on, g.serp_screenshot_path,
       (g.id = p.first_lead_id), g.created_at
from public.google_lead_gen_table g
join public.website_profiles p on p.id = g.profile_id
left join public.scrape_queue q on q.id = g.scrape_job_id
where not exists (select 1 from public.website_appearances a where a.lead_id = g.id);

select public.link_profile_relations(array(select id from public.website_profiles));
select public.apply_db_system_flags(null);

-- Titles recoverable from retained raw_results (prod 20260921160000 §2).
with parsed as (
  select q.id as job_id, r->>'url' as url, r->>'title' as title
  from public.scrape_queue q
  cross join lateral jsonb_array_elements(q.raw_results) r
  where q.raw_results is not null and jsonb_typeof(q.raw_results) = 'array'
    and coalesce(r->>'title', '') <> ''
),
deduped as (
  select distinct on (job_id, url) job_id, url, title from parsed order by job_id, url, title
)
update public.google_lead_gen_table g
set serp_title = d.title
from deduped d
where g.scrape_job_id = d.job_id and g.url = d.url and g.serp_title is null;

-- ---------------------------------------------------------------------------
-- 11. Recovery tool (prod 20260923120100): rebuild the lead rows a completed
--     scrape should have written, from raw_results. Idempotent; no re-scrape.
-- ---------------------------------------------------------------------------
create or replace function public.replay_missing_leads(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_job          public.scrape_queue;
  v_country_name text;
  v_ttl          jsonb;
  v_ttl_aff      integer;
  v_ttl_roo      integer;
  v_ttl_con      integer;
  v_ttl_stag     integer;
  v_n            integer := 0;
begin
  select * into v_job from public.scrape_queue where id = p_job_id;
  if v_job.id is null then
    raise exception 'scrape_queue row % not found', p_job_id;
  end if;
  if v_job.raw_results is null or jsonb_typeof(v_job.raw_results) <> 'array' then
    return 0;
  end if;

  select country_name into v_country_name
  from public.gologin_profiles
  where country_code = v_job.country_code;

  v_ttl      := coalesce(public.get_system_setting('verdict_ttl_days'), '{}'::jsonb);
  v_ttl_aff  := coalesce(nullif(v_ttl->>'affiliate', '')::integer, 90);
  v_ttl_roo  := coalesce(nullif(v_ttl->>'rooster',   '')::integer, 60);
  v_ttl_con  := coalesce(nullif(v_ttl->>'contact',   '')::integer, 180);
  v_ttl_stag := coalesce(nullif(v_ttl->>'stags',     '')::integer, 90);

  -- Suppress the profile-sync trigger exactly as complete_scrape_job does,
  -- so replaying does not re-derive verdicts from the rows we are writing.
  perform set_config('app.skip_lead_profile_sync', '1', true);

  drop table if exists tmp_replay_results;
  create temp table tmp_replay_results on commit drop as
  select
    row_number() over (order by nullif(r->>'overall_position', '')::integer nulls last, ord) as rn,
    r,
    coalesce(public.normalize_domain(coalesce(nullif(r->>'full_url', ''), r->>'url')), '') as nd
  from jsonb_array_elements(v_job.raw_results) with ordinality as t(r, ord)
  where coalesce(r->>'url', '') <> ''
    and (v_job.result_type_filter is null or r->>'resultType' = v_job.result_type_filter);

  -- Websites first seen by this job may have no profile yet if the original
  -- run predates them; make sure every result has one to inherit from.
  insert into public.website_profiles (normalized_domain, registered_domain, brand_stem, display_name, source, first_seen_at, last_seen_at)
  select distinct on (nd) nd, coalesce(public.registered_domain(nd), nd), public.brand_stem(nd), nd, 'scrape', now(), now()
  from tmp_replay_results
  where nd <> ''
  order by nd, rn
  on conflict (normalized_domain) do nothing;

  drop table if exists tmp_lead_rows;
  create temp table tmp_lead_rows on commit drop as
  select t.rn, t.r, t.nd, p.id as profile_id
  from tmp_replay_results t
  left join public.website_profiles p on p.normalized_domain = t.nd
  where (t.nd = '' or t.rn = (select min(t2.rn) from tmp_replay_results t2 where t2.nd = t.nd))
    -- Skip anything this job already wrote, so the replay is idempotent.
    and not exists (
      select 1 from public.google_lead_gen_table g
      where g.scrape_job_id = v_job.id
        and g.url = t.r->>'url'
    );

  with ins as (
      insert into public.google_lead_gen_table (
        keyword, country, country_code,
        url, domain,
        page_number, position_on_page, overall_position,
        result_type,
        batch_id, scrape_job_id,
        serp_screenshot_path, screenshot_content_link, seen_on,
        serp_title, serp_description,
        created_by_is_shadow, created_by_email,
        profile_id, system_flag,
        is_not_relevant, not_relevant_marked_at, not_relevant_marked_by,
        is_affiliate, affiliate_confidence, affiliate_score, affiliate_checked_at, affiliate_source, is_affiliate_overridden_at,
        is_rooster_partner, brand, rooster_brands, rooster_checked_at, rooster_source, is_rooster_overridden_at,
        has_contact_details, contact_checked_at,
        has_s_tags, s_tags_checked_at,
        inherited_from_lead_id, inherited_at
      )
      select
        coalesce(l.r->>'keyword', v_job.keyword),
        coalesce(l.r->>'country', v_country_name),
        v_job.country_code,
        l.r->>'url',
        l.r->>'full_url',
        nullif(l.r->>'page', '')::integer,
        nullif(l.r->>'position', '')::integer,
        nullif(l.r->>'overall_position', '')::integer,
        l.r->>'resultType',
        v_job.batch_id,
        v_job.id,
        nullif(l.r->>'serp_screenshot_path', ''),
        nullif(l.r->>'screenshot_content_link', ''),
        case lower(coalesce(l.r->>'seen_on', ''))
          when 'desktop' then 'desktop'
          when 'mobile'  then 'mobile'
          when 'both'    then 'both'
          else null
        end,
        nullif(l.r->>'title', ''),
        nullif(coalesce(l.r->>'description', l.r->>'snippet'), ''),
        coalesce(v_job.created_by_is_shadow, false),
        v_job.created_by_email,
        l.profile_id,
        p.system_flag,
        coalesce(p.is_not_relevant, false),
        case when p.is_not_relevant then coalesce(p.not_relevant_at, now()) end,
        case when p.is_not_relevant then coalesce(p.not_relevant_source, 'profile') end,
        case when p.is_affiliate_overridden_at is not null or p.affiliate_checked_at > now() - make_interval(days => v_ttl_aff) then p.is_affiliate end,
        case when p.is_affiliate_overridden_at is not null or p.affiliate_checked_at > now() - make_interval(days => v_ttl_aff) then p.affiliate_confidence end,
        case when p.is_affiliate_overridden_at is not null or p.affiliate_checked_at > now() - make_interval(days => v_ttl_aff) then p.affiliate_score end,
        case when p.is_affiliate_overridden_at is not null or p.affiliate_checked_at > now() - make_interval(days => v_ttl_aff) then p.affiliate_checked_at end,
        case when p.is_affiliate_overridden_at is not null or p.affiliate_checked_at > now() - make_interval(days => v_ttl_aff) then p.affiliate_source end,
        p.is_affiliate_overridden_at,
        case when p.is_rooster_overridden_at is not null or p.rooster_checked_at > now() - make_interval(days => v_ttl_roo) then p.is_rooster_partner end,
        case when p.is_rooster_overridden_at is not null or p.rooster_checked_at > now() - make_interval(days => v_ttl_roo) then p.brand end,
        case when p.is_rooster_overridden_at is not null or p.rooster_checked_at > now() - make_interval(days => v_ttl_roo) then p.rooster_brands end,
        case when p.is_rooster_overridden_at is not null or p.rooster_checked_at > now() - make_interval(days => v_ttl_roo) then p.rooster_checked_at end,
        case when p.is_rooster_overridden_at is not null or p.rooster_checked_at > now() - make_interval(days => v_ttl_roo) then p.rooster_source end,
        p.is_rooster_overridden_at,
        case when p.contact_checked_at > now() - make_interval(days => v_ttl_con) then p.has_contact_details end,
        case when p.contact_checked_at > now() - make_interval(days => v_ttl_con) then p.contact_checked_at end,
        case when p.s_tags_checked_at > now() - make_interval(days => v_ttl_stag) then p.has_s_tags end,
        case when p.s_tags_checked_at > now() - make_interval(days => v_ttl_stag) then p.s_tags_checked_at end,
        p.first_lead_id,
        case when p.affiliate_checked_at is not null or p.rooster_checked_at is not null or p.contact_checked_at is not null or p.s_tags_checked_at is not null then now() end
      from tmp_lead_rows l
      left join public.website_profiles p on p.id = l.profile_id
      returning id, profile_id
  ),
  firsts as (
    select distinct on (profile_id) profile_id, id
    from ins
    where profile_id is not null
    order by profile_id, id
  )
  update public.website_profiles p
  set first_lead_id = f.id, updated_at = now()
  from firsts f
  where p.id = f.profile_id
    and p.first_lead_id is null;

  select count(*) into v_n from tmp_lead_rows;

  -- Point the existing appearance rows at the leads we just created, so the
  -- log and the table agree about what this scrape produced.
  update public.website_appearances a
  set lead_id = g.id, created_lead = true
  from public.google_lead_gen_table g
  where a.scrape_job_id = v_job.id
    and a.lead_id is null
    and g.scrape_job_id = v_job.id
    and g.url = a.url;

  return v_n;
end;
$function$;

comment on function public.replay_missing_leads(uuid) is
  'Rebuilds the lead rows a completed scrape should have written, from the job''s retained raw_results. Idempotent; no re-scrape, no new batch.';

grant execute on function public.replay_missing_leads(uuid) to service_role;

notify pgrst, 'reload schema';
