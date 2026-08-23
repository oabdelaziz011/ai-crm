-- Keep booking confirmation sequences ahead of existing BK- numbers.
-- Stale last_value (e.g. 32 while BK-000037 exists) causes unique collisions on insert.

create or replace function public.assign_scheduling_booking_confirmation_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_existing_max bigint;
begin
  if new.confirmation_number is not null and btrim(new.confirmation_number) <> '' then
    return new;
  end if;

  select coalesce(
    max(nullif(regexp_replace(confirmation_number, '\D', '', 'g'), '')::bigint),
    0
  )
  into v_existing_max
  from public.scheduling_bookings
  where company_id = new.company_id;

  insert into public.booking_number_sequences (company_id, last_value)
  values (new.company_id, greatest(v_existing_max + 1, 1))
  on conflict (company_id) do update
    set
      last_value = greatest(
        public.booking_number_sequences.last_value + 1,
        v_existing_max + 1
      ),
      updated_at = now()
  returning last_value into v_next;

  new.confirmation_number := 'BK-' || lpad(v_next::text, 6, '0');
  return new;
end;
$$;

-- Heal existing companies where sequence lagged behind assigned confirmation numbers.
update public.booking_number_sequences s
set
  last_value = greatest(
    s.last_value,
    coalesce((
      select max(nullif(regexp_replace(b.confirmation_number, '\D', '', 'g'), '')::bigint)
      from public.scheduling_bookings b
      where b.company_id = s.company_id
    ), 0)
  ),
  updated_at = now();
