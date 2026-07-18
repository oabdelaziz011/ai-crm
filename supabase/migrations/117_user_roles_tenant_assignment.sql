-- Prevent cross-tenant user_roles assignment for all callers (including super admin).
-- role.company_id must match the target profile.company_id.

drop policy if exists user_roles_insert_policy on public.user_roles;
create policy user_roles_insert_policy on public.user_roles for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('users.edit')
  )
  and exists (
    select 1
    from public.profiles p
    inner join public.roles r on r.id = user_roles.role_id
    where p.id = user_roles.user_id
      and p.company_id is not null
      and r.company_id is not null
      and r.company_id = p.company_id
  )
);
