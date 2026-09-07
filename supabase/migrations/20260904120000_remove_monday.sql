-- ============================================================================
-- Remove Monday.com from the database layer (SaaS line — Milestone A).
--
-- The 8 Monday mirror tables were already dropped at fork time (2026-09-04,
-- see docs/saas/03-ENV-AND-ISOLATION.md). This migration removes the now-dead
-- functions that read them, unschedules the inherit cron, and rewrites the
-- three load-bearing functions that carried a Monday step:
--   * advance_enrichment_chain  — drop the inherit call + is_on_monday gates
--   * mark_s_tag_duplicates_for_job — keep the checked_at stamping, drop the
--     Monday cross-check (matched is always 0 now)
--   * replace_and_verify_s_tags_for_lead — keep insert/guard/rooster logic,
--     drop the Monday match block
--
-- Monday COLUMNS (google_lead_gen_table.is_on_monday / monday_*, s_tags
-- monday_*, *_links is_known_on_monday, user_profiles.monday_user_id) are
-- intentionally KEPT for now — they're inert defaults; dropping them comes in
-- a later cleanup migration once no code path references them anywhere.
-- ============================================================================

-- 1. Unschedule the inherit-monday-data cron (calls inherit_monday_data_batch)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'inherit-monday-data') then
    perform cron.unschedule('inherit-monday-data');
  end if;
end $$;

