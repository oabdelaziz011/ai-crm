-- ============================================================
-- Vault OS – Companies
-- ============================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  status text not null default 'Trial'
    check (status in ('Active', 'Suspended', 'Trial')),
  subscription_plan text not null default 'Basic',
  subscription_status text not null default 'trialing'
    check (subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'yearly')),
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.companies
  add column if not exists logo_url text,
  add column if not exists status text default 'Trial',
  add column if not exists subscription_plan text default 'Basic',
  add column if not exists subscription_status text default 'trialing',
  add column if not exists billing_cycle text default 'monthly',
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.companies
set status = coalesce(status, 'Trial')
where status is null;

update public.companies
set subscription_plan = coalesce(subscription_plan, 'Basic')
where subscription_plan is null;

update public.companies
set subscription_status = coalesce(subscription_status, 'trialing')
where subscription_status is null;

update public.companies
set billing_cycle = coalesce(billing_cycle, 'monthly')
where billing_cycle is null;

update public.companies
set created_at = now()
where created_at is null;

update public.companies
set updated_at = now()
where updated_at is null;

create index if not exists idx_companies_status on public.companies(status);
create index if not exists idx_companies_subscription_status on public.companies(subscription_status);
create index if not exists idx_companies_billing_cycle on public.companies(billing_cycle);
create index if not exists idx_companies_subscription_expires_at on public.companies(subscription_expires_at);

-- Null orphaned company references before adding FK (preserves profile rows)
update public.profiles p
set company_id = null
where p.company_id is not null
  and not exists (
    select 1
    from public.companies c
    where c.id = p.company_id
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_company_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_company_id_fkey
      foreign key (company_id)
      references public.companies(id)
      on delete set null;
  end if;
end $$;

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at
  before update on public.companies
  for each row execute procedure public.set_updated_at();

alter table public.companies enable row level security;

drop policy if exists companies_super_admin_select on public.companies;
create policy companies_super_admin_select
  on public.companies for select
  using (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists companies_super_admin_insert on public.companies;
create policy companies_super_admin_insert
  on public.companies for insert
  with check (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists companies_super_admin_update on public.companies;
create policy companies_super_admin_update
  on public.companies for update
  using (auth.role() = 'authenticated' and public.is_super_admin())
  with check (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists companies_super_admin_delete on public.companies;
create policy companies_super_admin_delete
  on public.companies for delete
  using (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists companies_member_select on public.companies;
create policy companies_member_select
  on public.companies for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.profiles p
      where (p.id = auth.uid() or p.user_id = auth.uid())
        and p.company_id = companies.id
    )
  );
