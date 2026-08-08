-- Sprint 3.4 — Company Workspace granular permissions
-- Descriptive job titles never grant these. Roles remain the source of truth.

insert into public.permissions (code, category, module, action, description)
values
  ('company.view', 'Company', 'Company Workspace', 'View', 'View the company workspace'),
  ('company.update', 'Company', 'Company Workspace', 'Update', 'Update company profile details'),
  ('company.branding', 'Company', 'Company Workspace', 'Branding', 'Manage company branding assets'),
  ('company.subscription', 'Company', 'Company Workspace', 'Subscription', 'View and manage company subscription'),
  ('employees.manage', 'Company', 'Employees', 'Manage', 'Invite and manage company employees'),
  ('branches.manage', 'Company', 'Branches', 'Manage', 'Create and manage company branches'),
  ('departments.manage', 'Company', 'Departments', 'Manage', 'Create and manage company departments')
on conflict (code) do nothing;

-- Grant to tenant company administrator roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is not null
  and r.is_system = true
  and (
    r.name ilike '%admin%'
    or r.description ilike '%administrator%'
    or r.template_key = 'admin'
  )
  and p.code in (
    'company.view',
    'company.update',
    'company.branding',
    'company.subscription',
    'employees.manage',
    'branches.manage',
    'departments.manage'
  )
on conflict do nothing;

-- Also grant company.view to roles that already have settings.view (soft migration)
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id = rp.permission_id
join public.permissions p_new on p_new.code = 'company.view'
where p_old.code in ('settings.view', 'settings.edit')
on conflict do nothing;
