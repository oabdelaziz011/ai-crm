-- ============================================================
-- Vault OS – Billing: Permissions (Phase 1)
-- Architecture: billing-subscriptions.md v4 §10
-- ============================================================

create or replace function public.user_has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.user_permissions up
      join public.permissions p on p.id = up.permission_id
      where up.user_id = auth.uid()
        and p.code = p_code
    )
    or exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = auth.uid()
        and p.code = p_code
    );
$$;

insert into public.permissions (code, category, module, action, description)
values
  ('billing.view', 'Billing', 'Billing & Subscriptions', 'View', 'View billing overview, subscriptions, payments, and invoices'),
  ('billing.view_own', 'Billing', 'Billing & Subscriptions', 'View Own', 'View own company subscription self-service'),
  ('billing.view_reports', 'Billing', 'Billing & Subscriptions', 'View Reports', 'View billing reports'),
  ('billing.edit', 'Billing', 'Billing & Subscriptions', 'Edit', 'Edit subscriptions, billing contacts, suspend/restore'),
  ('billing.manage_plans', 'Billing', 'Billing & Subscriptions', 'Manage Plans', 'Manage subscription plans catalog'),
  ('billing.record_payment', 'Billing', 'Billing & Subscriptions', 'Record Payment', 'Record manual payments and invoices'),
  ('billing.settings.view', 'Billing', 'Billing Settings', 'View', 'View billing settings'),
  ('billing.settings.edit', 'Billing', 'Billing Settings', 'Edit', 'Modify billing settings'),
  ('billing.audit.view', 'Billing', 'Billing Audit Log', 'View', 'View billing audit log'),
  ('billing.audit.export', 'Billing', 'Billing Audit Log', 'Export', 'Export billing audit log'),
  ('billing.features.view', 'Billing', 'Feature Entitlements', 'View', 'View feature catalog and overrides'),
  ('billing.features.edit', 'Billing', 'Feature Entitlements', 'Edit', 'Manage company feature overrides'),
  ('billing.features.manage_catalog', 'Billing', 'Feature Entitlements', 'Manage Catalog', 'Manage feature definitions catalog'),
  ('billing.health.view', 'Billing', 'Billing Health', 'View', 'View billing health dashboard'),
  ('billing.health.manage', 'Billing', 'Billing Health', 'Manage', 'Manage billing health jobs and retries'),
  ('billing.webhooks.view', 'Billing', 'Billing Webhooks', 'View', 'View outbound billing webhook endpoints'),
  ('billing.webhooks.manage', 'Billing', 'Billing Webhooks', 'Manage', 'Manage outbound billing webhooks')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- Map legacy subscriptions permissions to billing for existing role grants
insert into public.role_permissions (role_id, permission_id)
select r.id, p_new.id
from public.roles r
join public.role_permissions rp on rp.role_id = r.id
join public.permissions p_old on p_old.id = rp.permission_id
join public.permissions p_new on p_new.code = case
  when p_old.code = 'subscriptions.view' then 'billing.view'
  when p_old.code = 'subscriptions.edit' then 'billing.edit'
  else null
end
where p_new.code is not null
on conflict do nothing;

-- Grant all billing permissions to super admin profiles via direct user_permissions is not needed;
-- is_super_admin() bypass covers platform admins.

-- Tighten billing audit log select to billing.audit.view where possible
drop policy if exists billing_audit_logs_select on public.billing_audit_logs;
create policy billing_audit_logs_select
  on public.billing_audit_logs for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or public.user_has_permission('billing.audit.view')
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  );

grant execute on function public.user_has_permission(text) to authenticated;
