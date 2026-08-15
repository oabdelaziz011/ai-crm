-- 278: Additional report permissions for companies / SaaS revenue / subscriptions

insert into public.permissions (code, category, module, action, description)
values
  ('reports.companies', 'Reports', 'Reports', 'Companies', 'View companies report'),
  ('reports.company_revenue', 'Reports', 'Reports', 'Company revenue', 'View company SaaS revenue report'),
  ('reports.subscriptions', 'Reports', 'Reports', 'Subscriptions', 'View subscriptions report')
on conflict (code) do nothing;

-- Grant to roles that already have reports.view
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p.id
from public.role_permissions rp
join public.permissions existing on existing.id = rp.permission_id and existing.code = 'reports.view'
join public.permissions p on p.code in (
  'reports.companies',
  'reports.company_revenue',
  'reports.subscriptions'
)
on conflict (role_id, permission_id) do nothing;
