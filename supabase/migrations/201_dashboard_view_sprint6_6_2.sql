-- Sprint 6.6.2 — Dashboard RBAC foundation (dashboard.view)

insert into public.permissions (code, category, module, action, description)
values
  ('dashboard.view', 'Dashboard', 'Dashboard', 'View', 'View the enterprise operations dashboard and aggregated metrics')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'dashboard.view'),
    ('manager', 'dashboard.view'),
    ('employee', 'dashboard.view')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

-- Backfill admin roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'dashboard.view'
where r.company_id is not null
  and r.is_system = true
  and (
    r.template_key = 'admin'
    or r.name ilike '%admin%'
    or r.description ilike '%administrator%'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

-- Backfill manager and employee system roles from templates
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.platform_role_template_permissions trp
  on trp.template_key = r.template_key
join public.permissions p
  on p.code = trp.permission_code
where r.company_id is not null
  and r.is_system = true
  and r.template_key in ('manager', 'employee')
  and trp.permission_code = 'dashboard.view'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

-- Grant dashboard access to roles that can view reports (legacy parity)
insert into public.role_permissions (role_id, permission_id)
select distinct rp_reports.role_id, p_dashboard.id
from public.role_permissions rp_reports
join public.permissions p_reports
  on p_reports.id = rp_reports.permission_id
 and p_reports.code = 'reports.view'
join public.permissions p_dashboard
  on p_dashboard.code = 'dashboard.view'
where not exists (
  select 1
  from public.role_permissions existing
  where existing.role_id = rp_reports.role_id
    and existing.permission_id = p_dashboard.id
);
