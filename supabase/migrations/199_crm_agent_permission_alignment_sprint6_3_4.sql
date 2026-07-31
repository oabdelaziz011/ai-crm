-- Sprint 6.3.4 — CRM agent permission alignment with CRM table RLS.
-- Aligns tool_definitions.required_permissions with customers/invoices/bookings RLS codes.
-- Preserves backward compatibility via legacy agent permission codes and role backfills.

-- ---------------------------------------------------------------------------
-- 1. Clarify legacy agent-specific permission descriptions (aliases retained)
-- ---------------------------------------------------------------------------
update public.permissions
set
  description = 'Search customer records via CRM agent tools. Alias: satisfies customers.view for agent tools when assigned alone.',
  updated_at = now()
where code = 'customers.search';

update public.permissions
set
  description = 'Update customer fields via CRM agent tools. Alias: satisfies customers.edit for agent tools when assigned alone.',
  updated_at = now()
where code = 'customers.update';

update public.permissions
set
  description = 'Merge duplicate customer records via CRM agent tools. Alias: satisfies customers.edit and customers.delete for merge_customers when assigned alone.',
  updated_at = now()
where code = 'customers.merge';

update public.permissions
set
  description = 'Bulk import customers via CRM agent tools. Alias: satisfies customers.create for agent tools when assigned alone.',
  updated_at = now()
where code = 'customers.import';

-- ---------------------------------------------------------------------------
-- 2. Align CRM agent tool_definitions with CRM RLS permissions
-- ---------------------------------------------------------------------------
update public.tool_definitions
set
  required_permissions = '["tools.execute", "customers.view"]'::jsonb,
  updated_at = now()
where key in ('search_customer', 'find_duplicate_customers');

update public.tool_definitions
set
  required_permissions = '["tools.execute", "customers.edit"]'::jsonb,
  updated_at = now()
where key = 'update_customer';

update public.tool_definitions
set
  required_permissions = '["tools.execute", "customers.edit", "customers.delete"]'::jsonb,
  updated_at = now()
where key = 'merge_customers';

update public.tool_definitions
set
  required_permissions = '["tools.execute", "customers.create"]'::jsonb,
  updated_at = now()
where key = 'import_customers';

-- ---------------------------------------------------------------------------
-- 3. Backfill CRM RLS permissions for roles holding legacy agent codes
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_id)
select distinct rp_legacy.role_id, p_rls.id
from public.role_permissions rp_legacy
join public.permissions p_legacy on p_legacy.id = rp_legacy.permission_id
join public.permissions p_rls on p_rls.code = 'customers.view'
where p_legacy.code = 'customers.search'
  and not exists (
    select 1
    from public.role_permissions existing
    where existing.role_id = rp_legacy.role_id
      and existing.permission_id = p_rls.id
  );

insert into public.role_permissions (role_id, permission_id)
select distinct rp_legacy.role_id, p_rls.id
from public.role_permissions rp_legacy
join public.permissions p_legacy on p_legacy.id = rp_legacy.permission_id
join public.permissions p_rls on p_rls.code = 'customers.edit'
where p_legacy.code in ('customers.update', 'customers.merge')
  and not exists (
    select 1
    from public.role_permissions existing
    where existing.role_id = rp_legacy.role_id
      and existing.permission_id = p_rls.id
  );

insert into public.role_permissions (role_id, permission_id)
select distinct rp_legacy.role_id, p_rls.id
from public.role_permissions rp_legacy
join public.permissions p_legacy on p_legacy.id = rp_legacy.permission_id
join public.permissions p_rls on p_rls.code = 'customers.create'
where p_legacy.code = 'customers.import'
  and not exists (
    select 1
    from public.role_permissions existing
    where existing.role_id = rp_legacy.role_id
      and existing.permission_id = p_rls.id
  );

insert into public.role_permissions (role_id, permission_id)
select distinct rp_legacy.role_id, p_rls.id
from public.role_permissions rp_legacy
join public.permissions p_legacy on p_legacy.id = rp_legacy.permission_id
join public.permissions p_rls on p_rls.code = 'customers.delete'
where p_legacy.code = 'customers.merge'
  and not exists (
    select 1
    from public.role_permissions existing
    where existing.role_id = rp_legacy.role_id
      and existing.permission_id = p_rls.id
  );

-- ---------------------------------------------------------------------------
-- 4. Seed CRM agent tool permissions into default role templates
-- ---------------------------------------------------------------------------
insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'customers.search'),
    ('admin', 'customers.update'),
    ('admin', 'customers.merge'),
    ('admin', 'customers.import'),
    ('manager', 'customers.search'),
    ('manager', 'customers.update'),
    ('employee', 'customers.search')
) as seed(template_key, permission_code)
where exists (
  select 1
  from public.permissions p
  where p.code = seed.permission_code
)
on conflict (template_key, permission_code) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Backfill company roles from updated templates (admin/manager/employee)
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.platform_role_template_permissions trp
  on trp.template_key = r.template_key
join public.permissions p
  on p.code = trp.permission_code
where r.company_id is not null
  and r.is_system = true
  and r.template_key in ('admin', 'manager', 'employee')
  and trp.permission_code in (
    'customers.search',
    'customers.update',
    'customers.merge',
    'customers.import'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );
