-- Backfill orders.* onto existing DEFAULT company roles after migration 471.
-- Pattern matches migration 224: templates first, then role_permissions for
-- role_type = 'DEFAULT' only. CUSTOM / PLATFORM roles are never modified.
-- Idempotent: not exists / on conflict do nothing. Safe additive migration.
-- Local/dev apply helpers must refuse production URLs.

-- Ensure catalog + templates remain present (no-ops if 471 already applied).
insert into public.permissions (code, category, module, action, description)
values
  ('orders.view', 'Orders', 'Orders', 'View', 'View sales orders'),
  ('orders.create', 'Orders', 'Orders', 'Create', 'Create sales orders'),
  ('orders.edit', 'Orders', 'Orders', 'Edit', 'Update sales orders and status'),
  ('orders.delete', 'Orders', 'Orders', 'Delete', 'Delete draft sales orders')
on conflict (code) do update
set category = excluded.category, module = excluded.module, action = excluded.action,
    description = excluded.description, updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'orders.view'),
    ('admin', 'orders.create'),
    ('admin', 'orders.edit'),
    ('admin', 'orders.delete'),
    ('manager', 'orders.view'),
    ('manager', 'orders.create'),
    ('manager', 'orders.edit'),
    ('employee', 'orders.view')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

-- Existing DEFAULT company roles only — never CUSTOM or PLATFORM.
insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p.id
from public.roles r
inner join public.platform_role_template_permissions trp
  on trp.template_key = r.template_key
inner join public.permissions p
  on p.code = trp.permission_code
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and trp.permission_code in (
    'orders.view',
    'orders.create',
    'orders.edit',
    'orders.delete'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );
