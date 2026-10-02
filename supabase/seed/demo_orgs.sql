-- Two demo workspaces for pitches, owned by admin@optinetsolutions.com:
--   "Demo Org"       — no gambling: VPN and web hosting scrapes only.
--   "Full Demo Org"  — everything, casino included.
-- Each gets its own COPY of the completed demo scrapes (jobs + results), so the
-- workspaces are independent: outreach set in one never shows in the other.
-- Idempotent: re-running skips an org that already exists.

do $$
declare
  v_admin uuid := (select id from auth.users where lower(email) = 'admin@optinetsolutions.com');
  v_src   uuid := (select id from public.organizations where slug = 'optinet-discovery');
  v_org   uuid;
  v_job   record;
  v_new_job uuid;
  v_groups jsonb;
  v_new_group uuid;
  v_cols  text;
  v_qcols text;
  spec    record;
begin
  if v_admin is null or v_src is null then
    raise exception 'admin user or source org missing';
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'google_lead_gen_table'
     and column_name not in ('id', 'org_id', 'scrape_job_id', 'inherited_from_lead_id')
     and is_generated = 'NEVER';

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_qcols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'scrape_queue' and is_generated = 'NEVER';

  for spec in
    select * from (values
      ('Demo Org', 'demo-org', false),
      ('Full Demo Org', 'full-demo-org', true)
    ) as t(name, slug, gambling)
  loop
    if exists (select 1 from public.organizations where slug = spec.slug) then
      raise notice 'skip %, exists', spec.slug;
      continue;
    end if;

    insert into public.organizations (name, slug, created_by, plan, status)
    values (spec.name, spec.slug, v_admin, 'pilot', 'active')
    returning id into v_org;
    insert into public.org_members (org_id, user_id, role) values (v_org, v_admin, 'owner');
    insert into public.org_settings (org_id, enabled_sources, enabled_modules, credits_balance, gambling_enabled)
    values (v_org, array['google'], array['affiliate'], 1000, spec.gambling);

    v_groups := '{}'::jsonb;
    for v_job in
      select * from public.scrape_queue
       where org_id = v_src
         and status = 'completed'
         and (spec.gambling or keyword !~* '(casino|gambl|betting|slots|poker|bookmaker)')
       order by created_at
    loop
      v_new_job := gen_random_uuid();
      if v_job.batch_group_id is not null then
        v_new_group := (v_groups ->> v_job.batch_group_id::text)::uuid;
        if v_new_group is null then
          v_new_group := gen_random_uuid();
          v_groups := v_groups || jsonb_build_object(v_job.batch_group_id::text, v_new_group);
        end if;
      else
        v_new_group := null;
      end if;

      execute format(
        'insert into public.scrape_queue (%1$s) select %1$s from jsonb_populate_record(null::public.scrape_queue, $1)',
        v_qcols)
      using to_jsonb(v_job) || jsonb_build_object(
              'id', v_new_job,
              'org_id', v_org,
              'batch_group_id', v_new_group,
              'parent_scrape_job_id', null,
              'runner_run_id', null);

      execute format(
        'insert into public.google_lead_gen_table (%1$s, org_id, scrape_job_id)
         select %1$s, $1, $2 from public.google_lead_gen_table where scrape_job_id = $3',
        v_cols)
      using v_org, v_new_job, v_job.id;
    end loop;
  end loop;
end;
$$;

select o.name, o.slug, s.gambling_enabled,
       (select count(*) from public.scrape_queue q where q.org_id = o.id) jobs,
       (select count(*) from public.google_lead_gen_table l where l.org_id = o.id) results,
       (select count(*) from public.org_website_profiles w where w.org_id = o.id) sites,
       (select string_agg(distinct keyword, ' | ') from public.scrape_queue q where q.org_id = o.id) keywords
  from public.organizations o join public.org_settings s on s.org_id = o.id
 order by o.created_at;
