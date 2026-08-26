-- Restore authoritative sequential BK-000xxx generation.
-- Root cause of BK-990xxx: disposable test inserts supplied high confirmation_numbers;
-- migration 319's MAX(all digits) then advanced booking_number_sequences into that range.
--
-- Design:
-- 1) Atomic company-scoped counter (row lock on booking_number_sequences).
-- 2) Floor heal uses ONLY production-format BK-###### with value < 900
--    (excludes BK-99xxxx disposable seeds and BK-000901 test pollution).
-- 3) Explicit caller-supplied confirmation_number is preserved (reschedule transfer).
-- 4) Existing disposable BK-99* / BK-CLOSE* / BK-TMP* / BK-000901 are NOT renumbered.
-- 5) Unique confirmation applies to active rows only so reschedule can keep the same BK.

drop index if exists public.idx_scheduling_bookings_company_confirmation_number;
create unique index if not exists idx_scheduling_bookings_company_confirmation_number_active
  on public.scheduling_bookings (company_id, confirmation_number)
  where confirmation_number is not null
    and deleted_at is null
    and status not in ('rescheduled');

create or replace function public.assign_scheduling_booking_confirmation_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_production_max bigint;
begin
  -- Preserve explicitly supplied references (reschedule transfer / controlled seeds).
  if new.confirmation_number is not null and btrim(new.confirmation_number) <> '' then
    return new;
  end if;

  -- Production floor: standard BK-###### below disposable bands.
  select coalesce(
    max(nullif(regexp_replace(confirmation_number, '\D', '', 'g'), '')::bigint),
    0
  )
  into v_production_max
  from public.scheduling_bookings
  where company_id = new.company_id
    and confirmation_number ~ '^BK-[0-9]{6}$'
    and nullif(regexp_replace(confirmation_number, '\D', '', 'g'), '')::bigint < 900;

  insert into public.booking_number_sequences (company_id, last_value)
  values (new.company_id, greatest(v_production_max, 0) + 1)
  on conflict (company_id) do update
    set
      last_value = greatest(
        public.booking_number_sequences.last_value + 1,
        v_production_max + 1
      ),
      updated_at = now()
  returning last_value into v_next;

  new.confirmation_number := 'BK-' || lpad(v_next::text, 6, '0');
  return new;
end;
$$;

-- Heal sequence counters onto the production floor (max BK below 900).
update public.booking_number_sequences s
set
  last_value = greatest(
    coalesce((
      select max(nullif(regexp_replace(b.confirmation_number, '\D', '', 'g'), '')::bigint)
      from public.scheduling_bookings b
      where b.company_id = s.company_id
        and b.confirmation_number ~ '^BK-[0-9]{6}$'
        and nullif(regexp_replace(b.confirmation_number, '\D', '', 'g'), '')::bigint < 900
    ), 0),
    0
  ),
  updated_at = now();
