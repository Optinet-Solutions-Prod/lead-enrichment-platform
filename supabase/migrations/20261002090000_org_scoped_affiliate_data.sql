-- Affiliate data becomes organization-scoped.
--
-- Before: scrape_queue and google_lead_gen_table had no org column, so every
-- workspace saw every scrape. After:
--   * scrape_queue.org_id / google_lead_gen_table.org_id, filled by triggers so
--     every insert path (wizard, retry, scheduler, Apify ingest RPC) is covered;
--   * org_website_profiles: which sites an org has found, plus that org's own
--     outreach status (website_profiles stays the shared, public site record);
--   * org_settings.gambling_enabled: casino presets and keyword ideas only for
--     orgs that opt in (new orgs: off — we sell to brands in every vertical).
-- Existing rows belong to "Optinet Discovery" (the admin workspace that ran them).

-- 1. Columns ---------------------------------------------------------------
alter table public.scrape_queue
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.google_lead_gen_table
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;
create index if not exists scrape_queue_org_created_idx on public.scrape_queue (org_id, created_at desc);
create index if not exists google_lead_gen_org_idx on public.google_lead_gen_table (org_id, created_at desc);
create index if not exists google_lead_gen_org_profile_idx on public.google_lead_gen_table (org_id, profile_id);

alter table public.org_settings
  add column if not exists gambling_enabled boolean not null default false;

-- 2. Backfill ---------------------------------------------------------------
update public.scrape_queue
   set org_id = (select id from public.organizations where slug = 'optinet-discovery')
 where org_id is null;
update public.google_lead_gen_table l
   set org_id = coalesce(
         (select q.org_id from public.scrape_queue q where q.id = l.scrape_job_id),
         (select id from public.organizations where slug = 'optinet-discovery'))
 where org_id is null;

-- 3. Fill org_id on insert ---------------------------------------------------
-- A job takes its org from its parent / batch sibling, else from the creator's
-- active workspace (same rule as the JWT hook: active_org_id, else the earliest
-- membership).
create or replace function public.scrape_queue_fill_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is not null then
    return new;
  end if;
  if new.parent_scrape_job_id is not null then
    select org_id into new.org_id from public.scrape_queue where id = new.parent_scrape_job_id;
  end if;
  if new.org_id is null and new.batch_group_id is not null then
    select org_id into new.org_id from public.scrape_queue
     where batch_group_id = new.batch_group_id and org_id is not null limit 1;
  end if;
  if new.org_id is null and new.created_by_email is not null then
    select coalesce(
             (select p.active_org_id from public.user_profiles p
               where p.id = u.id
                 and exists (select 1 from public.org_members m where m.user_id = u.id and m.org_id = p.active_org_id)),
             (select m.org_id from public.org_members m where m.user_id = u.id order by m.joined_at limit 1))
      into new.org_id
      from auth.users u
     where lower(u.email) = lower(new.created_by_email)
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_scrape_queue_fill_org on public.scrape_queue;
create trigger trg_scrape_queue_fill_org
  before insert on public.scrape_queue
  for each row execute function public.scrape_queue_fill_org();

create or replace function public.lead_fill_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is null and new.scrape_job_id is not null then
    select org_id into new.org_id from public.scrape_queue where id = new.scrape_job_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_fill_org on public.google_lead_gen_table;
create trigger trg_lead_fill_org
  before insert on public.google_lead_gen_table
  for each row execute function public.lead_fill_org();

-- 4. Per-org view of a website + that org's outreach ------------------------
create table if not exists public.org_website_profiles (
  org_id             uuid   not null references public.organizations(id) on delete cascade,
  profile_id         bigint not null references public.website_profiles(id) on delete cascade,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  appearance_count   integer not null default 0,
  outreach_status    public.outreach_status not null default 'new',
  contacted_at       timestamptz,
  next_follow_up_at  date,
  outreach_note      text,
  outreach_updated_at timestamptz,
  outreach_updated_by text,
  primary key (org_id, profile_id)
);
create index if not exists org_website_profiles_profile_idx on public.org_website_profiles (profile_id);
create index if not exists org_website_profiles_follow_idx on public.org_website_profiles (org_id, next_follow_up_at);
alter table public.org_website_profiles enable row level security;
revoke all on public.org_website_profiles from anon, authenticated;

-- Keep the link current whenever a lead gets (or changes) its profile.
create or replace function public.lead_link_org_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is null or new.profile_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.profile_id is not distinct from new.profile_id and old.org_id is not distinct from new.org_id then
    return new;
  end if;
  insert into public.org_website_profiles as o (org_id, profile_id, first_seen_at, last_seen_at, appearance_count)
  values (new.org_id, new.profile_id, coalesce(new.created_at, now()), coalesce(new.created_at, now()), 1)
  on conflict (org_id, profile_id) do update
     set last_seen_at = greatest(o.last_seen_at, excluded.last_seen_at),
         first_seen_at = least(o.first_seen_at, excluded.first_seen_at),
         appearance_count = o.appearance_count + 1;
  return new;
end;
$$;

drop trigger if exists trg_lead_link_org_profile on public.google_lead_gen_table;
create trigger trg_lead_link_org_profile
  after insert or update of profile_id, org_id on public.google_lead_gen_table
  for each row execute function public.lead_link_org_profile();

-- Backfill links (and carry over any outreach already recorded on the shared row).
insert into public.org_website_profiles (org_id, profile_id, first_seen_at, last_seen_at, appearance_count)
select l.org_id, l.profile_id, min(l.created_at), max(l.created_at), count(*)
  from public.google_lead_gen_table l
 where l.org_id is not null and l.profile_id is not null
 group by l.org_id, l.profile_id
on conflict (org_id, profile_id) do nothing;

update public.org_website_profiles o
   set outreach_status = w.outreach_status,
       contacted_at = w.contacted_at,
       next_follow_up_at = w.next_follow_up_at,
       outreach_note = w.outreach_note,
       outreach_updated_at = w.outreach_updated_at,
       outreach_updated_by = w.outreach_updated_by
  from public.website_profiles w
 where w.id = o.profile_id
   and o.org_id = (select id from public.organizations where slug = 'optinet-discovery')
   and (w.outreach_status <> 'new' or w.outreach_note is not null or w.next_follow_up_at is not null);

-- 5. Gambling switch for the existing workspaces (they ran casino scrapes) ---
update public.org_settings set gambling_enabled = true
 where org_id in (select id from public.organizations where slug in ('optinet-discovery', 'optinet-solutions', 'rooster-partners'));
