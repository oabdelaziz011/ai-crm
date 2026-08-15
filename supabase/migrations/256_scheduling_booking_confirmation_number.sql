-- Sequential company-scoped booking confirmation numbers (BK-000001).

create table if not exists public.booking_number_sequences (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.scheduling_bookings
  add column if not exists confirmation_number text;

create unique index if not exists idx_scheduling_bookings_company_confirmation_number
  on public.scheduling_bookings (company_id, confirmation_number)
  where confirmation_number is not null;

create or replace function public.assign_scheduling_booking_confirmation_number()
returns trigger
language plpgsql
as $$
declare
  v_next bigint;
begin
  if new.confirmation_number is not null and btrim(new.confirmation_number) <> '' then
    return new;
  end if;

  insert into public.booking_number_sequences (company_id, last_value)
  values (new.company_id, 1)
  on conflict (company_id) do update
    set
      last_value = booking_number_sequences.last_value + 1,
      updated_at = now()
  returning last_value into v_next;

  new.confirmation_number := 'BK-' || lpad(v_next::text, 6, '0');
  return new;
end;
$$;

drop trigger if exists trg_assign_scheduling_booking_confirmation_number
  on public.scheduling_bookings;
create trigger trg_assign_scheduling_booking_confirmation_number
  before insert on public.scheduling_bookings
  for each row execute procedure public.assign_scheduling_booking_confirmation_number();

-- Backfill existing bookings in creation order per company.
do $$
declare
  r record;
  v_next bigint;
begin
  for r in
    select id, company_id
    from public.scheduling_bookings
    where confirmation_number is null
       or btrim(confirmation_number) = ''
    order by company_id, created_at asc nulls last, id asc
  loop
    insert into public.booking_number_sequences (company_id, last_value)
    values (r.company_id, 1)
    on conflict (company_id) do update
      set
        last_value = booking_number_sequences.last_value + 1,
        updated_at = now()
    returning last_value into v_next;

    update public.scheduling_bookings
    set confirmation_number = 'BK-' || lpad(v_next::text, 6, '0')
    where id = r.id;
  end loop;
end;
$$;

alter table public.scheduling_bookings
  alter column confirmation_number set not null;
