-- ============================================================
-- CRITICAL: Prevent RBAC privilege escalation via role management
-- Invariant (non-Super-Admin):
--   permissions being granted / roles being assigned
--   ⊆ actor's effective permissions
-- ============================================================

create or replace function public.actor_can_delegate_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      nullif(trim(p_code), '') is not null
      and public.user_has_permission(p_code)
    );
$$;

comment on function public.actor_can_delegate_permission(text) is
  'True when the caller is Super Admin or already holds the permission (delegable set = effective permissions).';

create or replace function public.actor_can_delegate_permission_id(p_permission_id uuid)
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
      from public.permissions p
      where p.id = p_permission_id
        and public.user_has_permission(p.code)
    );
$$;

create or replace function public.actor_can_delegate_role(p_role_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if public.is_super_admin() then
    return true;
  end if;
  if p_role_id is null then
    return false;
  end if;

  for v_code in
    select p.code
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = p_role_id
  loop
    if not public.user_has_permission(v_code) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.actor_can_delegate_role(uuid) is
  'True when every permission on the role is held by the caller (or caller is Super Admin).';

revoke all on function public.actor_can_delegate_permission(text) from public;
revoke all on function public.actor_can_delegate_permission_id(uuid) from public;
revoke all on function public.actor_can_delegate_role(uuid) from public;
grant execute on function public.actor_can_delegate_permission(text) to authenticated, service_role;
grant execute on function public.actor_can_delegate_permission_id(uuid) to authenticated, service_role;
grant execute on function public.actor_can_delegate_role(uuid) to authenticated, service_role;

-- ── role_permissions: cannot grant what you do not hold ──────

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
            and public.actor_can_delegate_permission_id(role_permissions.permission_id)
          )
        )
    )
  );

-- DELETE does not escalate; keep existing CUSTOM + roles.edit/create gate.
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

-- ── user_permissions: same subset rule for direct grants ─────

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
        and public.actor_can_delegate_permission_id(user_permissions.permission_id)
      )
    )
  );

-- ── user_roles direct insert: role must be fully delegable ───

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
  and (
    public.is_super_admin()
    or public.actor_can_delegate_role(user_roles.role_id)
  )
);

-- ── SECURITY DEFINER role assignment RPCs (bypass RLS) ───────

create or replace function internal.replace_user_role(
  p_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path to internal, public
as $$
declare
  v_company_id uuid;
  v_existing_count integer;
begin
  if p_user_id is null or p_role_id is null then
    raise exception 'user_id and role_id are required';
  end if;

  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  if auth.role() <> 'service_role' then
    if not public.user_has_permission('users.edit') then
      raise exception 'Forbidden';
    end if;
  end if;

  select p.company_id
  into v_company_id
  from public.profiles p
  where p.id = p_user_id;

  if v_company_id is null then
    raise exception 'Target user has no company assignment';
  end if;

  if auth.role() <> 'service_role' then
    if not public.is_super_admin()
       and public.current_company_id() is distinct from v_company_id then
      raise exception 'Cross tenant access denied';
    end if;
  end if;

  if not exists (
    select 1
    from public.roles r
    where r.id = p_role_id
      and r.company_id = v_company_id
      and r.role_type in ('DEFAULT', 'CUSTOM')
  ) then
    raise exception 'Role is not assignable to the user company';
  end if;

  if auth.role() <> 'service_role' and not public.is_super_admin() then
    if not public.actor_can_delegate_role(p_role_id) then
      raise exception 'role_delegation_denied';
    end if;
  end if;

  select count(*)::integer
  into v_existing_count
  from public.user_roles ur
  where ur.user_id = p_user_id;

  if v_existing_count = 1
     and exists (
       select 1
       from public.user_roles ur
       where ur.user_id = p_user_id
         and ur.role_id = p_role_id
     ) then
    return;
  end if;

  delete from public.user_roles
  where user_id = p_user_id;

  insert into public.user_roles (user_id, role_id)
  values (p_user_id, p_role_id);
end;
$$;

create or replace function internal.replace_user_roles(
  p_user_id uuid,
  p_role_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path to internal, public
as $$
declare
  v_company_id uuid;
  v_role_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  if auth.role() <> 'service_role' then
    if not public.user_has_permission('users.edit') then
      raise exception 'Forbidden';
    end if;
  end if;

  select p.company_id
  into v_company_id
  from public.profiles p
  where p.id = p_user_id;

  if v_company_id is null then
    raise exception 'Target user has no company assignment';
  end if;

  if auth.role() <> 'service_role' then
    if not public.is_super_admin()
       and public.current_company_id() is distinct from v_company_id then
      raise exception 'Cross tenant access denied';
    end if;
  end if;

  if p_role_ids is not null then
    foreach v_role_id in array p_role_ids loop
      if not exists (
        select 1
        from public.roles r
        where r.id = v_role_id
          and r.company_id = v_company_id
          and r.role_type in ('DEFAULT', 'CUSTOM')
      ) then
        raise exception 'Role % is not assignable to the user company', v_role_id;
      end if;

      if auth.role() <> 'service_role' and not public.is_super_admin() then
        if not public.actor_can_delegate_role(v_role_id) then
          raise exception 'role_delegation_denied';
        end if;
      end if;
    end loop;
  end if;

  delete from public.user_roles
  where user_id = p_user_id;

  if p_role_ids is not null and array_length(p_role_ids, 1) > 0 then
    insert into public.user_roles (user_id, role_id)
    select p_user_id, unnest(p_role_ids);
  end if;
end;
$$;

-- Keep public wrappers (from migration 289) pointing at internal bodies.
create or replace function public.replace_user_role(p_user_id uuid, p_role_id uuid)
returns void
language sql
security definer
set search_path to public, internal
as $w$ select from internal.replace_user_role(p_user_id, p_role_id); $w$;

create or replace function public.replace_user_roles(p_user_id uuid, p_role_ids uuid[])
returns void
language sql
security definer
set search_path to public, internal
as $w$ select from internal.replace_user_roles(p_user_id, p_role_ids); $w$;

revoke all on function public.replace_user_role(uuid, uuid) from public;
revoke all on function internal.replace_user_role(uuid, uuid) from public;
revoke all on function public.replace_user_roles(uuid, uuid[]) from public;
revoke all on function internal.replace_user_roles(uuid, uuid[]) from public;
grant execute on function public.replace_user_role(uuid, uuid) to authenticated, service_role;
grant execute on function internal.replace_user_role(uuid, uuid) to authenticated, service_role;
grant execute on function public.replace_user_roles(uuid, uuid[]) to authenticated, service_role;
grant execute on function internal.replace_user_roles(uuid, uuid[]) to authenticated, service_role;

comment on function public.replace_user_role(uuid, uuid) is
  'Atomically replaces a user role. Non-Super-Admins may only assign roles whose permissions are a subset of their own.';
comment on function public.replace_user_roles(uuid, uuid[]) is
  'Atomically replaces all user roles. Non-Super-Admins may only assign roles whose permissions are a subset of their own.';
