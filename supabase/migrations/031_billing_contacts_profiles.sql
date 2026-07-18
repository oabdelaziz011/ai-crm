-- ============================================================
-- Vault OS – Billing: Contacts & Company Profiles (Phase 1)
-- Architecture: billing-subscriptions.md v4 §2.2, §2.5
-- ============================================================

alter table public.companies
  add column if not exists company_type text,
  add column if not exists contact_person text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

-- ── company_billing_contacts ────────────────────────────────

create table if not exists public.company_billing_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_company_billing_contacts_active
  on public.company_billing_contacts(company_id)
  where is_active = true;

create index if not exists idx_company_billing_contacts_company_id
  on public.company_billing_contacts(company_id);

drop trigger if exists company_billing_contacts_updated_at on public.company_billing_contacts;
create trigger company_billing_contacts_updated_at
  before update on public.company_billing_contacts
  for each row execute procedure public.set_updated_at();

-- ── company_billing_profiles ──────────────────────────────────

create table if not exists public.company_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  legal_name text,
  address text,
  tax_id text,
  logo_url text,
  footer_text text,
  payment_terms_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists company_billing_profiles_updated_at on public.company_billing_profiles;
create trigger company_billing_profiles_updated_at
  before update on public.company_billing_profiles
  for each row execute procedure public.set_updated_at();

-- ── RLS: company_billing_contacts ───────────────────────────

alter table public.company_billing_contacts enable row level security;

drop policy if exists company_billing_contacts_select on public.company_billing_contacts;
create policy company_billing_contacts_select
  on public.company_billing_contacts for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists company_billing_contacts_insert on public.company_billing_contacts;
create policy company_billing_contacts_insert
  on public.company_billing_contacts for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  );

drop policy if exists company_billing_contacts_update on public.company_billing_contacts;
create policy company_billing_contacts_update
  on public.company_billing_contacts for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  );

drop policy if exists company_billing_contacts_delete on public.company_billing_contacts;
create policy company_billing_contacts_delete
  on public.company_billing_contacts for delete
  using (
    auth.role() = 'authenticated'
    and public.is_super_admin()
  );

-- ── RLS: company_billing_profiles ───────────────────────────

alter table public.company_billing_profiles enable row level security;

drop policy if exists company_billing_profiles_select on public.company_billing_profiles;
create policy company_billing_profiles_select
  on public.company_billing_profiles for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists company_billing_profiles_insert on public.company_billing_profiles;
create policy company_billing_profiles_insert
  on public.company_billing_profiles for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  );

drop policy if exists company_billing_profiles_update on public.company_billing_profiles;
create policy company_billing_profiles_update
  on public.company_billing_profiles for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  );

drop policy if exists company_billing_profiles_delete on public.company_billing_profiles;
create policy company_billing_profiles_delete
  on public.company_billing_profiles for delete
  using (
    auth.role() = 'authenticated'
    and public.is_super_admin()
  );
