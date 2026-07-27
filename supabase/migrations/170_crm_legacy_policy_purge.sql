-- ============================================================
-- Sprint Security-1: Purge legacy permissive CRM RLS policies
-- customers_all (qual=true) bypasses tenant isolation entirely.
-- ============================================================

-- ── Customers ───────────────────────────────────────────────

drop policy if exists customers_all on public.customers;
drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
drop policy if exists "customers_own" on public.customers;
drop policy if exists customers_own on public.customers;
drop policy if exists customers_owner_select on public.customers;
drop policy if exists customers_owner_insert on public.customers;
drop policy if exists customers_owner_update on public.customers;
drop policy if exists customers_owner_delete on public.customers;

-- Ensure tenant policies exist (idempotent if 167 already ran)
drop policy if exists customers_tenant_select on public.customers;
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

drop policy if exists customers_tenant_insert on public.customers;
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

drop policy if exists customers_tenant_update on public.customers;
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

drop policy if exists customers_tenant_delete on public.customers;
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

-- ── Bookings ────────────────────────────────────────────────

drop policy if exists bookings_all on public.bookings;
drop policy if exists bookings_select on public.bookings;
drop policy if exists bookings_insert on public.bookings;
drop policy if exists bookings_update on public.bookings;
drop policy if exists bookings_delete on public.bookings;
drop policy if exists "bookings_own" on public.bookings;
drop policy if exists bookings_own on public.bookings;
drop policy if exists bookings_owner_select on public.bookings;
drop policy if exists bookings_owner_insert on public.bookings;
drop policy if exists bookings_owner_update on public.bookings;
drop policy if exists bookings_owner_delete on public.bookings;

drop policy if exists bookings_tenant_select on public.bookings;
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

drop policy if exists bookings_tenant_insert on public.bookings;
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

drop policy if exists bookings_tenant_update on public.bookings;
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

drop policy if exists bookings_tenant_delete on public.bookings;
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

-- ── Invoices ────────────────────────────────────────────────

drop policy if exists invoices_all on public.invoices;
drop policy if exists invoices_select on public.invoices;
drop policy if exists invoices_insert on public.invoices;
drop policy if exists invoices_update on public.invoices;
drop policy if exists invoices_delete on public.invoices;
drop policy if exists "invoices_own" on public.invoices;
drop policy if exists invoices_own on public.invoices;
drop policy if exists invoices_owner_select on public.invoices;
drop policy if exists invoices_owner_insert on public.invoices;
drop policy if exists invoices_owner_update on public.invoices;
drop policy if exists invoices_owner_delete on public.invoices;

drop policy if exists invoices_tenant_select on public.invoices;
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

drop policy if exists invoices_tenant_insert on public.invoices;
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

drop policy if exists invoices_tenant_update on public.invoices;
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

drop policy if exists invoices_tenant_delete on public.invoices;
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

comment on policy customers_tenant_select on public.customers is
  'Tenant isolation: company_id must match current_company_id() with customers.view permission.';
