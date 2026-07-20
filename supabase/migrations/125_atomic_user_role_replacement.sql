-- ============================================================
-- Vault OS – Atomic user role replacement
-- Fixes DELETE→INSERT split across PostgREST requests, which
-- commits the DELETE in its own transaction and fires migration
-- 124's deferrable user_roles_enforce_company_admin trigger
-- before the INSERT can run.
-- ============================================================

create or replace function public.replace_user_role(
  p_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
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

comment on function public.replace_user_role(uuid, uuid) is
  'Atomically replaces a user''s role assignments with a single tenant-local role. Runs DELETE+INSERT in one transaction so migration 124''s deferrable last-admin trigger evaluates the final state. Requires users.edit (or service_role).';

revoke all on function public.replace_user_role(uuid, uuid) from public;
grant execute on function public.replace_user_role(uuid, uuid) to authenticated;
grant execute on function public.replace_user_role(uuid, uuid) to service_role;

create or replace function public.replace_user_roles(
  p_user_id uuid,
  p_role_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
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

comment on function public.replace_user_roles(uuid, uuid[]) is
  'Atomically replaces all role assignments for a user. Empty array clears roles. Same transaction semantics as replace_user_role.';

revoke all on function public.replace_user_roles(uuid, uuid[]) from public;
grant execute on function public.replace_user_roles(uuid, uuid[]) to authenticated;
grant execute on function public.replace_user_roles(uuid, uuid[]) to service_role;
