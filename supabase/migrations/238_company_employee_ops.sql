-- Sprint 3.4 — Company Workspace Employees production ops
-- last_sign_in_at listing + remove employee from company (no duplicate tables)

create or replace function public.list_company_employee_auth_meta(p_company_id uuid)
returns table (
  user_id uuid,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_company_id is null then
    raise exception 'Company required';
  end if;

  if not (
    public.is_super_admin()
    or (
      public.current_company_id() = p_company_id
      and (
        public.user_has_permission('company.view')
        or public.user_has_permission('employees.manage')
        or public.user_has_permission('users.view')
        or public.user_has_permission('users.edit')
        or public.user_has_permission('settings.view')
      )
    )
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  select
    p.id as user_id,
    u.last_sign_in_at,
    u.email_confirmed_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.company_id = p_company_id;
end;
$$;

revoke all on function public.list_company_employee_auth_meta(uuid) from public;
grant execute on function public.list_company_employee_auth_meta(uuid) to authenticated;

comment on function public.list_company_employee_auth_meta(uuid) is
  'Returns auth last_sign_in / invite metadata for employees of a company.';

create or replace function public.remove_company_employee(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_target_company_id uuid;
  v_is_super boolean;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_user_id is null then
    raise exception 'User required';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Cannot remove yourself';
  end if;

  select company_id into v_target_company_id
  from public.profiles
  where id = p_user_id;

  if v_target_company_id is null then
    raise exception 'Employee not found';
  end if;

  v_company_id := public.current_company_id();
  v_is_super := public.is_super_admin();

  if not v_is_super and (v_company_id is null or v_company_id <> v_target_company_id) then
    raise exception 'Forbidden';
  end if;

  if not (
    v_is_super
    or public.user_has_permission('users.delete')
    or public.user_has_permission('employees.manage')
    or public.user_has_permission('users.edit')
  ) then
    raise exception 'Forbidden';
  end if;

  if exists (
    select 1 from public.profiles where id = p_user_id and is_super_admin = true
  ) then
    raise exception 'Cannot remove a platform administrator';
  end if;

  delete from public.user_roles
  where user_id = p_user_id
    and role_id in (
      select r.id from public.roles r where r.company_id = v_target_company_id
    );

  delete from public.user_branch_assignments
  where user_id = p_user_id
    and company_id = v_target_company_id;

  update public.profiles
  set
    company_id = null,
    is_active = false,
    updated_at = now()
  where id = p_user_id;
end;
$$;

revoke all on function public.remove_company_employee(uuid) from public;
grant execute on function public.remove_company_employee(uuid) to authenticated;

comment on function public.remove_company_employee(uuid) is
  'Removes an employee from their company: clears company, roles, branches, and deactivates.';
