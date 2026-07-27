-- ============================================================
-- Vault OS – AI provider connection RBAC repair
-- Company admins could edit AI Assistant settings but lacked
-- ai.providers.view / ai.providers.manage, so provider saves
-- were denied by service layer + RLS (migration 114).
-- ============================================================

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'ai.providers.view'),
    ('admin', 'ai.providers.manage'),
    ('admin', 'runtime.execute')
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
  on p.code in ('ai.providers.view', 'ai.providers.manage', 'runtime.execute')
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
