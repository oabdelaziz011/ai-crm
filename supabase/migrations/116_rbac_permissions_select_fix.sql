-- Fix permissions SELECT RLS broken by migration 113.
-- AuthContext loads permission codes at login via SELECT on public.permissions.
-- Gating that table behind roles.view left non-admin users with an empty
-- permissions array while user_has_permission() RPC still worked server-side.

drop policy if exists permissions_select_policy on public.permissions;
create policy permissions_select_policy on public.permissions for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('roles.view')
    or exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = auth.uid()
        and rp.permission_id = permissions.id
    )
    or exists (
      select 1
      from public.user_permissions up
      where up.user_id = auth.uid()
        and up.permission_id = permissions.id
    )
  )
);
