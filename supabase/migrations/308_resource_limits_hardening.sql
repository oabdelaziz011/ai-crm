-- ============================================================
-- 308 — Resource-limit hardening (Task 7C-FIX)
-- Additive. Does not rewrite 307 schema.
-- 1) Occupancy GET includes pending reservations in remaining/effective_used
-- 2) GET ensures a limits row with the same freeze semantics as mutation
-- 3) reserve_company_user_seat_v1 requires users.edit (or super-admin / service_role)
-- ============================================================

create or replace function public._ensure_company_resource_limits(p_company_id uuid)
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
  where company_id = p_company_id;

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
  where company_id = p_company_id;

  if not found then
    raise exception 'resource_limits_unavailable';
  end if;

  return v_row;
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
begin
  perform public._ensure_company_resource_limits(p_company_id);

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

create or replace function public._user_resource_occupancy_snapshot(
  p_current integer,
  p_pending integer,
  p_max integer
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'current_count', greatest(coalesce(p_current, 0), 0),
    'pending_reservations', greatest(coalesce(p_pending, 0), 0),
    'effective_used', greatest(coalesce(p_current, 0), 0) + greatest(coalesce(p_pending, 0), 0),
    'max_allowed', p_max,
    'remaining', case
      when p_max is null then null
      else greatest(
        p_max - (greatest(coalesce(p_current, 0), 0) + greatest(coalesce(p_pending, 0), 0)),
        0
      )
    end,
    'is_over_limit', case
      when p_max is null then false
      else (greatest(coalesce(p_current, 0), 0) + greatest(coalesce(p_pending, 0), 0)) > p_max
    end,
    'is_unlimited', p_max is null
  );
$$;

create or replace function public.get_company_resource_occupancy_v1(p_company_id uuid)
returns jsonb
language plpgsql
volatile
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

  v_limits := public._ensure_company_resource_limits(p_company_id);
  v_users := public._count_occupying_users(p_company_id);
  v_branches := public._count_occupying_branches(p_company_id);
  v_pending := public._count_pending_user_seats(p_company_id);

  return jsonb_build_object(
    'company_id', p_company_id,
    'source', v_limits.source,
    'users', public._user_resource_occupancy_snapshot(v_users, v_pending, v_limits.max_users),
    'branches', public._resource_occupancy_snapshot(v_branches, v_limits.max_branches)
      || jsonb_build_object(
        'pending_reservations', 0,
        'effective_used', v_branches
      )
  );
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
     and not public.user_has_permission_in_company(p_company_id, 'users.edit') then
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
    'occupancy', public._user_resource_occupancy_snapshot(v_occ, v_pending + 1, v_limits.max_users)
  );
end;
$$;

revoke all on function public._ensure_company_resource_limits(uuid) from public, anon, authenticated;
grant execute on function public._ensure_company_resource_limits(uuid) to service_role;

revoke all on function public._user_resource_occupancy_snapshot(integer, integer, integer) from public, anon;
grant execute on function public._user_resource_occupancy_snapshot(integer, integer, integer) to authenticated, service_role;
