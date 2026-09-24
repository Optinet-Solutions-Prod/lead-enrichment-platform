-- ============================================================================
-- Port from Google-Lead-Gen, part 2 (brief §1, §4, §7): AI website analysis
-- storage (triage + crawl + CTA links), the relevance-gated candidate list,
-- advanced scrape-batch search (pg_trgm), and the batch analysis summary.
-- Monday stripped: ai_candidates_for_job loses `p.is_on_monday = false`;
-- job_analysis_summary is two-way. Prod's CTA-noise cleanup migrations
-- (20260921100000/101000) are data fixes for rows written by an older
-- extractor — there are no rows here and the fixed extractor is what ports.
-- Both AI stages stay OFF by default (ai_analysis_enabled = false).
-- ============================================================================

-- Migration: AI website analysis.
--
-- Two new stages hang off the website profiles from 20260918120000:
--
--   1. TRIAGE  — a cheap, no-fetch screen over the leads that survived the
--                not-relevant / system-flag / relevance trim. Picks which sites
--                are worth paying to crawl. Writes ai_* triage columns.
--   2. CRAWL   — gpt-5-mini opens the shortlisted site and returns the
--                affiliate verdict, every brand it promotes with that brand's
--                verbatim CTA href, contacts, and the contact page.
--                Writes ai_crawl_* columns + one website_cta_links row per CTA.
--
-- Storage note (the "will this blow up the DB?" question): no page HTML is
-- kept. Only the extracted result, and only ONE row per website — a website
-- seen by 40 more scrapes updates the same row instead of adding anything.
-- The CTA links are a child table because the manual S-tag pass needs to tick
-- them off one by one and record what it found.

-- ---------------------------------------------------------------------------
-- 1. Triage + crawl columns on the profile
-- ---------------------------------------------------------------------------

alter table public.website_profiles
  -- triage (stage 1)
  add column if not exists ai_screened_at        timestamptz,
  add column if not exists ai_worth_checking     boolean,
  add column if not exists ai_screen_reason      text,
  add column if not exists ai_screen_model       text,
  -- crawl (stage 2)
  add column if not exists ai_crawl_at           timestamptz,
  add column if not exists ai_crawl_model        text,
  add column if not exists ai_crawl_status       text,   -- ok | blocked | error
  add column if not exists ai_is_affiliate       boolean,
  add column if not exists ai_affiliate_reason   text,
  add column if not exists ai_brands             jsonb,  -- [{name, cta_url}]
  add column if not exists ai_brand_count        integer,
  add column if not exists ai_cta_count          integer,
  add column if not exists ai_rooster_brands     jsonb,  -- names matching rooster_brands
  add column if not exists ai_new_brands         jsonb,  -- promoted brands we do NOT partner with
  add column if not exists ai_emails             jsonb,
  add column if not exists ai_phones             jsonb,
  add column if not exists ai_contact_page_url   text,
  add column if not exists ai_pages_opened       jsonb,
  add column if not exists ai_cost_usd           numeric(10,5),
  -- hand-off to the manual S-tag / contact pass
  add column if not exists manual_stag_status    text,   -- null | pending | in_progress | done
  add column if not exists manual_stag_at        timestamptz;

create index if not exists idx_website_profiles_ai_worth
  on public.website_profiles (ai_worth_checking, ai_screened_at desc)
  where ai_worth_checking = true;

create index if not exists idx_website_profiles_ai_affiliate
  on public.website_profiles (ai_is_affiliate)
  where ai_is_affiliate = true;

-- Queue view for the manual pass: confirmed affiliates with CTA links to walk.
create index if not exists idx_website_profiles_manual_stag
  on public.website_profiles (manual_stag_status)
  where manual_stag_status is not null;

-- ---------------------------------------------------------------------------
-- 2. One row per CTA link found on a website
-- ---------------------------------------------------------------------------

create table if not exists public.website_cta_links (
  id                 bigint generated always as identity primary key,
  profile_id         bigint      not null references public.website_profiles(id) on delete cascade,
  brand_name         text,
  -- the href exactly as it appears in the page (often a cloaked /go/... link)
  cta_url            text        not null,
  -- where that href actually lands after following the redirect chain
  resolved_url       text,
  resolved_host      text,
  redirect_hops      integer,
  -- tracker hostnames in the chain prove the traffic runs through Rooster
  is_rooster_tracker boolean     not null default false,
  tracker_host       text,
  -- does this brand match one of ours?
  is_rooster_brand   boolean     not null default false,
  unmask_status      text,       -- ok | dead | blocked | error | not_attempted
  -- the manual S-tag pass fills these in
  stag_checked_at    timestamptz,
  stag_found         text,
  stag_note          text,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  unique (profile_id, cta_url)
);

