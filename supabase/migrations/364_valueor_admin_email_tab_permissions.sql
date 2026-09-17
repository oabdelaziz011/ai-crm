-- =============================================================================
-- 364 — DEFAULT Admin: Email Workspace tab permissions
-- =============================================================================
-- Grants the existing 363 tab permissions to ALL canonical DEFAULT Admin roles
-- (role_type = 'DEFAULT' AND template_key = 'admin').
--
-- Does NOT:
--   - create new permissions
--   - create companies or roles
--   - grant to non-admin DEFAULT templates
--   - grant to PLATFORM or CUSTOM roles
--   - grant via settings.edit or other unrelated permissions
--   - touch user_permissions
--   - change conversation permissions
--   - change RLS
-- =============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.code in ('email.templates.view', 'email.routing.view', 'ai.email.manage')
where r.role_type = 'DEFAULT'
  and r.template_key = 'admin'
on conflict do nothing;

do $$
declare
  v_admin_count integer;
  v_missing integer;
begin
  select count(*)::int into v_admin_count
  from public.roles r
  where r.role_type = 'DEFAULT'
    and r.template_key = 'admin';

  if v_admin_count = 0 then
    raise notice
      '364 soft-skip: no DEFAULT/admin roles present; email tab grants not required on clean replay';
    return;
  end if;

  select count(*)::int into v_missing
  from public.roles r
  cross join (
    values ('email.templates.view'), ('email.routing.view'), ('ai.email.manage')
  ) as required(code)
  where r.role_type = 'DEFAULT'
    and r.template_key = 'admin'
    and not exists (
      select 1
      from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = r.id
        and p.code = required.code
    );

  if v_missing <> 0 then
    raise exception
      '364 fail-closed: DEFAULT/admin role(s) missing % email tab permission grant(s)',
      v_missing;
  end if;
end $$;
