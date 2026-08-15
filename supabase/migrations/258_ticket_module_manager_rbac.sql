-- Grant Manager ticket permissions so Admin/Manager can operate the Ticketing module.

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('manager', 'tickets.view'),
    ('manager', 'tickets.create'),
    ('manager', 'tickets.edit'),
    ('manager', 'tickets.assign'),
    ('manager', 'tickets.comment'),
    ('manager', 'tickets.close')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.code in (
    'tickets.view',
    'tickets.create',
    'tickets.edit',
    'tickets.assign',
    'tickets.comment',
    'tickets.close'
  )
where r.template_key = 'manager'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );
