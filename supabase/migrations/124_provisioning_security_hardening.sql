-- ============================================================
-- Vault OS – Provisioning security hardening (post-123)
-- P1: Lock down provisioning SECURITY DEFINER RPCs
-- P2: Enforce at least one active Company Admin per tenant
-- P3: role_permissions RLS uses role_type (not is_system)
-- P4: Audit / safe-resolve duplicate Admin vs Company Admin
-- ============================================================

-- ── P1: Trusted caller gate ─────────────────────────────────

create or replace function public.assert_trusted_provisioning_caller()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return;
  end if;

  if coalesce(current_setting('vault.provisioning_bootstrap', true), '') = 'true' then
    return;
  end if;

  if public.is_super_admin() then
    return;
  end if;

  raise exception 'forbidden';
end;
$$;

revoke all on function public.assert_trusted_provisioning_caller() from public;

-- ── P2 helpers: Company Admin identity ──────────────────────

create or replace function public.is_company_admin_role(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.roles r
    where r.id = p_role_id
      and r.company_id is not null
      and r.role_type = 'DEFAULT'
      and r.template_key = 'admin'
  );
$$;

create or replace function public.count_active_company_admin_assignees(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct p.id)::integer
  from public.profiles p
  inner join public.user_roles ur on ur.user_id = p.id
  inner join public.roles r on r.id = ur.role_id
  where p.company_id = p_company_id
    and p.is_active = true
    and p.is_super_admin = false
    and r.company_id = p_company_id
    and r.role_type = 'DEFAULT'
    and r.template_key = 'admin';
$$;

create or replace function public.assert_tenant_retains_active_company_admin(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_users integer;
  v_admin_assignees integer;
begin
  if p_company_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and coalesce(c.company_type, 'tenant') in ('platform', 'demo')
  ) then
    return;
  end if;

  select count(*)::integer
  into v_active_users
  from public.profiles p
  where p.company_id = p_company_id
    and p.is_active = true
    and p.is_super_admin = false;

  if v_active_users = 0 then
    return;
  end if;

  v_admin_assignees := public.count_active_company_admin_assignees(p_company_id);

  if v_admin_assignees < 1 then
    raise exception 'Tenant must retain at least one active Company Administrator';
  end if;
end;
$$;

create or replace function public.trg_assert_tenant_company_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if tg_op = 'DELETE' then
    select p.company_id into v_company_id
    from public.profiles p
    where p.id = old.user_id;
  else
    select p.company_id into v_company_id
    from public.profiles p
    where p.id = new.user_id;
  end if;

  perform public.assert_tenant_retains_active_company_admin(v_company_id);

  return null;
end;
$$;

create or replace function public.trg_profiles_assert_company_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_super_admin, false) then
    return new;
  end if;

  if old.company_id is not null
     and old.is_active = true
     and (new.is_active = false or new.company_id is distinct from old.company_id)
     and exists (
       select 1
       from public.companies c
       where c.id = old.company_id
         and coalesce(c.company_type, 'tenant') not in ('platform', 'demo')
     ) then
    perform public.assert_tenant_retains_active_company_admin(old.company_id);
  end if;

  return new;
end;
$$;

drop trigger if exists user_roles_enforce_company_admin on public.user_roles;
create constraint trigger user_roles_enforce_company_admin
after insert or delete or update on public.user_roles
deferrable initially deferred
for each row
execute function public.trg_assert_tenant_company_admin();

drop trigger if exists profiles_enforce_company_admin on public.profiles;
create trigger profiles_enforce_company_admin
before update of is_active, company_id on public.profiles
for each row
execute function public.trg_profiles_assert_company_admin();

-- ── P1: Secure provisioning functions ───────────────────────

create or replace function public.provision_tenant_default_roles(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_role_id uuid;
  v_created integer := 0;
  v_repaired integer := 0;
  v_role_ids uuid[] := '{}'::uuid[];
begin
  perform public.assert_trusted_provisioning_caller();

  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and coalesce(c.company_type, 'tenant') not in ('platform', 'demo')
  ) then
    raise exception 'company % is not a provisionable tenant', p_company_id;
  end if;

  perform set_config('vault.disable_role_notifications', 'true', true);

  begin
    for v_template in
      select t.template_key, t.name, t.description
      from public.platform_role_templates t
      where t.template_scope = 'tenant'
      order by t.sort_order, t.name
    loop
      select r.id
      into v_role_id
      from public.roles r
      where r.company_id = p_company_id
        and r.template_key = v_template.template_key
      limit 1;

      if v_role_id is null then
        select r.id
        into v_role_id
        from public.roles r
        where r.company_id = p_company_id
          and r.template_key is null
          and r.role_type = 'CUSTOM'
          and (
            (v_template.template_key = 'admin' and r.name in ('Admin', 'Company Admin'))
            or (v_template.template_key = 'manager' and r.name = 'Manager')
            or (v_template.template_key = 'employee' and r.name = 'Employee')
          )
          and not exists (
            select 1
            from public.roles existing
            where existing.company_id = p_company_id
              and existing.template_key = v_template.template_key
          )
        limit 1;

        if v_role_id is not null then
          update public.roles
          set role_type = 'DEFAULT',
              template_key = v_template.template_key,
              name = v_template.name,
              description = v_template.description
          where id = v_role_id;
          v_repaired := v_repaired + 1;
        else
          insert into public.roles (
            company_id,
            name,
            description,
            is_system,
            role_type,
            template_key
          )
          values (
            p_company_id,
            v_template.name,
            v_template.description,
            false,
            'DEFAULT',
            v_template.template_key
          )
          returning id into v_role_id;

          v_created := v_created + 1;
        end if;
      else
        update public.roles
        set role_type = 'DEFAULT',
            name = v_template.name,
            description = v_template.description
        where id = v_role_id
          and (
            role_type is distinct from 'DEFAULT'
            or name is distinct from v_template.name
          );

        if found then
          v_repaired := v_repaired + 1;
        end if;
      end if;

      insert into public.role_permissions (role_id, permission_id)
      select v_role_id, p.id
      from public.platform_role_template_permissions tp
      inner join public.permissions p on p.code = tp.permission_code
      where tp.template_key = v_template.template_key
      on conflict do nothing;

      v_role_ids := array_append(v_role_ids, v_role_id);
    end loop;
  exception
    when others then
      perform set_config('vault.disable_role_notifications', 'false', true);
      raise;
  end;

  perform set_config('vault.disable_role_notifications', 'false', true);

  if (
    select count(distinct r.template_key)
    from public.roles r
    where r.company_id = p_company_id
      and r.role_type = 'DEFAULT'
      and r.template_key in ('admin', 'manager', 'employee')
  ) <> 3 then
    raise exception 'failed to ensure default tenant roles for company %', p_company_id;
  end if;

  return jsonb_build_object(
    'company_id', p_company_id,
    'created', v_created,
    'repaired', v_repaired,
    'role_ids', to_jsonb(v_role_ids)
  );
end;
$$;

create or replace function public.execute_tenant_provisioning(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_roles jsonb;
  v_error text;
begin
  perform public.assert_trusted_provisioning_caller();

  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  select *
  into v_company
  from public.companies c
  where c.id = p_company_id
  for update;

  if not found then
    raise exception 'company % not found', p_company_id;
  end if;

  if coalesce(v_company.company_type, 'tenant') in ('platform', 'demo') then
    update public.companies
    set tenant_provisioning_status = 'completed',
        provisioned_at = coalesce(provisioned_at, now()),
        provisioning_error = null
    where id = p_company_id;

    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'completed',
      'skipped', true,
      'reason', 'non_tenant_company'
    );
  end if;

  if v_company.tenant_provisioning_status = 'completed'
     and (
       select count(distinct r.template_key)
       from public.roles r
       where r.company_id = p_company_id
         and r.role_type = 'DEFAULT'
         and r.template_key in ('admin', 'manager', 'employee')
     ) = 3 then
    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'completed',
      'skipped', true,
      'reason', 'already_provisioned'
    );
  end if;

  if v_company.tenant_provisioning_status = 'provisioning' then
    raise exception 'company % provisioning already in progress', p_company_id;
  end if;

  update public.companies
  set tenant_provisioning_status = 'provisioning',
      provisioning_attempt_count = provisioning_attempt_count + 1,
      provisioning_error = null
  where id = p_company_id;

  begin
    v_roles := public.provision_tenant_default_roles(p_company_id);

    update public.companies
    set tenant_provisioning_status = 'completed',
        provisioned_at = now(),
        provisioning_error = null
    where id = p_company_id;

    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'completed',
      'roles', v_roles
    );
  exception
    when others then
      get stacked diagnostics v_error = message_text;
      update public.companies
      set tenant_provisioning_status = 'failed',
          provisioning_error = v_error
      where id = p_company_id;
      raise;
  end;
end;
$$;

create or replace function public.provision_company_default_roles(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_trusted_provisioning_caller();
  return public.provision_tenant_default_roles(p_company_id);
end;
$$;

create or replace function public.retry_tenant_provisioning(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  perform public.assert_trusted_provisioning_caller();

  select c.tenant_provisioning_status
  into v_status
  from public.companies c
  where c.id = p_company_id;

  if not found then
    raise exception 'company % not found', p_company_id;
  end if;

  if v_status not in ('failed', 'pending') then
    raise exception 'company % is not eligible for retry (status=%)', p_company_id, v_status;
  end if;

  return public.execute_tenant_provisioning(p_company_id);
end;
$$;

create or replace function public.repair_companies_missing_roles()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_repaired integer := 0;
begin
  perform public.assert_trusted_provisioning_caller();

  for v_company in
    select c.id, c.name
    from public.companies c
    where coalesce(c.company_type, 'tenant') not in ('platform', 'demo')
      and (
        select count(distinct r.template_key)
        from public.roles r
        where r.company_id = c.id
          and r.role_type = 'DEFAULT'
          and r.template_key in ('admin', 'manager', 'employee')
      ) < 3
    order by c.created_at
  loop
    begin
      v_result := public.execute_tenant_provisioning(v_company.id);
    exception
      when others then
        v_result := jsonb_build_object(
          'company_id', v_company.id,
          'status', 'failed',
          'error', sqlerrm
        );
    end;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'company_id', v_company.id,
        'company_name', v_company.name,
        'result', v_result
      )
    );
    v_repaired := v_repaired + 1;
  end loop;

  return jsonb_build_object(
    'repaired', v_repaired,
    'companies', v_results
  );
end;
$$;

-- Revoke direct client access to internal provisioning entrypoints
revoke all on function public.provision_tenant_default_roles(uuid) from public;
revoke all on function public.execute_tenant_provisioning(uuid) from public;
revoke all on function public.provision_company_default_roles(uuid) from public;

grant execute on function public.provision_tenant_default_roles(uuid) to service_role;
grant execute on function public.execute_tenant_provisioning(uuid) to service_role;
grant execute on function public.provision_company_default_roles(uuid) to service_role;

grant execute on function public.retry_tenant_provisioning(uuid) to authenticated;
grant execute on function public.repair_companies_missing_roles() to authenticated;

-- ── P3: role_permissions RLS aligned with role_type ─────────

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
            public.user_has_permission('roles.edit')
            and r.company_id = public.current_company_id()
            and r.role_type = 'CUSTOM'
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
            public.user_has_permission('roles.edit')
            and r.company_id = public.current_company_id()
            and r.role_type = 'CUSTOM'
          )
        )
    )
  );

