-- ============================================================
-- 307 — Frozen per-company occupancy limits (users + branches)
--
-- Occupancy is not monthly usage metering and does not touch the
-- counter-quota stack, company usage-limit overrides, or the licensing engine.
-- Runtime enforcement reads company_resource_limits only (frozen),
-- never live plans.max_users.
-- Additive. Does not alter profiles/branches/subscriptions rows
-- except by blocking over-limit creates via triggers.
-- ============================================================

-- ── 1. Table ──────────────────────────────────────────────────

create table if not exists public.company_resource_limits (
  company_id uuid primary key references public.companies(id) on delete cascade,
  max_users integer,
  max_branches integer,
  source text not null default 'system'
    check (source in ('package', 'trial', 'contract', 'manual', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_resource_limits_max_users_chk
    check (max_users is null or max_users >= 0),
  constraint company_resource_limits_max_branches_chk
    check (max_branches is null or max_branches >= 0)
);

comment on table public.company_resource_limits is
  'Frozen per-company occupancy caps for users and branches. Catalog edits do not mutate these rows.';

comment on column public.company_resource_limits.max_users is
  'NULL means unlimited user seats. Frozen at package/trial/contract assignment.';

comment on column public.company_resource_limits.max_branches is
  'NULL means unlimited branches. Frozen at package/trial/contract assignment.';

create index if not exists company_resource_limits_source_idx
  on public.company_resource_limits (source);

drop trigger if exists company_resource_limits_set_updated_at on public.company_resource_limits;
create trigger company_resource_limits_set_updated_at
  before update on public.company_resource_limits
  for each row
  execute procedure public.set_updated_at();

alter table public.company_resource_limits enable row level security;

drop policy if exists company_resource_limits_select on public.company_resource_limits;
create policy company_resource_limits_select
  on public.company_resource_limits
  for select
  to authenticated
  using (
    public.is_super_admin()
    or company_id = public.current_company_id()
    or public.can_view_billing_company(company_id)
  );

drop policy if exists company_resource_limits_write on public.company_resource_limits;
create policy company_resource_limits_write
  on public.company_resource_limits
  for all
  to authenticated
  using (false)
  with check (false);

revoke all on table public.company_resource_limits from anon, public;
grant select on table public.company_resource_limits to authenticated, service_role;

create table if not exists public.company_user_seat_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  released_at timestamptz
);

create index if not exists company_user_seat_reservations_open_idx
  on public.company_user_seat_reservations (company_id, expires_at)
  where consumed_at is null and released_at is null;

alter table public.company_user_seat_reservations enable row level security;

drop policy if exists company_user_seat_reservations_deny on public.company_user_seat_reservations;
create policy company_user_seat_reservations_deny
  on public.company_user_seat_reservations
  for all
  to authenticated
  using (false)
  with check (false);

revoke all on table public.company_user_seat_reservations from anon, public;
grant select on table public.company_user_seat_reservations to service_role;

-- ── 2. Occupancy helpers ──────────────────────────────────────

create or replace function public._resource_limit_defaults_for_plan(p_plan_id uuid)
returns table(max_users integer, max_branches integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
  v_plan_max integer;
  v_users integer;
  v_branches integer;
begin
  if p_plan_id is null then
    max_users := 5;
    max_branches := 1;
    return next;
    return;
  end if;

  select lower(coalesce(p.code, '')), p.max_users
    into v_code, v_plan_max
  from public.plans p
  where p.id = p_plan_id;

  if not found then
    max_users := 5;
    max_branches := 1;
    return next;
    return;
  end if;

  if v_code in ('basic', 'starter')
     or v_code like 'basic%'
     or v_code like 'starter%' then
    v_users := 5;
    v_branches := 1;
  elsif v_code in ('pro', 'growth')
     or v_code like 'pro%'
     or v_code like 'growth%' then
    v_users := 25;
    v_branches := 5;
  elsif v_code in ('enterprise')
     or v_code like 'enterprise%' then
    v_users := null;
    v_branches := 20;
  elsif v_plan_max is null then
    v_users := null;
    v_branches := 20;
  elsif v_plan_max <= 5 then
    v_users := 5;
    v_branches := 1;
  elsif v_plan_max <= 25 then
    v_users := 25;
    v_branches := 5;
  else
    v_users := v_plan_max;
    v_branches := 20;
  end if;

  max_users := v_users;
  max_branches := v_branches;
  return next;
end;
$$;

create or replace function public._count_occupying_users(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.profiles p
  where p.company_id = p_company_id
    and p.is_active = true
    and coalesce(p.is_super_admin, false) = false;
$$;

create or replace function public._count_occupying_branches(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.branches b
  where b.company_id = p_company_id
    and b.deleted_at is null;
$$;

create or replace function public._count_pending_user_seats(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.company_user_seat_reservations r
  where r.company_id = p_company_id
    and r.consumed_at is null
    and r.released_at is null
    and r.expires_at > now();
$$;

create or replace function public._resource_occupancy_snapshot(
  p_current integer,
  p_max integer
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'current_count', greatest(coalesce(p_current, 0), 0),
    'max_allowed', p_max,
    'remaining', case
      when p_max is null then null
      else greatest(p_max - greatest(coalesce(p_current, 0), 0), 0)
    end,
    'is_over_limit', case
      when p_max is null then false
      else greatest(coalesce(p_current, 0), 0) > p_max
    end,
    'is_unlimited', p_max is null
  );
$$;

create or replace function public._upsert_company_resource_limits(
  p_company_id uuid,
  p_max_users integer,
  p_max_branches integer,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := coalesce(nullif(trim(p_source), ''), 'system');
begin
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;
  if v_source not in ('package', 'trial', 'contract', 'manual', 'system') then
    raise exception 'invalid_resource_limit_source';
  end if;

  insert into public.company_resource_limits (
    company_id, max_users, max_branches, source
  ) values (
    p_company_id, p_max_users, p_max_branches, v_source
  )
  on conflict (company_id) do update
  set
    max_users = excluded.max_users,
    max_branches = excluded.max_branches,
    source = excluded.source,
    updated_at = now();
end;
$$;

create or replace function public._apply_company_resource_limits_from_plan(
  p_company_id uuid,
  p_plan_id uuid,
  p_source text default 'package'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_users integer;
  v_branches integer;
  v_source text := coalesce(nullif(trim(p_source), ''), 'package');
begin
  if v_source = 'trial' then
    v_users := 5;
    v_branches := 1;
  else
    select d.max_users, d.max_branches
      into v_users, v_branches
    from public._resource_limit_defaults_for_plan(p_plan_id) d;
  end if;

  perform public._upsert_company_resource_limits(p_company_id, v_users, v_branches, v_source);
end;
$$;

create or replace function public._ensure_company_resource_limits_locked(p_company_id uuid)
returns public.company_resource_limits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.company_resource_limits%rowtype;
  v_sub public.company_subscriptions%rowtype;
  v_source text;
begin
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;

  select * into v_row
  from public.company_resource_limits
  where company_id = p_company_id
  for update;

  if found then
    return v_row;
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id;

  if found then
    v_source := case when v_sub.status = 'trialing' then 'trial' else 'package' end;
    perform public._apply_company_resource_limits_from_plan(p_company_id, v_sub.plan_id, v_source);
  else
    perform public._upsert_company_resource_limits(p_company_id, 5, 1, 'system');
  end if;

  select * into v_row
  from public.company_resource_limits
  where company_id = p_company_id
  for update;

  if not found then
    raise exception 'resource_limits_unavailable';
  end if;

  return v_row;
end;
$$;

-- ── 3. Freeze from subscription assignment (atomic with assign/trial) ──

create or replace function public._sync_company_resource_limits_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
begin
  if new.company_id is null then
    return new;
  end if;

  if (tg_op = 'INSERT' and new.status = 'trialing')
     or (tg_op = 'UPDATE' and new.status = 'trialing' and old.status is distinct from 'trialing') then
    perform public._apply_company_resource_limits_from_plan(new.company_id, new.plan_id, 'trial');
    return new;
  end if;

  if new.plan_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'trialing' then
    v_source := 'trial';
  elsif tg_op = 'UPDATE'
    and new.plan_id is not distinct from old.plan_id
    and new.package_assigned_at is not distinct from old.package_assigned_at
    and new.status is not distinct from old.status then
    return new;
  elsif tg_op = 'INSERT' and new.status is distinct from 'trialing' then
    v_source := 'package';
  elsif tg_op = 'UPDATE' and (
    new.plan_id is distinct from old.plan_id
    or new.package_assigned_at is distinct from old.package_assigned_at
  ) then
    v_source := 'package';
  elsif tg_op = 'UPDATE' and new.status = 'trialing' and old.status is distinct from 'trialing' then
    v_source := 'trial';
  else
    return new;
  end if;

  perform public._apply_company_resource_limits_from_plan(new.company_id, new.plan_id, v_source);
  return new;
end;
$$;

drop trigger if exists trg_sync_company_resource_limits on public.company_subscriptions;
create trigger trg_sync_company_resource_limits
  after insert or update of plan_id, package_assigned_at, status
  on public.company_subscriptions
  for each row
  execute procedure public._sync_company_resource_limits_from_subscription();

-- ── 4. Occupancy RPCs ─────────────────────────────────────────

create or replace function public.get_company_resource_occupancy_v1(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limits public.company_resource_limits%rowtype;
  v_users integer;
  v_branches integer;
  v_pending integer;
begin
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_super_admin()
     and public.current_company_id() is distinct from p_company_id
     and not public.can_view_billing_company(p_company_id) then
    raise exception 'Insufficient permissions';
  end if;

  select * into v_limits
  from public.company_resource_limits
  where company_id = p_company_id;

  if not found then
    v_limits.max_users := null;
    v_limits.max_branches := null;
    v_limits.source := 'system';
  end if;

  v_users := public._count_occupying_users(p_company_id);
  v_branches := public._count_occupying_branches(p_company_id);
  v_pending := public._count_pending_user_seats(p_company_id);

  return jsonb_build_object(
    'company_id', p_company_id,
    'source', v_limits.source,
    'users', public._resource_occupancy_snapshot(v_users, v_limits.max_users)
      || jsonb_build_object('pending_reservations', v_pending),
    'branches', public._resource_occupancy_snapshot(v_branches, v_limits.max_branches)
  );
end;
$$;

create or replace function public.set_company_resource_limits_v1(
  p_company_id uuid,
  p_max_users integer default null,
  p_max_branches integer default null,
  p_source text default 'contract'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := coalesce(nullif(trim(p_source), ''), 'contract');
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to set company resource limits';
  end if;

  if p_company_id is null then
    raise exception 'company_id_required';
  end if;

  if v_source not in ('contract', 'manual') then
    v_source := 'contract';
  end if;

  if p_max_users is not null and p_max_users < 0 then
    raise exception 'invalid_max_users';
  end if;
  if p_max_branches is not null and p_max_branches < 0 then
    raise exception 'invalid_max_branches';
  end if;

  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company not found';
  end if;

  perform public._upsert_company_resource_limits(
    p_company_id,
    p_max_users,
    p_max_branches,
    v_source
  );

  return public.get_company_resource_occupancy_v1(p_company_id);
end;
$$;

create or replace function public.reserve_company_user_seat_v1(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits public.company_resource_limits%rowtype;
  v_occ integer;
  v_pending integer;
  v_id uuid;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if p_company_id is null then
    raise exception 'company_id_required';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_super_admin()
     and public.current_company_id() is distinct from p_company_id then
    raise exception 'Insufficient permissions';
  end if;

  v_limits := public._ensure_company_resource_limits_locked(p_company_id);
  v_occ := public._count_occupying_users(p_company_id);
  v_pending := public._count_pending_user_seats(p_company_id);

  if v_limits.max_users is not null and (v_occ + v_pending) >= v_limits.max_users then
    raise exception 'user_seat_limit_reached'
      using errcode = 'P0001',
            hint = 'Company user occupancy is at or over its frozen resource limit';
  end if;

  insert into public.company_user_seat_reservations (company_id)
  values (p_company_id)
  returning id into v_id;

  return jsonb_build_object(
    'reservation_id', v_id,
    'company_id', p_company_id,
    'occupancy', public._resource_occupancy_snapshot(v_occ + v_pending + 1, v_limits.max_users)
  );
end;
$$;

create or replace function public.release_company_user_seat_v1(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reservation_id is null then
    return false;
  end if;

  if auth.role() <> 'service_role'
     and not public.is_super_admin() then
    raise exception 'Insufficient permissions';
  end if;

  update public.company_user_seat_reservations
  set released_at = now()
  where id = p_reservation_id
    and consumed_at is null
    and released_at is null;

  return found;
end;
$$;

-- ── 5. Profile occupancy trigger ──────────────────────────────

create or replace function public._profile_occupies_user_seat(
  p_company_id uuid,
  p_is_active boolean,
  p_is_super_admin boolean
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_company_id is not null
     and coalesce(p_is_active, false) = true
     and coalesce(p_is_super_admin, false) = false;
$$;

create or replace function public._enforce_company_user_occupancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits public.company_resource_limits%rowtype;
  v_occ integer;
  v_pending integer;
  v_old_occupies boolean := false;
  v_new_occupies boolean := false;
  v_is_attach boolean := false;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  v_new_occupies := public._profile_occupies_user_seat(
    new.company_id, new.is_active, new.is_super_admin
  );

  if tg_op = 'UPDATE' then
    v_old_occupies := public._profile_occupies_user_seat(
      old.company_id, old.is_active, old.is_super_admin
    );
    if v_old_occupies
       and v_new_occupies
       and old.company_id is not distinct from new.company_id then
      return new;
    end if;
  end if;

  if not v_new_occupies then
    return new;
  end if;

  v_is_attach :=
    tg_op = 'INSERT'
    or old.company_id is distinct from new.company_id;

  v_limits := public._ensure_company_resource_limits_locked(new.company_id);
  v_occ := (
    select count(*)::integer
    from public.profiles p
    where p.company_id = new.company_id
      and p.is_active = true
      and coalesce(p.is_super_admin, false) = false
      and p.id is distinct from new.id
  );
  v_pending := public._count_pending_user_seats(new.company_id);

  if v_limits.max_users is null then
    if v_is_attach then
      update public.company_user_seat_reservations
      set consumed_at = now()
      where id = (
        select r.id
        from public.company_user_seat_reservations r
        where r.company_id = new.company_id
          and r.consumed_at is null
          and r.released_at is null
          and r.expires_at > now()
        order by r.created_at
        for update skip locked
        limit 1
      );
    end if;
    return new;
  end if;

  if v_is_attach and v_pending > 0 and v_occ < v_limits.max_users then
    update public.company_user_seat_reservations
    set consumed_at = now()
    where id = (
      select r.id
      from public.company_user_seat_reservations r
      where r.company_id = new.company_id
        and r.consumed_at is null
        and r.released_at is null
        and r.expires_at > now()
      order by r.created_at
      for update skip locked
      limit 1
    );
    return new;
  end if;

  if (v_occ + v_pending) < v_limits.max_users then
    return new;
  end if;

  raise exception 'user_seat_limit_reached'
    using errcode = 'P0001',
          hint = 'Company user occupancy is at or over its frozen resource limit';
end;
$$;

drop trigger if exists trg_enforce_company_user_occupancy on public.profiles;
create trigger trg_enforce_company_user_occupancy
  before insert or update of company_id, is_active, is_super_admin
  on public.profiles
  for each row
  execute procedure public._enforce_company_user_occupancy();

-- ── 6. Branch occupancy trigger (covers HQ, management, restore) ──

create or replace function public._enforce_company_branch_occupancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits public.company_resource_limits%rowtype;
  v_occ integer;
  v_was_occupying boolean := false;
  v_now_occupying boolean := false;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  v_now_occupying := new.company_id is not null and new.deleted_at is null;

  if tg_op = 'UPDATE' then
    v_was_occupying := old.company_id is not null and old.deleted_at is null;
    if v_was_occupying
       and v_now_occupying
       and old.company_id is not distinct from new.company_id then
      return new;
    end if;
  end if;

  if not v_now_occupying then
    return new;
  end if;

  v_limits := public._ensure_company_resource_limits_locked(new.company_id);

  if v_limits.max_branches is null then
    return new;
  end if;

  v_occ := (
    select count(*)::integer
    from public.branches b
    where b.company_id = new.company_id
      and b.deleted_at is null
      and b.id is distinct from new.id
  );

  if v_occ < v_limits.max_branches then
    return new;
  end if;

  raise exception 'branch_limit_reached'
    using errcode = 'P0001',
          hint = 'Company branch occupancy is at or over its frozen resource limit';
end;
$$;

drop trigger if exists trg_enforce_company_branch_occupancy on public.branches;
create trigger trg_enforce_company_branch_occupancy
  before insert or update of company_id, deleted_at
  on public.branches
  for each row
  execute procedure public._enforce_company_branch_occupancy();

-- ── 7. Grants ─────────────────────────────────────────────────

revoke all on function public._resource_limit_defaults_for_plan(uuid) from public, anon, authenticated;
grant execute on function public._resource_limit_defaults_for_plan(uuid) to service_role;

revoke all on function public._count_occupying_users(uuid) from public, anon, authenticated;
grant execute on function public._count_occupying_users(uuid) to service_role;

revoke all on function public._count_occupying_branches(uuid) from public, anon, authenticated;
grant execute on function public._count_occupying_branches(uuid) to service_role;

revoke all on function public._count_pending_user_seats(uuid) from public, anon, authenticated;
grant execute on function public._count_pending_user_seats(uuid) to service_role;

revoke all on function public._resource_occupancy_snapshot(integer, integer) from public, anon;
grant execute on function public._resource_occupancy_snapshot(integer, integer) to authenticated, service_role;

revoke all on function public._upsert_company_resource_limits(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public._upsert_company_resource_limits(uuid, integer, integer, text) to service_role;

revoke all on function public._apply_company_resource_limits_from_plan(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public._apply_company_resource_limits_from_plan(uuid, uuid, text) to service_role;

revoke all on function public._ensure_company_resource_limits_locked(uuid) from public, anon, authenticated;
grant execute on function public._ensure_company_resource_limits_locked(uuid) to service_role;

revoke all on function public.get_company_resource_occupancy_v1(uuid) from public, anon;
grant execute on function public.get_company_resource_occupancy_v1(uuid) to authenticated, service_role;

revoke all on function public.set_company_resource_limits_v1(uuid, integer, integer, text) from public, anon;
grant execute on function public.set_company_resource_limits_v1(uuid, integer, integer, text) to authenticated, service_role;

revoke all on function public.reserve_company_user_seat_v1(uuid) from public, anon;
grant execute on function public.reserve_company_user_seat_v1(uuid) to authenticated, service_role;

revoke all on function public.release_company_user_seat_v1(uuid) from public, anon;
grant execute on function public.release_company_user_seat_v1(uuid) to service_role;

-- ── 8. Safe backfill (limits rows only) ───────────────────────

insert into public.company_resource_limits (
  company_id, max_users, max_branches, source
)
select
  cs.company_id,
  case when cs.status = 'trialing' then 5 else d.max_users end,
  case when cs.status = 'trialing' then 1 else d.max_branches end,
  case when cs.status = 'trialing' then 'trial' else 'package' end
from public.company_subscriptions cs
cross join lateral public._resource_limit_defaults_for_plan(cs.plan_id) d
on conflict (company_id) do nothing;
