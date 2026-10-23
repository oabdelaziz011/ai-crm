-- Booking numbers jumped (BK-000089 then BK-40178795) because the counter
-- followed the largest digits in any confirmation number, including test values.
-- Every channel shares one company sequence and continues from the highest
-- normal BK-000000–BK-000899 number, skipping any value that is already used.

create or replace function public.assign_scheduling_booking_confirmation_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_production_max bigint;
  v_seq bigint;
begin
  if new.confirmation_number is not null and btrim(new.confirmation_number) <> '' then
    return new;
  end if;

  select coalesce(
    max(nullif(regexp_replace(confirmation_number, '\D', '', 'g'), '')::bigint),
    0
  )
  into v_production_max
  from public.scheduling_bookings
  where company_id = new.company_id
    and confirmation_number ~ '^BK-0[0-9]{5}$'
    and nullif(regexp_replace(confirmation_number, '\D', '', 'g'), '')::bigint < 900;

  insert into public.booking_number_sequences (company_id, last_value)
  values (new.company_id, v_production_max)
  on conflict (company_id) do nothing;

  select last_value
  into v_seq
  from public.booking_number_sequences
  where company_id = new.company_id
  for update;

  v_next := greatest(coalesce(v_seq, 0), v_production_max);

  loop
    v_next := v_next + 1;
    exit when not exists (
      select 1
      from public.scheduling_bookings
      where company_id = new.company_id
        and deleted_at is null
        and confirmation_number = 'BK-' || lpad(v_next::text, 6, '0')
    );
  end loop;

  update public.booking_number_sequences
  set last_value = v_next, updated_at = now()
  where company_id = new.company_id;

  new.confirmation_number := 'BK-' || lpad(v_next::text, 6, '0');
  return new;
end;
$$;

update public.booking_number_sequences s
set
  last_value = coalesce((
    select max(nullif(regexp_replace(b.confirmation_number, '\D', '', 'g'), '')::bigint)
    from public.scheduling_bookings b
    where b.company_id = s.company_id
      and b.confirmation_number ~ '^BK-0[0-9]{5}$'
      and nullif(regexp_replace(b.confirmation_number, '\D', '', 'g'), '')::bigint < 900
  ), 0),
  updated_at = now();

comment on function public.assign_scheduling_booking_confirmation_number() is
  'Company-scoped sequential BK-000nnn shared by every booking channel. Ignores out-of-band numbers such as BK-40178795.';