-- 2. advance_enrichment_chain without Monday: no inherit step, no
--    is_on_monday / monday_inherited_at gating — every fetchable lead counts.
create or replace function public.advance_enrichment_chain(p_job_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_job         public.scrape_queue;
  v_total       integer;
  v_aff_done    integer;
  v_other_done  integer;
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
    and url is not null and url like 'http%'
    and country_code is not null;

  if v_total = 0 then
    update public.scrape_queue
    set enrichment_status = 'complete', enrichment_completed_at = v_now
    where id = p_job_id;
    return 'complete';
  end if;

  -- Stage 1: affiliate
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
      and g.is_affiliate_overridden_at is null
      and g.affiliate_checked_at is null;

    update public.scrape_queue
    set enrichment_status = 'affiliate_running',
        enrichment_started_at = coalesce(enrichment_started_at, v_now)
    where id = p_job_id;
    return 'affiliate_running';
  end if;

  -- Stage 2: rooster (enqueued once affiliate resolved). Contact + s-tag are
  -- operator-triggered, so they are NOT enqueued or waited on here any more.
  if v_job.enrichment_status = 'affiliate_running' then
    select count(*) into v_aff_done
    from public.google_lead_gen_table g
    where g.scrape_job_id = p_job_id
      and g.is_not_relevant = false
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

    insert into public.enrichment_fetch_queue (
      lead_id, country_code, url, want_html, want_screenshot, process_stages
    )
    select g.id, g.country_code, g.url, true, false, '["rooster"]'::jsonb
    from public.google_lead_gen_table g
    where g.scrape_job_id = p_job_id
      and g.url is not null and g.url like 'http%'
      and g.country_code is not null
      and g.is_not_relevant = false
      and g.is_rooster_overridden_at is null
      and g.rooster_checked_at is null;

    update public.scrape_queue set enrichment_status = 'all_running' where id = p_job_id;
    return 'all_running';
  end if;

  -- Stage 3: wait for rooster ONLY, then complete.
  if v_job.enrichment_status = 'all_running' then
    select count(*) into v_other_done
    from public.google_lead_gen_table g
    where g.scrape_job_id = p_job_id
      and g.is_not_relevant = false
      and g.url is not null and g.url like 'http%'
      and g.country_code is not null
      and (
        g.is_rooster_overridden_at is not null
        or g.rooster_checked_at is not null
        or not exists (
          select 1 from public.enrichment_fetch_queue q
          where q.lead_id = g.id and q.process_stages @> '["rooster"]'::jsonb
            and q.status in ('pending', 'running', 'paused')
        )
      );

    if v_other_done < v_total then
      return 'all_running';
    end if;

    update public.scrape_queue
    set enrichment_status = 'complete', enrichment_completed_at = v_now
    where id = p_job_id;
    return 'complete';
  end if;

  return v_job.enrichment_status;
end;
$function$;

-- 3. mark_s_tag_duplicates_for_job without the Monday cross-check. The
--    function survives because callers rely on it stamping
--    stag_check_checked_at on the job's leads; "matched" is always 0 now.
create or replace function public.mark_s_tag_duplicates_for_job(p_job_id uuid)
 returns table(checked integer, matched integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_checked integer := 0;
  v_now     timestamptz := now();
begin
  select count(*)::integer into v_checked
  from s_tags_table t
  join google_lead_gen_table g on g.id = t.lead_id
  where g.scrape_job_id = p_job_id;

  update google_lead_gen_table g
  set stag_check_checked_at = v_now
  where g.id in (
    select distinct t.lead_id
    from s_tags_table t
    join google_lead_gen_table gl on gl.id = t.lead_id
    where gl.scrape_job_id = p_job_id
  );

  return query select v_checked, 0;
end;
$function$;

-- 4. replace_and_verify_s_tags_for_lead without the Monday match block.
--    Insert/guard/rooster logic unchanged; "matched" is always 0 now.
create or replace function public.replace_and_verify_s_tags_for_lead(p_lead_id bigint, p_tags jsonb)
 returns table(inserted integer, matched integer, rooster integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_inserted integer := 0;
  v_rooster  integer := 0;
  v_first_id bigint;
  v_now      timestamptz := now();
  v_has_usable boolean := false;
begin
  -- Does the payload carry at least one usable row (non-empty s_tag
  -- OR non-empty brand)? Empty on both is a genuine dead extraction.
  if p_tags is not null and jsonb_typeof(p_tags) = 'array' then
    select exists (
      select 1
      from jsonb_array_elements(p_tags) t
      where coalesce(t->>'s_tag', '') <> ''
         or coalesce(t->>'brand', '') <> ''
    ) into v_has_usable;
  end if;

  -- GUARD: keep the protective behaviour from 20260706120000 when
  -- the payload is truly empty (transient consent-wall / geo-block
  -- misses would otherwise destroy proven tags). Only fire the
  -- guard when NO row has either tag or brand.
  if not v_has_usable then
    update public.google_lead_gen_table g
    set s_tags_checked_at     = v_now,
        stag_check_checked_at = v_now
    where g.id = p_lead_id;
    return query select 0, 0, 0;
    return;
  end if;

  -- Non-empty payload: replace the full set (original behaviour).
  delete from public.s_tags_table where lead_id = p_lead_id;

  insert into public.s_tags_table (
    lead_id, s_tag, source_param, brand,
    tracking_url, final_url, redirect_chain, screenshot_path,
    extracted_via
  )
  select
    p_lead_id,
    t->>'s_tag',
    t->>'source_param',
    t->>'brand',
    t->>'tracking_url',
    t->>'final_url',
    t->'redirect_chain',
    t->>'screenshot_path',
    t->>'extracted_via'
  from jsonb_array_elements(p_tags) t
  -- Keep every row with EITHER a tag or a brand. Empty-both is
  -- garbage from a broken extraction — skip it.
  where coalesce(t->>'s_tag', '') <> ''
     or coalesce(t->>'brand', '') <> '';

  select count(*)::integer into v_inserted
  from public.s_tags_table where lead_id = p_lead_id;

  select id into v_first_id
  from public.s_tags_table
  where lead_id = p_lead_id
  order by id asc
  limit 1;

  update public.s_tags_table s
  set is_rooster_brand = exists (
    select 1
    from public.rooster_brands r
    where r.is_active = true
      and lower(r.domain) = lower(coalesce(s.brand, ''))
  )
  where s.lead_id = p_lead_id;

  update public.google_lead_gen_table g
  set s_tag_id              = v_first_id,
      has_s_tags            = (v_inserted > 0),
      s_tags_checked_at     = v_now,
      stag_check_checked_at = v_now
  where g.id = p_lead_id;

  select count(*)::integer
    into v_rooster
  from public.s_tags_table
  where lead_id = p_lead_id and is_rooster_brand = true;

  return query select v_inserted, 0, v_rooster;
end;
$function$;

-- 5. Drop the Monday-only functions (their tables are already gone; plpgsql
--    is late-binding so they only error when CALLED — which nothing does
--    after this milestone).
drop trigger if exists trg_affiliate_from_monday on public.google_lead_gen_table;
drop function if exists public.search_website_on_monday(p_domain text);
drop function if exists public.search_s_tag_on_monday(p_tag text);
drop function if exists public.search_monday_candidates(p_domain text, p_limit integer);
drop function if exists public.mark_monday_duplicates_for_job(p_job_id uuid);
drop function if exists public.rematch_monday_for_leads(p_lead_ids bigint[]);
drop function if exists public.rematch_monday_for_all_leads(p_limit integer);
drop function if exists public.get_monday_item_for_lead(p_lead_id bigint);
drop function if exists public.inherit_monday_data_for_lead(p_lead_id bigint);
drop function if exists public.inherit_monday_data_batch(p_limit integer);
drop function if exists public.backfill_monday_overridden_chunk(p_min bigint, p_max bigint);
drop function if exists public.sync_affiliate_from_monday_board();

notify pgrst, 'reload schema';
