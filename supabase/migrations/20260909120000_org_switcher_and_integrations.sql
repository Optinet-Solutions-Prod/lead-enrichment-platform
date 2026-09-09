-- ============================================================================
-- Org switcher + per-org integrations (2026-09-09).
--
-- 1. ACTIVE ORG: users with 2+ memberships can switch workspaces. The chosen
--    org lives in user_profiles.active_org_id (validated against membership);
--    the JWT hook and the app context both prefer it, falling back to the
--    earliest membership as before. set_active_org() is the write path.
--
-- 2. ORG INTEGRATIONS: per-org third-party credentials (Milestone D v1).
--    config jsonb holds the field values INCLUDING secrets — RLS is enabled
--    with NO authenticated policies, so rows are readable/writable only via
--    the service role (server actions). Upgrade path: Supabase Vault.
-- ============================================================================

-- ---- active org -------------------------------------------------------------
alter table public.user_profiles
  add column if not exists active_org_id uuid references public.organizations(id) on delete set null;

create or replace function public.set_active_org(p_org_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of that organization';
  end if;
  update public.user_profiles set active_org_id = p_org_id where id = auth.uid();
end;
$$;
revoke execute on function public.set_active_org(uuid) from public, anon;
grant execute on function public.set_active_org(uuid) to authenticated, service_role;

-- Hook: prefer the user's chosen active org (when still a member), else the
-- earliest membership. Runs as supabase_auth_admin → needs user_profiles read.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
as $$
declare
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  v_uid  uuid  := (event->>'user_id')::uuid;
  v_org  uuid;
  v_role text;
begin
  select m.org_id, m.role into v_org, v_role
  from public.org_members m
  join public.user_profiles p on p.id = m.user_id and p.active_org_id = m.org_id
  where m.user_id = v_uid;

  if v_org is null then
    select org_id, role into v_org, v_role
    from public.org_members
    where user_id = v_uid
    order by joined_at asc
    limit 1;
  end if;

  if v_org is not null then
    claims := jsonb_set(claims, '{org_id}', to_jsonb(v_org::text));
    claims := jsonb_set(claims, '{org_role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.user_profiles to supabase_auth_admin;
drop policy if exists user_profiles_auth_admin_read on public.user_profiles;
create policy user_profiles_auth_admin_read on public.user_profiles
  for select to supabase_auth_admin using (true);

-- ---- per-org integrations ---------------------------------------------------
create table if not exists public.org_integrations (
  org_id         uuid not null references public.organizations(id) on delete cascade,
  provider       text not null,
  config         jsonb not null default '{}'::jsonb,  -- includes secrets; service-role only
  status         text not null default 'unverified'
                 check (status in ('unverified','connected','error')),
  tested_value   text,
  last_error     text,
  last_tested_at timestamptz,
  updated_by     uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now(),
  primary key (org_id, provider)
);
-- RLS on, deliberately NO authenticated policies: secrets never reach the
-- browser through PostgREST; all access flows through server actions.
alter table public.org_integrations enable row level security;

notify pgrst, 'reload schema';
