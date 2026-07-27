-- ============================================================
-- Sprint Security-1: Tenant-scoped permission evaluation
-- Roles grant permissions ONLY within current_company_id().
-- ============================================================

create or replace function public.user_has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.user_permissions up
      join public.permissions p on p.id = up.permission_id
      where up.user_id = auth.uid()
        and p.code = public.resolve_permission_code(p_code)
    )
    or exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = auth.uid()
        and r.company_id is not null
        and r.company_id = public.current_company_id()
        and p.code = public.resolve_permission_code(p_code)
    );
$$;

create or replace function public.user_has_permission_in_company(
  p_company_id uuid,
  p_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      p_company_id is not null
      and p_company_id = public.current_company_id()
      and public.user_has_permission(p_code)
    );
$$;

grant execute on function public.user_has_permission_in_company(uuid, text) to authenticated;

comment on function public.user_has_permission(text) is
  'Tenant-scoped: role permissions apply only when role.company_id = current_company_id().';
