-- ============================================================================
-- Three features (2026-09-09): YAML custom scrape sources, pipeline recipes,
-- and the credits ledger (Stripe purchasing bolts on later).
-- ============================================================================

-- ---- custom scrape sources (YAML-defined JSON-API sources) -----------------
create table if not exists public.org_source_defs (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  key         text not null,
  definition  jsonb not null,
  raw_yaml    text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (org_id, key)
);
alter table public.org_source_defs enable row level security;  -- service-role only

-- ---- pipeline recipes -------------------------------------------------------
create table if not exists public.org_recipes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null check (char_length(name) between 2 and 80),
  steps      jsonb not null,
  last_run   jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists org_recipes_org_idx on public.org_recipes (org_id);
alter table public.org_recipes enable row level security;      -- service-role only

-- ---- credits ---------------------------------------------------------------
alter table public.org_settings
  add column if not exists credits_balance integer not null default 100;

create table if not exists public.org_credit_ledger (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  delta         integer not null,
  balance_after integer not null,
  reason        text not null,
  meta          jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists org_credit_ledger_org_idx on public.org_credit_ledger (org_id, id desc);
alter table public.org_credit_ledger enable row level security; -- service-role only

-- Atomic spend: decrements only when the balance covers it; ledger row per
-- movement. Service-role only (called from server actions).
create or replace function public.spend_credits(p_org uuid, p_amount int, p_reason text, p_meta jsonb default null)
returns int
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  update public.org_settings
  set credits_balance = credits_balance - p_amount
  where org_id = p_org and credits_balance >= p_amount
  returning credits_balance into v_balance;
  if v_balance is null then
    return -1;  -- insufficient
  end if;
  insert into public.org_credit_ledger (org_id, delta, balance_after, reason, meta)
  values (p_org, -p_amount, v_balance, p_reason, p_meta);
  return v_balance;
end;
$$;

create or replace function public.grant_credits(p_org uuid, p_amount int, p_reason text, p_meta jsonb default null)
returns int
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  update public.org_settings
  set credits_balance = credits_balance + p_amount
  where org_id = p_org
  returning credits_balance into v_balance;
  if v_balance is null then raise exception 'org has no settings row'; end if;
  insert into public.org_credit_ledger (org_id, delta, balance_after, reason, meta)
  values (p_org, p_amount, v_balance, p_reason, p_meta);
  return v_balance;
end;
$$;

revoke execute on function public.spend_credits(uuid,int,text,jsonb), public.grant_credits(uuid,int,text,jsonb) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid,int,text,jsonb), public.grant_credits(uuid,int,text,jsonb) to service_role;

-- Seed the three existing orgs with 1,000 credits each (idempotent-ish:
-- only bumps orgs still at the 100 default with no ledger history).
do $$
declare r record; v int;
begin
  for r in select os.org_id from public.org_settings os
           where os.credits_balance = 100
             and not exists (select 1 from public.org_credit_ledger l where l.org_id = os.org_id)
  loop
    update public.org_settings set credits_balance = 1000 where org_id = r.org_id
    returning credits_balance into v;
    insert into public.org_credit_ledger (org_id, delta, balance_after, reason)
    values (r.org_id, 1000, v, 'launch_grant');
  end loop;
end $$;

notify pgrst, 'reload schema';