-- Super admin may edit DEFAULT / PLATFORM role permissions via roles + role_permissions paths
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
        and role_type = 'CUSTOM'
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
        and role_type = 'CUSTOM'
      )
    )
  );

-- ── P4: Duplicate admin semantics audit ─────────────────────

create table if not exists public.tenant_admin_role_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  issue_code text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, issue_code)
);

comment on table public.tenant_admin_role_audit is
  'Flags duplicate or ambiguous Company Admin role semantics per tenant. Does not move users or delete roles automatically.';

revoke all on table public.tenant_admin_role_audit from public;
grant select on table public.tenant_admin_role_audit to authenticated;

create or replace function public.audit_tenant_duplicate_admin_roles()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company record;
  v_default_admin_id uuid;
  v_legacy_admin_ids uuid[];
  v_flagged integer := 0;
  v_resolved integer := 0;
begin
  perform public.assert_trusted_provisioning_caller();

  for v_company in
    select c.id, c.name
    from public.companies c
    where coalesce(c.company_type, 'tenant') not in ('platform', 'demo')
  loop
    select r.id
    into v_default_admin_id
    from public.roles r
    where r.company_id = v_company.id
      and r.role_type = 'DEFAULT'
      and r.template_key = 'admin'
    limit 1;

    select coalesce(array_agg(r.id), '{}'::uuid[])
    into v_legacy_admin_ids
    from public.roles r
    where r.company_id = v_company.id
      and r.id is distinct from v_default_admin_id
      and (
        (r.name in ('Admin', 'Company Admin') and r.template_key is null)
        or (r.name = 'Admin' and r.role_type = 'CUSTOM')
      );

    if v_default_admin_id is null
       and coalesce(cardinality(v_legacy_admin_ids), 0) = 1 then
      update public.roles
      set role_type = 'DEFAULT',
          template_key = 'admin',
          name = 'Company Admin',
          description = 'Company administrator with full workspace access'
      where id = v_legacy_admin_ids[1];

      insert into public.tenant_admin_role_audit (company_id, issue_code, details, resolved_at)
      values (
        v_company.id,
        'legacy_admin_promoted',
        jsonb_build_object(
          'role_id', v_legacy_admin_ids[1],
          'action', 'promoted_legacy_admin_to_default_template'
        ),
        now()
      )
      on conflict (company_id, issue_code) do update
      set details = excluded.details,
          resolved_at = excluded.resolved_at;

      v_resolved := v_resolved + 1;
      continue;
    end if;

    if coalesce(cardinality(v_legacy_admin_ids), 0) > 0
       and v_default_admin_id is not null then
      insert into public.tenant_admin_role_audit (company_id, issue_code, details)
      values (
        v_company.id,
        'duplicate_admin_semantics',
        jsonb_build_object(
          'default_company_admin_role_id', v_default_admin_id,
          'legacy_admin_role_ids', to_jsonb(v_legacy_admin_ids),
          'action', 'manual_review_required'
        )
      )
      on conflict (company_id, issue_code) do update
      set details = excluded.details,
          resolved_at = null;

      v_flagged := v_flagged + 1;
    else
      delete from public.tenant_admin_role_audit
      where company_id = v_company.id
        and issue_code = 'duplicate_admin_semantics';
    end if;
  end loop;

  return jsonb_build_object(
    'flagged', v_flagged,
    'resolved', v_resolved
  );
end;
$$;

revoke all on function public.audit_tenant_duplicate_admin_roles() from public;
grant execute on function public.audit_tenant_duplicate_admin_roles() to service_role;
grant execute on function public.audit_tenant_duplicate_admin_roles() to authenticated;

-- Bootstrap repair + duplicate admin audit (migration-safe: no JWT required)
do $$
begin
  perform set_config('vault.provisioning_bootstrap', 'true', true);
  perform public.repair_companies_missing_roles();
  perform public.audit_tenant_duplicate_admin_roles();
  perform set_config('vault.provisioning_bootstrap', 'false', true);
end;
$$;
