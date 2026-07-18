-- ============================================================
-- Vault OS – Assignable roles RPC for Users page
-- Dedicated read path for users.edit holders (not roles.view).
-- Does not weaken roles_select_policy on public.roles.
-- ============================================================

create or replace function public.get_assignable_roles(p_company_id uuid)
returns table (
  id uuid,
  name text,
  is_system boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not public.user_has_permission('users.edit') then
    raise exception 'Forbidden';
  end if;

  if not public.is_super_admin()
     and public.current_company_id() is distinct from p_company_id then
    raise exception 'Cross tenant access denied';
  end if;

  return query
  select r.id, r.name, r.is_system
  from public.roles r
  where r.company_id = p_company_id
  order by r.name asc nulls last;
end;
$$;

revoke all on function public.get_assignable_roles(uuid) from public;
grant execute on function public.get_assignable_roles(uuid) to authenticated;

comment on function public.get_assignable_roles(uuid) is
  'Users-page assignable role catalog. Requires users.edit; tenant-scoped to p_company_id (any tenant for super admin). Returns id, name, is_system only.';
