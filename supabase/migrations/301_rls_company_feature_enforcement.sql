-- ============================================================
-- 301 — RLS Company Feature Enforcement
--
-- Closes the DB/RLS gap: mapped product permissions require
-- RBAC AND company feature availability.
--
-- DOES NOT modify user_has_permission (RBAC-only primitive).
-- DOES NOT change migrations 297/298/299 mappings.
-- DOES NOT invent zero-mapping features or split core_crm.
--
-- Strategy:
-- 1) Strengthen internal.company_has_permission (used by ~129
--    product-table RLS policies) to AND permission_available_to_company.
-- 2) Replace category-A policies that called raw
--    internal.user_has_permission for mapped product permissions
--    with public.has_company_permission.
-- 3) Keep platform/admin RBAC-only policies unchanged.
-- ============================================================

-- Harden execute grants from migration 300 (anon must not execute).
revoke all on function public.has_company_permission(text) from public;
revoke all on function public.has_company_permission(text) from anon;
revoke all on function public.has_company_permission(uuid, text) from public;
revoke all on function public.has_company_permission(uuid, text) from anon;
grant execute on function public.has_company_permission(text) to authenticated, service_role;
grant execute on function public.has_company_permission(uuid, text) to authenticated, service_role;

-- Existing product RLS helper: was tenant + RBAC only.
-- Now: tenant + RBAC + company feature availability for mapped permissions.
-- Unmapped permissions remain available via permission_available_to_company fail-open.
-- Super Admin bypass preserved. Service-role continues to bypass RLS entirely.
create or replace function internal.company_has_permission(
  p_company_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path to internal, public
as $$
  select
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        p_company_id is not null
        and p_company_id = public.current_company_id()
        and public.user_has_permission(p_permission)
        and public.permission_available_to_company(p_company_id, p_permission)
      )
    );
$$;

comment on function internal.company_has_permission(uuid, text) is
  'Tenant product RLS gate: authenticated + (super admin OR same-company RBAC AND company feature availability).';

create or replace function public.company_has_permission(
  p_company_id uuid,
  p_permission text
)
returns boolean
language sql
stable
set search_path to public, internal
as $$
  select internal.company_has_permission(p_company_id, p_permission);
$$;

revoke all on function public.company_has_permission(uuid, text) from public;
revoke all on function public.company_has_permission(uuid, text) from anon;
grant execute on function public.company_has_permission(uuid, text) to authenticated, service_role;
revoke all on function internal.company_has_permission(uuid, text) from public;
revoke all on function internal.company_has_permission(uuid, text) from anon;
grant execute on function internal.company_has_permission(uuid, text) to authenticated, service_role;

create or replace function internal.has_company_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path to internal, public
as $$
  select public.has_company_permission(p_code);
$$;

create or replace function internal.has_company_permission(
  p_company_id uuid,
  p_code text
)
returns boolean
language sql
stable
security definer
set search_path to internal, public
as $$
  select public.has_company_permission(p_company_id, p_code);
$$;

revoke all on function internal.has_company_permission(text) from public;
revoke all on function internal.has_company_permission(text) from anon;
revoke all on function internal.has_company_permission(uuid, text) from public;
revoke all on function internal.has_company_permission(uuid, text) from anon;
grant execute on function internal.has_company_permission(text) to authenticated, service_role;
grant execute on function internal.has_company_permission(uuid, text) to authenticated, service_role;

-- Category A policy rewrites (mapped product permissions only).
-- users.edit remains RBAC-only where present.

-- branches.branches_delete (DELETE)
drop policy if exists "branches_delete" on public.branches;
create policy "branches_delete" on public.branches for delete
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- branches.branches_insert (INSERT)
drop policy if exists "branches_insert" on public.branches;
create policy "branches_insert" on public.branches for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- branches.branches_update (UPDATE)
drop policy if exists "branches_update" on public.branches;
create policy "branches_update" on public.branches for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- customer_communication_preferences.customer_comm_prefs_write (ALL)
drop policy if exists "customer_comm_prefs_write" on public.customer_communication_preferences;
create policy "customer_comm_prefs_write" on public.customer_communication_preferences for all
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('customers.edit'::text)))))
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('customers.edit'::text)))));

