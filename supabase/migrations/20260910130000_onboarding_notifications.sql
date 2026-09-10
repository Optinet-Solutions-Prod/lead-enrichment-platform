-- ============================================================================
-- Phase A of the onboarding/monetization plan (docs/saas/05, 2026-09-10):
-- tour state, billing flags (global kill-switch + per-org mode + currency),
-- in-app notifications, and in-house credit vouchers (promo before Stripe).
-- ============================================================================

-- Interactive tour progress: {version, completedAt|skippedAt, step}
alter table public.user_profiles
  add column if not exists tour_state jsonb;

-- Per-org billing: 'credits' (normal debits) | 'unlimited' (no debits, badge);
-- display currency for the packs page.
alter table public.org_settings
  add column if not exists billing_mode text not null default 'credits',
  add column if not exists currency text not null default 'EUR';
alter table public.org_settings drop constraint if exists org_settings_billing_mode_chk;
alter table public.org_settings
  add constraint org_settings_billing_mode_chk check (billing_mode in ('credits','unlimited'));
alter table public.org_settings drop constraint if exists org_settings_currency_chk;
alter table public.org_settings
  add constraint org_settings_currency_chk check (currency in ('EUR','USD'));

-- Global pricing kill-switch. ON at launch so the owner can review the
-- billing surfaces; flipping it off hides every price/balance and stops
-- debits platform-wide (the "billing pending" mode as a toggle, not a edit).
insert into public.system_settings (key, value)
values ('billing_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- ---- in-app notifications (bell) -------------------------------------------
-- One row per recipient (emits fan out to all org members). Service-role
-- only, like every org-scoped table: reads/writes happen in server code.
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  href       text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, id desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;  -- deny-all: service-role only

-- ---- credit vouchers (in-house promo codes, free credits) ------------------
create table if not exists public.credit_vouchers (
  code            text primary key check (code ~ '^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$'),
  credits         int not null check (credits between 1 and 100000),
  max_redemptions int not null default 1 check (max_redemptions >= 1),
  redeemed_count  int not null default 0,
  expires_at      timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create table if not exists public.voucher_redemptions (
  code        text not null references public.credit_vouchers(code) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  primary key (code, org_id)
);
alter table public.credit_vouchers enable row level security;      -- service-role only
alter table public.voucher_redemptions enable row level security;  -- service-role only

-- Redeem into the caller's ACTIVE org (owner/admin only, once per org,
-- respecting expiry + max redemptions). Row-locked so concurrent redeems
-- can't oversell a limited code. Mirrors grant_credits' ledger discipline.
create or replace function public.redeem_voucher(p_code text)
returns int
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.current_org_id();
  v_voucher public.credit_vouchers;
  v_balance int;
begin
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception 'must be an organization owner or admin';
  end if;

  select * into v_voucher from public.credit_vouchers
  where code = upper(trim(p_code))
  for update;
  if v_voucher.code is null then
    raise exception 'code not found';
  end if;
  if v_voucher.expires_at is not null and v_voucher.expires_at < now() then
    raise exception 'this code has expired';
  end if;
  if v_voucher.redeemed_count >= v_voucher.max_redemptions then
    raise exception 'this code has been fully redeemed';
  end if;
  if exists (
    select 1 from public.voucher_redemptions
    where code = v_voucher.code and org_id = v_org
  ) then
    raise exception 'your organization already redeemed this code';
  end if;

  insert into public.voucher_redemptions (code, org_id, redeemed_by)
  values (v_voucher.code, v_org, auth.uid());
  update public.credit_vouchers
  set redeemed_count = redeemed_count + 1
  where code = v_voucher.code;

  update public.org_settings
  set credits_balance = credits_balance + v_voucher.credits
  where org_id = v_org
  returning credits_balance into v_balance;
  if v_balance is null then
    raise exception 'org has no settings row';
  end if;
  insert into public.org_credit_ledger (org_id, delta, balance_after, reason, meta)
  values (v_org, v_voucher.credits, v_balance, 'voucher',
          jsonb_build_object('code', v_voucher.code, 'by', auth.uid()));
  return v_balance;
end;
$$;

revoke execute on function public.redeem_voucher(text) from public, anon;
grant execute on function public.redeem_voucher(text) to authenticated, service_role;

notify pgrst, 'reload schema';
