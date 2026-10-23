-- Reject an active booking when it would exceed the resource's slot capacity.
-- Capacity comes from scheduling_resources.metadata.capacity (default 1).
-- Company buffer_before_minutes / buffer_after_minutes protect both sides of a pair.
-- A row conflicts when either booking's buffer covers the other, so the empty gap
-- is the larger buffer rather than the sum, whichever row is saved first.
-- scheduling_booking_rules.allow_overbooking skips capacity and those buffers.
-- Cancelled, finished, and deleted bookings do not reserve capacity.
-- The resource row is locked so concurrent inserts for that resource are serialized.

create or replace function public.enforce_scheduling_booking_slot_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer := 1;
  v_overbook boolean := false;
  v_before integer := 0;
  v_after integer := 0;
  v_count integer := 0;
  v_metadata jsonb;
  v_raw text;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.status not in (
    'pending', 'confirmed', 'checked_in', 'with_nurse', 'in_progress'
  ) then
    return new;
  end if;

  select coalesce(allow_overbooking, false),
         greatest(0, coalesce(buffer_before_minutes, 0)),
         greatest(0, coalesce(buffer_after_minutes, 0))
    into v_overbook, v_before, v_after
  from public.scheduling_booking_rules
  where company_id = new.company_id;

  if not found then
    v_overbook := false;
    v_before := 0;
    v_after := 0;
  end if;

  if coalesce(v_overbook, false) then
    return new;
  end if;

  select metadata
    into v_metadata
  from public.scheduling_resources
  where id = new.resource_id
    and company_id = new.company_id
  for update;

  if not found then
    raise exception 'SLOT_RESOURCE_NOT_FOUND'
      using errcode = '23503';
  end if;

  v_raw := v_metadata->>'capacity';
  if v_raw is not null and btrim(v_raw) <> '' and v_raw ~ '^[0-9]+$' then
    v_capacity := greatest(1, v_raw::integer);
  end if;

  select count(*)
    into v_count
  from public.scheduling_bookings
  where company_id = new.company_id
    and resource_id = new.resource_id
    and deleted_at is null
    and id is distinct from new.id
    and status in ('pending', 'confirmed', 'checked_in', 'with_nurse', 'in_progress')
    and (
      (
        start_at < new.end_at + make_interval(mins => v_before)
        and end_at > new.start_at - make_interval(mins => v_after)
      )
      or (
        start_at < new.end_at + make_interval(mins => v_after)
        and end_at > new.start_at - make_interval(mins => v_before)
      )
    );

  if v_count >= v_capacity then
    raise exception 'SLOT_CAPACITY_EXCEEDED'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_scheduling_booking_slot_capacity on public.scheduling_bookings;
create trigger trg_scheduling_booking_slot_capacity
  before insert or update of start_at, end_at, status, resource_id, company_id, deleted_at
  on public.scheduling_bookings
  for each row
  execute procedure public.enforce_scheduling_booking_slot_capacity();

revoke all on function public.enforce_scheduling_booking_slot_capacity() from public;
grant execute on function public.enforce_scheduling_booking_slot_capacity() to authenticated, service_role;