-- resource_services.resource_services_delete (DELETE)
drop policy if exists "resource_services_delete" on public.resource_services;
create policy "resource_services_delete" on public.resource_services for delete
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- resource_services.resource_services_insert (INSERT)
drop policy if exists "resource_services_insert" on public.resource_services;
create policy "resource_services_insert" on public.resource_services for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- resource_services.resource_services_update (UPDATE)
drop policy if exists "resource_services_update" on public.resource_services;
create policy "resource_services_update" on public.resource_services for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_availability_exceptions.scheduling_exceptions_delete (DELETE)
drop policy if exists "scheduling_exceptions_delete" on public.scheduling_availability_exceptions;
create policy "scheduling_exceptions_delete" on public.scheduling_availability_exceptions for delete
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_availability_exceptions.scheduling_exceptions_insert (INSERT)
drop policy if exists "scheduling_exceptions_insert" on public.scheduling_availability_exceptions;
create policy "scheduling_exceptions_insert" on public.scheduling_availability_exceptions for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_availability_exceptions.scheduling_exceptions_update (UPDATE)
drop policy if exists "scheduling_exceptions_update" on public.scheduling_availability_exceptions;
create policy "scheduling_exceptions_update" on public.scheduling_availability_exceptions for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_booking_rules.scheduling_booking_rules_insert (INSERT)
drop policy if exists "scheduling_booking_rules_insert" on public.scheduling_booking_rules;
create policy "scheduling_booking_rules_insert" on public.scheduling_booking_rules for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_booking_rules.scheduling_booking_rules_update (UPDATE)
drop policy if exists "scheduling_booking_rules_update" on public.scheduling_booking_rules;
create policy "scheduling_booking_rules_update" on public.scheduling_booking_rules for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_bookings.scheduling_bookings_delete (DELETE)
drop policy if exists "scheduling_bookings_delete" on public.scheduling_bookings;
create policy "scheduling_bookings_delete" on public.scheduling_bookings for delete
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('bookings.delete'::text)))));

-- scheduling_bookings.scheduling_bookings_insert (INSERT)
drop policy if exists "scheduling_bookings_insert" on public.scheduling_bookings;
create policy "scheduling_bookings_insert" on public.scheduling_bookings for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('bookings.create'::text)))));

-- scheduling_bookings.scheduling_bookings_select (SELECT)
drop policy if exists "scheduling_bookings_select" on public.scheduling_bookings;
create policy "scheduling_bookings_select" on public.scheduling_bookings for select
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (deleted_at IS NULL) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('bookings.view'::text)))));

-- scheduling_bookings.scheduling_bookings_update (UPDATE)
drop policy if exists "scheduling_bookings_update" on public.scheduling_bookings;
create policy "scheduling_bookings_update" on public.scheduling_bookings for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('bookings.edit'::text)))));

-- scheduling_holidays.scheduling_holidays_delete (DELETE)
drop policy if exists "scheduling_holidays_delete" on public.scheduling_holidays;
create policy "scheduling_holidays_delete" on public.scheduling_holidays for delete
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_holidays.scheduling_holidays_insert (INSERT)
drop policy if exists "scheduling_holidays_insert" on public.scheduling_holidays;
create policy "scheduling_holidays_insert" on public.scheduling_holidays for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_holidays.scheduling_holidays_update (UPDATE)
drop policy if exists "scheduling_holidays_update" on public.scheduling_holidays;
create policy "scheduling_holidays_update" on public.scheduling_holidays for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_no_show_rules.scheduling_no_show_rules_insert (INSERT)
drop policy if exists "scheduling_no_show_rules_insert" on public.scheduling_no_show_rules;
create policy "scheduling_no_show_rules_insert" on public.scheduling_no_show_rules for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_no_show_rules.scheduling_no_show_rules_select (SELECT)
drop policy if exists "scheduling_no_show_rules_select" on public.scheduling_no_show_rules;
create policy "scheduling_no_show_rules_select" on public.scheduling_no_show_rules for select
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.view'::text)))));

