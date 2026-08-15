-- 279: AI consumption report permission + unlock executive/ai ops for reports.view roles

insert into public.permissions (code, category, module, action, description)
values
  ('reports.ai_consumption', 'Reports', 'Reports', 'AI consumption', 'View AI token consumption and paid usage report')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p.id
from public.role_permissions rp
join public.permissions existing on existing.id = rp.permission_id and existing.code = 'reports.view'
join public.permissions p on p.code = 'reports.ai_consumption'
on conflict (role_id, permission_id) do nothing;
