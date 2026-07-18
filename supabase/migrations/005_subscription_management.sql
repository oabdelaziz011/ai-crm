-- ============================================================
-- Vault OS – Subscription Management
-- ============================================================

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('Basic', 'Pro', 'Enterprise')),
  code text not null unique check (code in ('basic', 'pro', 'enterprise')),
  price_monthly numeric(10, 2) not null default 0,
  price_yearly numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plans
  add column if not exists name text,
  add column if not exists code text,
  add column if not exists price_monthly numeric(10, 2) default 0,
  add column if not exists price_yearly numeric(10, 2) default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.plans set price_monthly = coalesce(price_monthly, 0) where price_monthly is null;
update public.plans set price_yearly = coalesce(price_yearly, 0) where price_yearly is null;
update public.plans set created_at = now() where created_at is null;
update public.plans set updated_at = now() where updated_at is null;

insert into public.plans (name, code, price_monthly, price_yearly)
values
  ('Basic', 'basic', 29, 290),
  ('Pro', 'pro', 99, 990),
  ('Enterprise', 'enterprise', 299, 2990)
on conflict (code) do update
set
  name = excluded.name,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  updated_at = now();

drop trigger if exists plans_updated_at on public.plans;
create trigger plans_updated_at
  before update on public.plans
  for each row execute procedure public.set_updated_at();

alter table public.plans enable row level security;

drop policy if exists plans_select_authenticated on public.plans;
create policy plans_select_authenticated
  on public.plans for select
  using (auth.role() = 'authenticated');

drop policy if exists plans_super_admin_insert on public.plans;
create policy plans_super_admin_insert
  on public.plans for insert
  with check (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists plans_super_admin_update on public.plans;
create policy plans_super_admin_update
  on public.plans for update
  using (auth.role() = 'authenticated' and public.is_super_admin())
  with check (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists plans_super_admin_delete on public.plans;
create policy plans_super_admin_delete
  on public.plans for delete
  using (auth.role() = 'authenticated' and public.is_super_admin());

alter table public.companies
  add column if not exists plan_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_plan_id_fkey'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_plan_id_fkey
      foreign key (plan_id)
      references public.plans(id);
  end if;
exception
  when others then null;
end $$;

create index if not exists idx_companies_plan_id on public.companies(plan_id);

update public.companies c
set plan_id = p.id
from public.plans p
where c.plan_id is null
  and lower(c.subscription_plan) = lower(p.name);

update public.companies c
set subscription_plan = p.name
from public.plans p
where c.plan_id = p.id
  and (c.subscription_plan is null or trim(c.subscription_plan) = '');
