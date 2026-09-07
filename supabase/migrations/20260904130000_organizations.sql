-- ============================================================================
-- Organizations core (SaaS Milestone B — docs/saas/04-BUILD-PLAN.md §3).
--
-- Tables: organizations, org_members, org_invites, org_settings, usage_events.
-- All WRITES go through security-definer RPCs (called with the USER's session
-- client so auth.uid() is real); direct table access for authenticated users
-- is read-only via RLS. Service role bypasses RLS as usual (workers/cron).
--
-- JWT: custom_access_token_hook stamps org_id + org_role into every access
-- token at sign-in/refresh (enabled via the Management API auth config).
-- Single-org-per-user in v1: the hook picks the earliest membership.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 80),
  slug       text not null unique,
  plan       text not null default 'pilot',
  status     text not null default 'active' check (status in ('active','suspended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id    uuid not null references public.organizations(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members(user_id);

create table if not exists public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  role        text not null default 'member' check (role in ('admin','member')),
  token_hash  text not null,
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);
-- one live invite per org+email (accepted ones stay as history)
create unique index if not exists org_invites_live_uidx
  on public.org_invites (org_id, lower(email))
  where accepted_at is null;

create table if not exists public.org_settings (
  org_id                     uuid primary key references public.organizations(id) on delete cascade,
  enabled_sources            text[] not null default '{google}',
  enabled_countries          text[] not null default '{}',  -- empty = all allowed (dev default)
  daily_scrape_cap           integer,
  max_concurrent_per_country integer,
  updated_at                 timestamptz not null default now()
);

create table if not exists public.usage_events (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  kind       text not null,          -- scrape_job | lead_enriched | captcha_solve | ...
  qty        integer not null default 1,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_org_kind_idx
  on public.usage_events (org_id, kind, created_at);

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer → no RLS recursion on org_members)
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = auth.uid()
      and role in ('owner','admin')
  );
$$;

-- The caller's org (single-org v1): prefer the JWT claim (fast path, set by
-- the access-token hook), fall back to the membership table right after a
-- signup/join when the token hasn't been refreshed yet.
create or replace function public.current_org_id()
returns uuid
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  v_org := nullif(auth.jwt()->>'org_id', '')::uuid;
  if v_org is not null then
    return v_org;
  end if;
  select org_id into v_org
  from public.org_members
  where user_id = auth.uid()
  order by joined_at asc
  limit 1;
  return v_org;
end;
$$;

revoke execute on function public.is_org_member(uuid), public.is_org_admin(uuid), public.current_org_id() from public, anon;
grant execute on function public.is_org_member(uuid), public.is_org_admin(uuid), public.current_org_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: authenticated users read their own org's rows; writes via RPCs only.
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;
alter table public.org_invites   enable row level security;
alter table public.org_settings  enable row level security;
alter table public.usage_events  enable row level security;

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
  for select to authenticated using (public.is_org_member(id));

drop policy if exists org_members_member_read on public.org_members;
create policy org_members_member_read on public.org_members
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists org_invites_admin_read on public.org_invites;
create policy org_invites_admin_read on public.org_invites
  for select to authenticated using (public.is_org_admin(org_id));

drop policy if exists org_settings_member_read on public.org_settings;
create policy org_settings_member_read on public.org_settings
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists usage_events_member_read on public.usage_events;
create policy usage_events_member_read on public.usage_events
  for select to authenticated using (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- Write RPCs (call with the USER's session client — they trust auth.uid()).
-- ---------------------------------------------------------------------------

-- Create an org and become its owner. Single-org v1: refuses when the caller
-- already belongs to one.
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_slug text;
  v_n    integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.org_members where user_id = v_uid) then
    raise exception 'already a member of an organization';
  end if;
  if p_name is null or char_length(trim(p_name)) < 2 then
    raise exception 'organization name must be at least 2 characters';
  end if;

  -- slug: lowercased name, non-alphanumerics collapsed to '-', suffixed on collision
  v_slug := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'org'; end if;
  while exists (select 1 from public.organizations where slug = v_slug || case when v_n = 0 then '' else '-' || v_n end) loop
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then v_slug := v_slug || '-' || v_n; end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(p_name), v_slug, v_uid)
  returning id into v_org;

  insert into public.org_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.org_settings (org_id) values (v_org);

  return v_org;
end;
$$;

