-- ============================================================
-- Sprint Security-1: CRM tenant isolation (company_id)
-- Replaces user_id / crm_same_company proxy with direct tenant key.
-- ============================================================

-- ── 1. Add company_id to legacy CRM tables ──────────────────

alter table public.customers
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

alter table public.bookings
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

alter table public.invoices
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

-- ── 2. Backfill from owner profile ───────────────────────────

update public.customers c
set company_id = p.company_id
from public.profiles p
where c.company_id is null
  and p.company_id is not null
  and (p.id = c.user_id or p.user_id = c.user_id);

update public.bookings b
set company_id = p.company_id
from public.profiles p
where b.company_id is null
  and p.company_id is not null
  and (p.id = b.user_id or p.user_id = b.user_id);

update public.invoices i
set company_id = p.company_id
from public.profiles p
where i.company_id is null
  and p.company_id is not null
  and (p.id = i.user_id or p.user_id = i.user_id);

-- Prefer customer company when linked
update public.bookings b
set company_id = c.company_id
from public.customers c
where b.company_id is null
  and b.customer_id = c.id
  and c.company_id is not null;

update public.invoices i
set company_id = c.company_id
from public.customers c
where i.company_id is null
  and i.customer_id = c.id
  and c.company_id is not null;

-- ── 3. Indexes & uniqueness per tenant ───────────────────────

create index if not exists idx_customers_company_id
  on public.customers(company_id);

create index if not exists idx_bookings_company_id
  on public.bookings(company_id);

create index if not exists idx_invoices_company_id
  on public.invoices(company_id);

create unique index if not exists idx_customers_company_phone_unique
  on public.customers(company_id, phone)
  where phone is not null and trim(phone) <> '';

create unique index if not exists idx_customers_company_email_unique
  on public.customers(company_id, lower(email))
  where email is not null and trim(email) <> '';

-- ── 4. Auto-set company_id on insert ─────────────────────────

create or replace function public.trg_crm_set_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customers_set_company_id on public.customers;
create trigger trg_customers_set_company_id
  before insert on public.customers
  for each row execute function public.trg_crm_set_company_id();

drop trigger if exists trg_bookings_set_company_id on public.bookings;
create trigger trg_bookings_set_company_id
  before insert on public.bookings
  for each row execute function public.trg_crm_set_company_id();

drop trigger if exists trg_invoices_set_company_id on public.invoices;
create trigger trg_invoices_set_company_id
  before insert on public.invoices
  for each row execute function public.trg_crm_set_company_id();

-- ── 5. Replace CRM RLS policies ──────────────────────────────

drop policy if exists "customers_own" on public.customers;
drop policy if exists customers_own on public.customers;
drop policy if exists customers_owner_select on public.customers;
drop policy if exists customers_owner_insert on public.customers;
drop policy if exists customers_owner_update on public.customers;
drop policy if exists customers_owner_delete on public.customers;
drop policy if exists customers_all on public.customers;
drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
drop policy if exists customers_tenant_select on public.customers;
drop policy if exists customers_tenant_insert on public.customers;
drop policy if exists customers_tenant_update on public.customers;
drop policy if exists customers_tenant_delete on public.customers;

create policy customers_tenant_select on public.customers for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'customers.view')
    )
  )
);

create policy customers_tenant_insert on public.customers for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'customers.create')
      and user_id = auth.uid()
    )
  )
);

create policy customers_tenant_update on public.customers for update
using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'customers.edit')
    )
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'customers.edit')
    )
  )
);

create policy customers_tenant_delete on public.customers for delete using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'customers.delete')
    )
  )
);

-- Bookings
drop policy if exists "bookings_own" on public.bookings;
drop policy if exists bookings_own on public.bookings;
drop policy if exists bookings_owner_select on public.bookings;
drop policy if exists bookings_owner_insert on public.bookings;
drop policy if exists bookings_owner_update on public.bookings;
drop policy if exists bookings_owner_delete on public.bookings;

drop policy if exists bookings_tenant_select on public.bookings;
drop policy if exists bookings_tenant_insert on public.bookings;
drop policy if exists bookings_tenant_update on public.bookings;
drop policy if exists bookings_tenant_delete on public.bookings;

create policy bookings_tenant_select on public.bookings for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'bookings.view')
    )
  )
);

create policy bookings_tenant_insert on public.bookings for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'bookings.create')
      and user_id = auth.uid()
    )
  )
);

create policy bookings_tenant_update on public.bookings for update
using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'bookings.edit')
    )
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'bookings.edit')
    )
  )
);

create policy bookings_tenant_delete on public.bookings for delete using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'bookings.delete')
    )
  )
);

-- Invoices
drop policy if exists "invoices_own" on public.invoices;
drop policy if exists invoices_own on public.invoices;
drop policy if exists invoices_owner_select on public.invoices;
drop policy if exists invoices_owner_insert on public.invoices;
drop policy if exists invoices_owner_update on public.invoices;
drop policy if exists invoices_owner_delete on public.invoices;

drop policy if exists invoices_tenant_select on public.invoices;
drop policy if exists invoices_tenant_insert on public.invoices;
drop policy if exists invoices_tenant_update on public.invoices;
drop policy if exists invoices_tenant_delete on public.invoices;

create policy invoices_tenant_select on public.invoices for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'invoices.view')
    )
  )
);

create policy invoices_tenant_insert on public.invoices for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'invoices.create')
      and user_id = auth.uid()
    )
  )
);

create policy invoices_tenant_update on public.invoices for update
using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'invoices.edit')
    )
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'invoices.edit')
    )
  )
);

create policy invoices_tenant_delete on public.invoices for delete using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id is not null
      and company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'invoices.delete')
    )
  )
);

-- ── 6. Deprecate crm_same_company (keep for backward compat, fix joins) ─

create or replace function public.crm_same_company(p_owner_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles owner_p
    inner join public.profiles me
      on (me.id = auth.uid() or me.user_id = auth.uid())
    where (owner_p.id = p_owner_user_id or owner_p.user_id = p_owner_user_id)
      and owner_p.company_id is not null
      and me.company_id is not null
      and owner_p.company_id = me.company_id
  );
$$;

comment on column public.customers.company_id is
  'Tenant scope for CRM isolation. Required for RLS; backfilled from owner profile.';