create index if not exists idx_website_cta_links_profile on public.website_cta_links (profile_id);
create index if not exists idx_website_cta_links_brand   on public.website_cta_links (brand_name);
create index if not exists idx_website_cta_links_rooster on public.website_cta_links (is_rooster_brand) where is_rooster_brand = true;
create index if not exists idx_website_cta_links_pending on public.website_cta_links (profile_id) where stag_checked_at is null;

alter table public.website_cta_links enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Settings for the two AI stages
-- ---------------------------------------------------------------------------

insert into public.system_settings (key, value) values
  ('ai_analysis_enabled',   'false'::jsonb),
  ('ai_triage_model',       '"gpt-5-mini"'::jsonb),
  ('ai_crawl_model',        '"gpt-5-mini"'::jsonb),
  -- hard ceilings so a big batch can never run away with the bill
  ('ai_crawl_daily_cap',    '150'::jsonb),
  ('ai_crawl_budget_usd',   '5'::jsonb),
  -- a crawl verdict older than this is re-done when the site shows up again
  ('ai_crawl_ttl_days',     '90'::jsonb)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------------
-- 4. The candidate list: what survived the trim and still needs AI work
--    (prod 20260921161000 — relevance gate included, Monday predicate dropped).
-- ---------------------------------------------------------------------------

