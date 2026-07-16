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
  add column if not exists plan_id uuid references public.plans(id);

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
  and c.subscription_plan is distinct from p.name;
