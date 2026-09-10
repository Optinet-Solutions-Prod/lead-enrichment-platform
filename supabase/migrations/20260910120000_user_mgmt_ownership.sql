-- ============================================================================
-- User management round-out (2026-09-10):
--   1. transfer_org_ownership — the "use admin as owner until transfer exists"
--      placeholder becomes a real feature (owner hands the org to a member,
--      stepping down to admin).
--   2. leave_organization — self-service exit for non-owners.
--   3. accept_org_invite relaxed to per-org membership: a user may belong to
--      SEVERAL organizations (the workspace switcher already handles it);
--      the old guard blocked any second membership outright.
-- ============================================================================

-- Owner hands the org to an existing member and steps down to admin. One
-- owner per org is an invariant everywhere (nav gating, RPC guards), so the
-- two updates happen in the same transaction-scoped function.
create or replace function public.transfer_org_ownership(p_user_id uuid)
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
    raise exception 'only the owner can transfer ownership';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'you already own this organization';
  end if;
  if not exists (
    select 1 from public.org_members where org_id = v_org and user_id = p_user_id
  ) then
    raise exception 'the new owner must already be a member of this organization';
  end if;

  update public.org_members set role = 'owner'
  where org_id = v_org and user_id = p_user_id;
  update public.org_members set role = 'admin'
  where org_id = v_org and user_id = auth.uid();
end;
$$;

-- Self-service exit. Owners must transfer first — an org can never be left
-- ownerless. Clears active_org_id so the JWT hook falls back to the earliest
-- remaining membership (or none).
create or replace function public.leave_organization()
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.current_org_id();
  v_role text;
begin
  if v_org is null then
    raise exception 'no active organization';
  end if;
  select role into v_role from public.org_members
  where org_id = v_org and user_id = auth.uid();
  if v_role is null then
    raise exception 'not a member of this organization';
  end if;
  if v_role = 'owner' then
    raise exception 'the owner cannot leave — transfer ownership first';
  end if;

  delete from public.org_members where org_id = v_org and user_id = auth.uid();
  update public.user_profiles set active_org_id = null
  where id = auth.uid() and active_org_id = v_org;
end;
$$;

-- Accept an invite (logged-in invitee). The signed-in email must match the
-- invited email — an invite link is not a bearer grant to any account.
-- CHANGED: the membership guard is now per-org (multi-org users are the
-- point of the workspace switcher), and accepting lands you IN the new org
-- (active_org_id) so the post-accept redirect shows the right workspace.
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
  if exists (
    select 1 from public.org_members
    where user_id = v_uid and org_id = v_invite.org_id
  ) then
    raise exception 'already a member of this organization';
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_invite.org_id, v_uid, v_invite.role);

  update public.org_invites
  set accepted_at = now(), accepted_by = v_uid
  where id = v_invite.id;

  update public.user_profiles set active_org_id = v_invite.org_id
  where id = v_uid;

  return v_invite.org_id;
end;
$$;

revoke execute on function
  public.transfer_org_ownership(uuid),
  public.leave_organization()
from public, anon;
grant execute on function
  public.transfer_org_ownership(uuid),
  public.leave_organization()
to authenticated, service_role;

notify pgrst, 'reload schema';
