-- =============================================================================
-- 478 — Backfill orders.assign_delivery for eligible company roles.
-- Additive / idempotent. Does not modify historical migrations.
--
-- Eligible roles:
--   1) DEFAULT roles with template_key admin|manager (reaffirm 475)
--   2) Company system admin roles (is_system) that already have orders.edit
--      — covers DEMO * Admin CUSTOM roles which 475 intentionally skipped
--   3) Any company role that already has the full orders CRUD set
--      (view+create+edit+delete) but is missing assign_delivery
--
-- Never grants to every role. Never touches PLATFORM roles.
-- =============================================================================

insert into public.permissions (code, category, module, action, description)
values
  ('orders.assign_delivery', 'Orders', 'Orders', 'Assign', 'Assign delivery workers to confirmed sales orders')
on conflict (code) do update
set category = excluded.category, module = excluded.module, action = excluded.action,
    description = excluded.description, updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'orders.assign_delivery'),
    ('manager', 'orders.assign_delivery')
) as v(template_key, permission_code)
on conflict do nothing;

-- 1) DEFAULT template roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and r.template_key in ('admin', 'manager')
  and p.code = 'orders.assign_delivery'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );

-- 2) Company system admin roles that can already edit orders
insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_assign.id
from public.roles r
join public.permissions p_assign on p_assign.code = 'orders.assign_delivery'
join public.role_permissions rp_edit
  on rp_edit.role_id = r.id
join public.permissions p_edit
  on p_edit.id = rp_edit.permission_id and p_edit.code = 'orders.edit'
where r.company_id is not null
  and r.is_system is true
  and coalesce(r.role_type, 'CUSTOM') <> 'PLATFORM'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p_assign.id
  );

-- 3) Roles that already have full orders CRUD but lack assign_delivery
insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p_assign.id
from public.roles r
join public.permissions p_assign on p_assign.code = 'orders.assign_delivery'
where r.company_id is not null
  and coalesce(r.role_type, 'CUSTOM') <> 'PLATFORM'
  and exists (
    select 1 from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = r.id and p.code = 'orders.view'
  )
  and exists (
    select 1 from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = r.id and p.code = 'orders.create'
  )
  and exists (
    select 1 from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = r.id and p.code = 'orders.edit'
  )
  and exists (
    select 1 from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = r.id and p.code = 'orders.delete'
  )
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p_assign.id
  );
