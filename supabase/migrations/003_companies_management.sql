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

create index if not exists idx_companies_status on public.companies(status);
create index if not exists idx_companies_subscription_status on public.companies(subscription_status);
create index if not exists idx_companies_billing_cycle on public.companies(billing_cycle);
create index if not exists idx_companies_subscription_expires_at on public.companies(subscription_expires_at);

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