-- scheduling_no_show_rules.scheduling_no_show_rules_update (UPDATE)
drop policy if exists "scheduling_no_show_rules_update" on public.scheduling_no_show_rules;
create policy "scheduling_no_show_rules_update" on public.scheduling_no_show_rules for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_pricing_rule_types.scheduling_pricing_rule_types_insert (INSERT)
drop policy if exists "scheduling_pricing_rule_types_insert" on public.scheduling_pricing_rule_types;
create policy "scheduling_pricing_rule_types_insert" on public.scheduling_pricing_rule_types for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_pricing_rule_types.scheduling_pricing_rule_types_update (UPDATE)
drop policy if exists "scheduling_pricing_rule_types_update" on public.scheduling_pricing_rule_types;
create policy "scheduling_pricing_rule_types_update" on public.scheduling_pricing_rule_types for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_resource_breaks.scheduling_breaks_delete (DELETE)
drop policy if exists "scheduling_breaks_delete" on public.scheduling_resource_breaks;
create policy "scheduling_breaks_delete" on public.scheduling_resource_breaks for delete
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_resource_breaks.scheduling_breaks_insert (INSERT)
drop policy if exists "scheduling_breaks_insert" on public.scheduling_resource_breaks;
create policy "scheduling_breaks_insert" on public.scheduling_resource_breaks for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_resource_breaks.scheduling_breaks_update (UPDATE)
drop policy if exists "scheduling_breaks_update" on public.scheduling_resource_breaks;
create policy "scheduling_breaks_update" on public.scheduling_resource_breaks for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_resource_weekly_hours.scheduling_weekly_hours_delete (DELETE)
drop policy if exists "scheduling_weekly_hours_delete" on public.scheduling_resource_weekly_hours;
create policy "scheduling_weekly_hours_delete" on public.scheduling_resource_weekly_hours for delete
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_resource_weekly_hours.scheduling_weekly_hours_insert (INSERT)
drop policy if exists "scheduling_weekly_hours_insert" on public.scheduling_resource_weekly_hours;
create policy "scheduling_weekly_hours_insert" on public.scheduling_resource_weekly_hours for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_resource_weekly_hours.scheduling_weekly_hours_update (UPDATE)
drop policy if exists "scheduling_weekly_hours_update" on public.scheduling_resource_weekly_hours;
create policy "scheduling_weekly_hours_update" on public.scheduling_resource_weekly_hours for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_resources.scheduling_resources_delete (DELETE)
drop policy if exists "scheduling_resources_delete" on public.scheduling_resources;
create policy "scheduling_resources_delete" on public.scheduling_resources for delete
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_resources.scheduling_resources_insert (INSERT)
drop policy if exists "scheduling_resources_insert" on public.scheduling_resources;
create policy "scheduling_resources_insert" on public.scheduling_resources for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_resources.scheduling_resources_update (UPDATE)
drop policy if exists "scheduling_resources_update" on public.scheduling_resources;
create policy "scheduling_resources_update" on public.scheduling_resources for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_service_pricing_rules.scheduling_service_pricing_rules_insert (INSERT)
drop policy if exists "scheduling_service_pricing_rules_insert" on public.scheduling_service_pricing_rules;
create policy "scheduling_service_pricing_rules_insert" on public.scheduling_service_pricing_rules for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_service_pricing_rules.scheduling_service_pricing_rules_update (UPDATE)
drop policy if exists "scheduling_service_pricing_rules_update" on public.scheduling_service_pricing_rules;
create policy "scheduling_service_pricing_rules_update" on public.scheduling_service_pricing_rules for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_services.scheduling_services_delete (DELETE)
drop policy if exists "scheduling_services_delete" on public.scheduling_services;
create policy "scheduling_services_delete" on public.scheduling_services for delete
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_services.scheduling_services_insert (INSERT)
drop policy if exists "scheduling_services_insert" on public.scheduling_services;
create policy "scheduling_services_insert" on public.scheduling_services for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- scheduling_services.scheduling_services_update (UPDATE)
drop policy if exists "scheduling_services_update" on public.scheduling_services;
create policy "scheduling_services_update" on public.scheduling_services for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND public.has_company_permission('scheduling.edit'::text)))));

-- user_branch_assignments.user_branch_assignments_delete (DELETE)
drop policy if exists "user_branch_assignments_delete" on public.user_branch_assignments;
create policy "user_branch_assignments_delete" on public.user_branch_assignments for delete
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND (internal.user_has_permission('users.edit'::text) OR public.has_company_permission('scheduling.edit'::text))))));

-- user_branch_assignments.user_branch_assignments_insert (INSERT)
drop policy if exists "user_branch_assignments_insert" on public.user_branch_assignments;
create policy "user_branch_assignments_insert" on public.user_branch_assignments for insert
  to authenticated
  with check (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND (internal.user_has_permission('users.edit'::text) OR public.has_company_permission('scheduling.edit'::text))))));

-- user_branch_assignments.user_branch_assignments_update (UPDATE)
drop policy if exists "user_branch_assignments_update" on public.user_branch_assignments;
create policy "user_branch_assignments_update" on public.user_branch_assignments for update
  to authenticated
  using (((auth.role() = 'authenticated'::text) AND (internal.is_super_admin() OR ((company_id = internal.current_company_id()) AND (internal.user_has_permission('users.edit'::text) OR public.has_company_permission('scheduling.edit'::text))))));