create or replace function public.ai_candidates_for_job(p_job_ids uuid[])
returns table(
  profile_id        bigint,
  lead_id           bigint,
  normalized_domain text,
  url               text,
  keyword           text,
  country_code      text,
  ai_screened_at    timestamptz,
  ai_worth_checking boolean,
  ai_crawl_at       timestamptz,
  ai_is_affiliate   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (p.id)
    p.id, g.id, p.normalized_domain, g.url, g.keyword, g.country_code,
    p.ai_screened_at, p.ai_worth_checking, p.ai_crawl_at, p.ai_is_affiliate
  from public.google_lead_gen_table g
  join public.website_profiles p on p.id = g.profile_id
  where g.scrape_job_id = any(p_job_ids)
    and p.is_not_relevant = false
    and p.system_flag is null
    and g.url like 'http%'
    -- Relevant to the keyword, or an operator said to check it anyway.
    and (g.is_relevant is not false or g.relevance_overridden_at is not null)
  order by p.id, g.id;
$$;

grant execute on function public.ai_candidates_for_job(uuid[]) to service_role;
revoke execute on function public.ai_candidates_for_job(uuid[]) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Advanced search over scrape batches (prod 20260921140000 + 141000).
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;

-- Trigram indexes for the fuzzy paths. Without these, similarity() over
-- 85k lead domains is a sequential scan on every keystroke.
create index if not exists idx_scrape_queue_keyword_trgm
  on public.scrape_queue using gin (keyword gin_trgm_ops);
create index if not exists idx_scrape_queue_keyword_en_trgm
  on public.scrape_queue using gin (keyword_en gin_trgm_ops)
  where keyword_en is not null;
create index if not exists idx_leads_domain_trgm
  on public.google_lead_gen_table using gin (domain gin_trgm_ops)
  where domain is not null;

-- How close a trigram match has to be before we call it "similar".
-- 0.3 is permissive enough for a typo, tight enough to avoid noise.
create or replace function public.job_search_threshold()
returns real language sql immutable as $$ select 0.30::real $$;

create index if not exists idx_website_profiles_domain_trgm
  on public.website_profiles using gin (normalized_domain gin_trgm_ops);

create or replace function public.search_scrape_jobs(
  p_query      text    default '',
  p_countries  text[]  default null,
  p_engines    text[]  default null,
  p_statuses   text[]  default null,
  p_sources    text[]  default null,
  p_owners     text[]  default null,
  p_from       date    default null,
  p_to         date    default null,
  p_enrichment text    default null,
  p_limit      int     default 50,
  p_offset     int     default 0
)
returns table(
  job_id      uuid,
  score       real,
  reasons     text[],
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with
  tokens as (
    select array_remove(
             regexp_split_to_array(lower(btrim(coalesce(p_query, ''))), '\s+'),
             ''
           ) as t
  ),
  base as (
    select q.*, g.country_name
    from public.scrape_queue q
    left join public.gologin_profiles g on g.country_code = q.country_code
    where q.parent_scrape_job_id is null
      and (p_countries is null or array_length(p_countries, 1) is null or q.country_code = any(p_countries))
      and (p_engines   is null or array_length(p_engines, 1)   is null or q.search_engine = any(p_engines))
      and (p_statuses  is null or array_length(p_statuses, 1)  is null or q.status = any(p_statuses))
      and (p_sources   is null or array_length(p_sources, 1)   is null or q.scrape_source = any(p_sources))
      and (p_owners    is null or array_length(p_owners, 1)    is null or lower(q.created_by_email) = any(p_owners))
      and (p_from is null or q.created_at >= p_from::timestamptz)
      and (p_to   is null or q.created_at <  (p_to + 1)::timestamptz)
      and (
        p_enrichment is null
        or (p_enrichment = 'yes' and q.with_enrichment is true)
        or (p_enrichment = 'no'  and coalesce(q.with_enrichment, false) is false)
      )
  ),
  scored as (
    select
      b.id as job_id,
      (select min(m.s) from unnest((select t from tokens)) tok
         cross join lateral (
           select greatest(
             case when lower(b.keyword) = tok then 1.00
                  when lower(b.keyword) like tok || '%' then 0.90
                  when lower(b.keyword) like '%' || tok || '%' then 0.80
                  else 0 end,
             case when b.keyword_en is not null and lower(b.keyword_en) like '%' || tok || '%' then 0.75 else 0 end,
             case when lower(b.country_code) = tok then 0.85
                  when lower(coalesce(b.country_name, '')) like tok || '%' then 0.85
                  when lower(coalesce(b.status, '')) = tok then 0.70
                  when lower(coalesce(b.search_engine, '')) = tok then 0.70
                  when lower(coalesce(b.scrape_source, '')) = tok then 0.65
                  when lower(coalesce(b.language, '')) = tok then 0.60
                  when lower(coalesce(b.view_mode, '')) = tok then 0.60
                  when lower(coalesce(b.enrichment_status, '')) = tok then 0.60
                  else 0 end,
             case when lower(coalesce(b.created_by_display, '')) like '%' || tok || '%'
                    or lower(coalesce(b.created_by_username, '')) like '%' || tok || '%' then 0.70
                  else 0 end,
             case when tok ~ '^\d+$' and b.batch_id = tok::bigint then 0.95 else 0 end,
             -- Websites this batch found. Matched on the CLEAN domain and on
             -- the name without its TLD, so a partial ("jadaliyya") and a
             -- typo ("jadalliya") both land.
             coalesce((
               select greatest(
                        max(case when p.normalized_domain like '%' || tok || '%' then 0.78 else 0 end),
                        max(similarity(p.normalized_domain, tok)) * 0.70,
                        max(similarity(split_part(p.normalized_domain, '.', 1), tok)) * 0.75
                      )
               from public.google_lead_gen_table l
               join public.website_profiles p on p.id = l.profile_id
               where l.scrape_job_id = b.id
                 and (p.normalized_domain like '%' || tok || '%'
                      or similarity(p.normalized_domain, tok) > public.job_search_threshold()
                      or similarity(split_part(p.normalized_domain, '.', 1), tok) > public.job_search_threshold())
             ), 0),
             case when similarity(lower(b.keyword), tok) > public.job_search_threshold()
                  then similarity(lower(b.keyword), tok) * 0.65 else 0 end,
             case when lower(coalesce(b.error_message, '')) like '%' || tok || '%' then 0.50 else 0 end
           ) as s
         ) m
      ) as score,
      b.created_at
    from base b
  ),
  kept as (
    select s.job_id, s.score, s.created_at
    from scored s
    where (select coalesce(array_length(t, 1), 0) from tokens) = 0
       or s.score > 0
  ),
  counted as (
    select k.*, count(*) over () as total_count from kept k
  )
  select
    c.job_id,
    coalesce(c.score, 0)::real,
    (
      select array_remove(array[
        case when btrim(coalesce(p_query, '')) <> ''
                  and lower(b2.keyword) like '%' || lower(btrim(p_query)) || '%' then 'keyword' end,
        case when b2.keyword_en is not null and btrim(coalesce(p_query, '')) <> ''
                  and lower(b2.keyword_en) like '%' || lower(btrim(p_query)) || '%' then 'english keyword' end,
        case when exists (
               select 1
               from public.google_lead_gen_table l
               join public.website_profiles p on p.id = l.profile_id
               where l.scrape_job_id = b2.id
                 and btrim(coalesce(p_query, '')) <> ''
                 and (p.normalized_domain like '%' || lower(btrim(p_query)) || '%'
                      or similarity(p.normalized_domain, lower(btrim(p_query))) > public.job_search_threshold()
                      or similarity(split_part(p.normalized_domain, '.', 1), lower(btrim(p_query))) > public.job_search_threshold())
             ) then 'a website it found' end,
        case when c.score > 0 and c.score < 0.80 then 'close match' end
      ], null)
      from public.scrape_queue b2 where b2.id = c.job_id
    ) as reasons,
    c.total_count
  from counted c
  order by c.score desc, c.created_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
$$;

grant execute on function public.search_scrape_jobs(text, text[], text[], text[], text[], text[], date, date, text, int, int) to service_role;
revoke execute on function public.search_scrape_jobs(text, text[], text[], text[], text[], text[], date, date, text, int, int) from anon, authenticated;

/** Distinct values the advanced-search form offers, in one round trip. */
create or replace function public.job_search_facets()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'countries', (
      select coalesce(jsonb_agg(jsonb_build_object('code', country_code, 'name', country_name) order by country_name), '[]'::jsonb)
      from public.gologin_profiles where is_active
    ),
    'engines', (
      select coalesce(jsonb_agg(distinct search_engine), '[]'::jsonb)
      from public.scrape_queue where search_engine is not null
    ),
    'statuses', (
      select coalesce(jsonb_agg(distinct status), '[]'::jsonb)
      from public.scrape_queue where status is not null
    ),
    'sources', (
      select coalesce(jsonb_agg(distinct scrape_source), '[]'::jsonb)
      from public.scrape_queue where scrape_source is not null
    ),
    'owners', (
      select coalesce(jsonb_agg(o order by o->>'label'), '[]'::jsonb) from (
        select distinct jsonb_build_object(
          'email', lower(created_by_email),
          'label', coalesce(created_by_display, created_by_username, split_part(created_by_email, '@', 1))
        ) as o
        from public.scrape_queue where created_by_email is not null
      ) s
    )
  );
$$;

grant execute on function public.job_search_facets() to service_role;
revoke execute on function public.job_search_facets() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- job_analysis_summary (prod 20260921170000) — TWO-way "already exists?"
-- (in system / new): the Monday branch and its on_monday column are gone,
-- and rooster_partners is dropped (not a SaaS stage). Everything else as prod.
-- ---------------------------------------------------------------------------
create or replace function public.job_analysis_summary(p_job_ids uuid[])
returns table (
  total              bigint,
  relevant           bigint,
  off_keyword        bigint,
  relevance_unknown  bigint,
  in_system          bigint,
  brand_new          bigint,
  affiliate_yes      bigint,
  affiliate_no       bigint,
  affiliate_unknown  bigint,
  with_contacts      bigint,
  distinct_domains   bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select g.is_relevant, g.is_affiliate, g.has_contact_details, g.profile_id,
           g.created_at, p.first_seen_at
    from public.google_lead_gen_table g
    left join public.website_profiles p on p.id = g.profile_id
    where g.scrape_job_id = any(p_job_ids)
      and g.is_not_relevant = false
      and g.system_flag is null
  ),
  classified as (
    select *,
      case
        -- A minute of slack so the rows of one batch do not mark each other
        -- as pre-existing. Mirrors existingState() in the app.
        when first_seen_at is not null and first_seen_at < created_at - interval '1 minute' then 'system'
        else 'new'
      end as existing_state
    from rows
  )
  select
    count(*),
    count(*) filter (where is_relevant is true),
    count(*) filter (where is_relevant is false),
    count(*) filter (where is_relevant is null),
    count(*) filter (where existing_state = 'system'),
    count(*) filter (where existing_state = 'new'),
    count(*) filter (where is_affiliate is true),
    count(*) filter (where is_affiliate is false),
    count(*) filter (where is_affiliate is null),
    count(*) filter (where has_contact_details is true),
    count(distinct profile_id)
  from classified;
$$;

comment on function public.job_analysis_summary(uuid[]) is
  'Counts for the analysis strip on the batch view: relevance, whether the website was already known, and how far enrichment got. Excludes rows hidden as not-relevant or system-flagged.';

grant execute on function public.job_analysis_summary(uuid[]) to service_role;
revoke execute on function public.job_analysis_summary(uuid[]) from anon, authenticated;

notify pgrst, 'reload schema';
