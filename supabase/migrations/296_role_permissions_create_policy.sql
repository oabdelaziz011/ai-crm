-- Allow assigning permissions when creating a CUSTOM tenant role with roles.create
-- (previously only roles.edit could insert role_permissions, blocking create flows).

drop policy if exists role_permissions_insert_policy on public.role_permissions;
create policy role_permissions_insert_policy
  on public.role_permissions for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.roles r
      where r.id = role_permissions.role_id
        and (
          public.is_super_admin()
          or (
            r.company_id = public.current_company_id()
            and r.role_type = 'CUSTOM'
            and (
              public.user_has_permission('roles.edit')
              or public.user_has_permission('roles.create')
            )
          )
        )
    )
  );

drop policy if exists role_permissions_delete_policy on public.role_permissions;
create policy role_permissions_delete_policy
  on public.role_permissions for delete
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.roles r
      where r.id = role_permissions.role_id
        and (
          public.is_super_admin()
          or (
            r.company_id = public.current_company_id()
            and r.role_type = 'CUSTOM'
            and (
              public.user_has_permission('roles.edit')
              or public.user_has_permission('roles.create')
            )
          )
        )
    )
  );
