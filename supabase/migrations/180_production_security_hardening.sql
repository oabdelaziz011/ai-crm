-- Sprint P4: restore tenant isolation on user_permissions mutations (113 regression)

drop policy if exists user_permissions_insert_policy on public.user_permissions;
create policy user_permissions_insert_policy on public.user_permissions
  for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.user_has_permission('roles.edit')
        and exists (
          select 1
          from public.profiles p
          where (p.id = user_permissions.user_id or p.user_id = user_permissions.user_id)
            and p.company_id = public.current_company_id()
        )
      )
    )
  );

drop policy if exists user_permissions_delete_policy on public.user_permissions;
create policy user_permissions_delete_policy on public.user_permissions
  for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.user_has_permission('roles.edit')
        and exists (
          select 1
          from public.profiles p
          where (p.id = user_permissions.user_id or p.user_id = user_permissions.user_id)
            and p.company_id = public.current_company_id()
        )
      )
    )
  );

comment on policy user_permissions_insert_policy on public.user_permissions is
  'Tenant-scoped permission grants — target user must belong to current company.';
comment on policy user_permissions_delete_policy on public.user_permissions is
  'Tenant-scoped permission revokes — target user must belong to current company.';
