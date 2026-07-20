-- ============================================================
-- Vault OS – RBAC tenant isolation (RLS hardening)
-- Removes orphan dashboard policies and tightens roles SELECT
-- so platform roles (company_id IS NULL) are super-admin only.
-- ============================================================

-- ── 1. Drop orphan policies (not defined in repo migrations) ─

drop policy if exists "Users can read roles" on public.roles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can read own user_roles" on public.user_roles;
drop policy if exists "Users can read their own roles" on public.user_roles;

-- ── 2. Tighten roles_select_policy ──────────────────────────

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
    )
  );

comment on policy roles_select_policy on public.roles is
  'Tenant admins: tenant-local roles only (roles.view + current_company_id). Platform Super Admin: all roles including company_id IS NULL platform catalog.';

-- ── 3. Align role_permissions SELECT with same platform boundary ─

drop policy if exists role_permissions_select_policy on public.role_permissions;
create policy role_permissions_select_policy
  on public.role_permissions for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.roles r
      where r.id = role_permissions.role_id
        and (
          public.is_super_admin()
          or r.company_id = public.current_company_id()
        )
    )
  );

comment on policy role_permissions_select_policy on public.role_permissions is
  'Mirrors roles_select_policy: platform role permissions visible only to Platform Super Admin.';
