-- =============================================================================
-- 364 — ValueOR DEFAULT Admin: Email Workspace tab permissions
-- =============================================================================
-- Grants ONLY the existing 363 tab permissions to the ValueOR company
-- DEFAULT Admin role (template_key = 'admin').
--
-- Does NOT:
--   - create new permissions
--   - grant to the 125 settings.edit roles
--   - modify Super Admin / PLATFORM roles
--   - modify الايميل or other CUSTOM roles
--   - touch user_permissions
--   - change conversation permissions
--   - change RLS
-- =============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.code in ('email.templates.view', 'email.routing.view', 'ai.email.manage')
where r.company_id = '2d27f7fb-c15e-4d60-84e9-1793f36f2172'::uuid
  and r.role_type = 'DEFAULT'
  and r.template_key = 'admin'
on conflict do nothing;

do $$
declare
  v_admin uuid;
  v_missing integer;
begin
  select r.id into v_admin
  from public.roles r
  where r.company_id = '2d27f7fb-c15e-4d60-84e9-1793f36f2172'::uuid
    and r.role_type = 'DEFAULT'
    and r.template_key = 'admin';

  if v_admin is null then
    raise exception '364 fail-closed: ValueOR DEFAULT Admin role not found';
  end if;

  select count(*)::int into v_missing
  from (
    values ('email.templates.view'), ('email.routing.view'), ('ai.email.manage')
  ) as required(code)
  where not exists (
    select 1
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = v_admin
      and p.code = required.code
  );

  if v_missing <> 0 then
    raise exception '364 fail-closed: ValueOR DEFAULT Admin missing % tab permission(s)', v_missing;
  end if;
end $$;