-- Invite an email into the caller's org. Returns the one-time token — the
-- caller shows/sends the /invite/<token> link; only the hash is stored.
create or replace function public.create_org_invite(p_email text, p_role text default 'member')
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_org   uuid := public.current_org_id();
  v_token text;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception 'must be an organization owner or admin to invite';
  end if;
  if p_role not in ('admin','member') then
    raise exception 'role must be admin or member';
  end if;
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'valid email required';
  end if;
  if exists (
    select 1 from public.org_members m
    join auth.users u on u.id = m.user_id
    where m.org_id = v_org and lower(u.email) = lower(trim(p_email))
  ) then
    raise exception 'that email is already a member of this organization';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  -- replace any live (unaccepted) invite for the same email
  delete from public.org_invites
  where org_id = v_org and lower(email) = lower(trim(p_email)) and accepted_at is null;

  insert into public.org_invites (org_id, email, role, token_hash, invited_by)
  values (v_org, trim(p_email), p_role,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
  returning id, org_invites.expires_at into v_id, v_exp;

  return query select v_id, v_token, v_exp;
end;
$$;

create or replace function public.revoke_org_invite(p_invite_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.org_invites where id = p_invite_id;
  if v_org is null then return; end if;
  if not public.is_org_admin(v_org) then
    raise exception 'must be an organization owner or admin';
  end if;
  delete from public.org_invites where id = p_invite_id and accepted_at is null;
end;
$$;

-- Accept an invite (logged-in invitee). The signed-in email must match the
-- invited email — an invite link is not a bearer grant to any account.
create or replace function public.accept_org_invite(p_token text)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_invite public.org_invites;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select email into v_email from auth.users where id = v_uid;

  select * into v_invite
  from public.org_invites
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and accepted_at is null;

  if v_invite.id is null then
    raise exception 'invite not found or already used';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'invite has expired — ask for a new one';
  end if;
  if lower(v_invite.email) <> lower(coalesce(v_email, '')) then
    raise exception 'this invite was issued for %', v_invite.email;
  end if;
  if exists (select 1 from public.org_members where user_id = v_uid) then
    raise exception 'already a member of an organization';
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_invite.org_id, v_uid, v_invite.role);

  update public.org_invites
  set accepted_at = now(), accepted_by = v_uid
  where id = v_invite.id;

  return v_invite.org_id;
end;
$$;

create or replace function public.remove_org_member(p_user_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.current_org_id();
  v_target_role text;
begin
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception 'must be an organization owner or admin';
  end if;
  select role into v_target_role from public.org_members
  where org_id = v_org and user_id = p_user_id;
  if v_target_role is null then return; end if;
  if v_target_role = 'owner' then
    raise exception 'the owner cannot be removed';
  end if;
  delete from public.org_members where org_id = v_org and user_id = p_user_id;
end;
$$;

create or replace function public.set_org_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null or not exists (
    select 1 from public.org_members
    where org_id = v_org and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'only the owner can change roles';
  end if;
  if p_role not in ('admin','member') then
    raise exception 'role must be admin or member';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'the owner role cannot be reassigned here';
  end if;
  update public.org_members set role = p_role
  where org_id = v_org and user_id = p_user_id and role <> 'owner';
end;
$$;

create or replace function public.rename_organization(p_name text)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception 'must be an organization owner or admin';
  end if;
  if p_name is null or char_length(trim(p_name)) < 2 then
    raise exception 'organization name must be at least 2 characters';
  end if;
  update public.organizations
  set name = trim(p_name), updated_at = now()
  where id = v_org;
end;
$$;

revoke execute on function
  public.create_organization(text),
  public.create_org_invite(text, text),
  public.revoke_org_invite(uuid),
  public.accept_org_invite(text),
  public.remove_org_member(uuid),
  public.set_org_member_role(uuid, text),
  public.rename_organization(text)
from public, anon;
grant execute on function
  public.create_organization(text),
  public.create_org_invite(text, text),
  public.revoke_org_invite(uuid),
  public.accept_org_invite(text),
  public.remove_org_member(uuid),
  public.set_org_member_role(uuid, text),
  public.rename_organization(text)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Custom access token hook: stamp org_id + org_role claims at sign-in/refresh.
-- Runs as supabase_auth_admin. Enabled via Management API auth config
-- (hook_custom_access_token_uri = pg-functions://postgres/public/custom_access_token_hook).
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
as $$
declare
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  v_org  uuid;
  v_role text;
begin
  select org_id, role into v_org, v_role
  from public.org_members
  where user_id = (event->>'user_id')::uuid
  order by joined_at asc
  limit 1;

  if v_org is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org::text));
    claims := jsonb_set(claims, '{org_role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.org_members to supabase_auth_admin;

drop policy if exists org_members_auth_admin_read on public.org_members;
create policy org_members_auth_admin_read on public.org_members
  for select to supabase_auth_admin using (true);

notify pgrst, 'reload schema';
