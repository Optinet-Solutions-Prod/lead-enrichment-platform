-- ============================================================================
-- De-verticalize the enrichment chain (SaaS): drop the Rooster partner stage.
--
-- The auto chain is now: affiliate → complete. S-tag extraction and contact
-- extraction remain operator-triggered (manual), unchanged. The rooster
-- columns/tables (rooster_brands, is_rooster_partner, rooster_checked_at,
-- s_tags.is_rooster_brand) are left in place as inert data — no jobs are
-- enqueued for the stage anymore, so the VM/score-row rooster path never runs.
--
-- Legacy note: jobs already sitting in 'all_running' (the old waiting-on-
-- rooster status) complete as soon as no rooster fetch is in flight.
-- ============================================================================

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
$function$;

notify pgrst, 'reload schema';
