-- Add optional CRM demographic fields on customers (backward compatible: nullable).

alter table public.customers
  add column if not exists age integer,
  add column if not exists gender text;

alter table public.customers
  drop constraint if exists customers_age_range;

alter table public.customers
  add constraint customers_age_range
  check (age is null or (age >= 0 and age <= 150));

comment on column public.customers.age is 'Customer age in years';
comment on column public.customers.gender is 'Customer gender';

-- Enable realtime so Customer Details dialog reflects workflow updates immediately.
do $$
begin
  begin
    alter publication supabase_realtime add table public.customers;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
