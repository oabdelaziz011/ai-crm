-- ============================================================
-- Vault OS – RBAC enforcement reconciliation
-- Align RLS with permission codes (audit_logs, channels)
-- ============================================================

-- Audit logs: require audit_logs.view (not merely company admin role name)
drop policy if exists audit_logs_select_policy on public.audit_logs;
create policy audit_logs_select_policy
  on public.audit_logs for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        public.user_has_permission('audit_logs.view')
        and company_id = public.current_company_id()
      )
      or (
        public.user_has_permission('audit_logs.view')
        and company_id is null
      )
    )
  );

-- Company channels: require channels.view / channels.manage
drop policy if exists company_channels_select on public.company_channels;
create policy company_channels_select
  on public.company_channels for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('channels.view')
      )
    )
  );

drop policy if exists company_channels_insert on public.company_channels;
create policy company_channels_insert
  on public.company_channels for insert
  with check (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('channels.manage')
      )
    )
  );

drop policy if exists company_channels_update on public.company_channels;
create policy company_channels_update
  on public.company_channels for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('channels.manage')
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('channels.manage')
      )
    )
  );

-- Profiles admin access: require users.view / users.edit (not role-name checks)
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select
  on public.profiles for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('users.view')
      )
    )
  );

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
  on public.profiles for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('users.edit')
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('users.edit')
        and is_super_admin = false
      )
    )
  );

-- Roles: align mutations with roles.* permission codes
drop policy if exists roles_select_policy on public.roles;
create policy roles_select_policy
  on public.roles for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('roles.view')
      )
      or company_id is null
    )
  );

drop policy if exists roles_insert_policy on public.roles;
create policy roles_insert_policy
  on public.roles for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('roles.create')
      )
    )
  );

drop policy if exists roles_update_policy on public.roles;
create policy roles_update_policy
  on public.roles for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('roles.edit')
        and is_system = false
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('roles.edit')
        and is_system = false
      )
    )
  );

drop policy if exists roles_delete_policy on public.roles;
create policy roles_delete_policy
  on public.roles for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('roles.delete')
        and is_system = false
      )
    )
  );
