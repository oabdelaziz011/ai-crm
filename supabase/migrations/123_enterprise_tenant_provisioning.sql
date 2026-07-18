-- ============================================================
-- Vault OS – Enterprise tenant provisioning architecture
-- - role_type: PLATFORM | DEFAULT | CUSTOM (separate from is_system)
-- - Tenant provisioning lifecycle: pending → provisioning → completed | failed
-- - Platform Super Admin role (platform scope) vs tenant default roles
-- - Removes assignable role catalog alias (122 workaround)
-- ============================================================

-- ── 1. Revert role catalog alias workaround ─────────────────

drop function if exists public.get_assignable_roles(uuid);

drop table if exists public.company_assignable_role_catalog;

-- ── 2. Template scope (platform vs tenant) ──────────────────

alter table public.platform_role_templates
  add column if not exists template_scope text not null default 'tenant';

alter table public.platform_role_templates
  drop constraint if exists platform_role_templates_scope_check;

alter table public.platform_role_templates
  add constraint platform_role_templates_scope_check
  check (template_scope in ('tenant', 'platform'));

update public.platform_role_templates
set template_scope = 'tenant'
where template_scope is null
   or template_scope not in ('tenant', 'platform');

update public.platform_role_templates
set name = 'Company Admin',
    description = 'Company administrator with full workspace access'
where template_key = 'admin';

insert into public.platform_role_templates (template_key, name, description, sort_order, template_scope)
values (
  'platform_super_admin',
  'Platform Super Admin',
  'VaultOS platform operator with cross-tenant administration access',
  0,
  'platform'
)
on conflict (template_key) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    template_scope = excluded.template_scope;

-- Platform operator permission bundle (existing permission codes only)
delete from public.platform_role_template_permissions
where template_key = 'platform_super_admin';

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('platform_super_admin', 'companies.view'),
    ('platform_super_admin', 'companies.create'),
    ('platform_super_admin', 'companies.edit'),
    ('platform_super_admin', 'companies.delete'),
    ('platform_super_admin', 'subscriptions.view'),
    ('platform_super_admin', 'subscriptions.edit'),
    ('platform_super_admin', 'audit_logs.view'),
    ('platform_super_admin', 'users.view'),
    ('platform_super_admin', 'users.edit'),
    ('platform_super_admin', 'roles.view'),
    ('platform_super_admin', 'roles.create'),
    ('platform_super_admin', 'roles.edit'),
    ('platform_super_admin', 'roles.delete'),
    ('platform_super_admin', 'billing.view'),
    ('platform_super_admin', 'billing.edit'),
    ('platform_super_admin', 'billing.manage_plans'),
    ('platform_super_admin', 'billing.settings.view'),
    ('platform_super_admin', 'billing.settings.edit'),
    ('platform_super_admin', 'billing.audit.view'),
    ('platform_super_admin', 'billing.features.view'),
    ('platform_super_admin', 'billing.features.edit'),
    ('platform_super_admin', 'billing.view_reports'),
    ('platform_super_admin', 'billing.health.view'),
    ('platform_super_admin', 'billing.webhooks.view'),
    ('platform_super_admin', 'billing.webhooks.manage'),
    ('platform_super_admin', 'settings.view'),
    ('platform_super_admin', 'settings.edit')
) as v(template_key, permission_code)
where exists (
  select 1
  from public.permissions p
  where p.code = v.permission_code
)
on conflict (template_key, permission_code) do nothing;

-- ── 3. Role typing ──────────────────────────────────────────

alter table public.roles
  add column if not exists role_type text not null default 'CUSTOM',
  add column if not exists template_key text references public.platform_role_templates (template_key);

alter table public.roles
  drop constraint if exists roles_role_type_check;

alter table public.roles
  add constraint roles_role_type_check
  check (role_type in ('PLATFORM', 'DEFAULT', 'CUSTOM'));

alter table public.roles
  drop constraint if exists roles_platform_shape_check;

alter table public.roles
  add constraint roles_platform_shape_check
  check (
    (role_type = 'PLATFORM' and company_id is null and template_key is not null)
    or (role_type = 'DEFAULT' and company_id is not null and template_key is not null)
    or (role_type = 'CUSTOM' and template_key is null)
  );

create unique index if not exists idx_roles_company_template_key
  on public.roles (company_id, template_key)
  where template_key is not null and company_id is not null;

create unique index if not exists idx_roles_platform_template_key
  on public.roles (template_key)
  where role_type = 'PLATFORM';

-- Legacy backfill: infer DEFAULT roles from template names; everything else stays CUSTOM
update public.roles r
set role_type = 'DEFAULT',
    template_key = v.template_key
from (
  values
    ('admin', 'Admin'),
    ('admin', 'Company Admin'),
    ('manager', 'Manager'),
    ('employee', 'Employee')
) as v(template_key, role_name)
where r.company_id is not null
  and r.name = v.role_name
  and r.role_type = 'CUSTOM'
  and r.template_key is null
  and not exists (
    select 1
    from public.roles existing
    where existing.company_id = r.company_id
      and existing.template_key = v.template_key
      and existing.id <> r.id
  );

-- ── 4. Tenant provisioning lifecycle on companies ───────────

alter table public.companies
  add column if not exists tenant_provisioning_status text not null default 'pending',
  add column if not exists provisioning_error text,
  add column if not exists provisioned_at timestamptz,
  add column if not exists provisioning_attempt_count integer not null default 0;

alter table public.companies
  drop constraint if exists companies_tenant_provisioning_status_check;

alter table public.companies
  add constraint companies_tenant_provisioning_status_check
  check (tenant_provisioning_status in ('pending', 'provisioning', 'completed', 'failed'));

-- Platform owner company label (no deletion / merge)
update public.companies
set company_type = 'platform'
where id = '2d27f7fb-c15e-4d60-84e9-1793f36f2172'::uuid
  and coalesce(company_type, '') not in ('demo', 'platform');

update public.companies
set tenant_provisioning_status = 'completed',
    provisioned_at = coalesce(provisioned_at, now())
where coalesce(company_type, '') in ('platform', 'demo');

-- Tenant companies that already have all default template roles
update public.companies c
set tenant_provisioning_status = 'completed',
    provisioned_at = coalesce(c.provisioned_at, now()),
    provisioning_error = null
where coalesce(c.company_type, 'tenant') not in ('platform', 'demo')
  and (
    select count(distinct r.template_key)
    from public.roles r
    where r.company_id = c.id
      and r.role_type = 'DEFAULT'
      and r.template_key in ('admin', 'manager', 'employee')
  ) = 3;

-- Tenant companies missing defaults → failed (repairable via retry RPC)
update public.companies c
set tenant_provisioning_status = 'failed',
    provisioning_error = coalesce(
      c.provisioning_error,
      'Missing one or more default tenant roles (Company Admin, Manager, Employee)'
    )
where coalesce(c.company_type, 'tenant') not in ('platform', 'demo')
  and c.tenant_provisioning_status <> 'completed'
  and (
    select count(distinct r.template_key)
    from public.roles r
    where r.company_id = c.id
      and r.role_type = 'DEFAULT'
      and r.template_key in ('admin', 'manager', 'employee')
  ) < 3;

-- ── 5. Platform Super Admin role (singleton, not tenant-scoped) ─

insert into public.roles (company_id, name, description, is_system, role_type, template_key)
select
  null,
  t.name,
  t.description,
  false,
  'PLATFORM',
  t.template_key
from public.platform_role_templates t
where t.template_key = 'platform_super_admin'
  and not exists (
    select 1
    from public.roles r
    where r.role_type = 'PLATFORM'
      and r.template_key = 'platform_super_admin'
  );

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
inner join public.platform_role_template_permissions tp
  on tp.template_key = r.template_key
inner join public.permissions p
  on p.code = tp.permission_code
where r.role_type = 'PLATFORM'
  and r.template_key = 'platform_super_admin'
on conflict do nothing;

-- ── 6. Core provisioning functions ───────────────────────────

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

  if exists (
    select 1
    from unnest(v_role_ids) as role_id(id)
    inner join public.roles r on r.id = role_id.id
    where r.company_id is distinct from p_company_id
  ) then
    raise exception 'tenant role company_id invariant violated for company %', p_company_id;
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

create or replace function public.retry_tenant_provisioning(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

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

-- Backward-compatible name used by existing clients
create or replace function public.provision_company_default_roles(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.provision_tenant_default_roles(p_company_id);
end;
$$;

create or replace function public.trg_companies_execute_tenant_provisioning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.company_type, 'tenant') not in ('platform', 'demo') then
    perform public.execute_tenant_provisioning(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists companies_provision_default_roles on public.companies;
drop trigger if exists companies_execute_tenant_provisioning on public.companies;

create trigger companies_execute_tenant_provisioning
after insert on public.companies
for each row
execute function public.trg_companies_execute_tenant_provisioning();

create or replace function public.create_company_v1(
  p_name text,
  p_status text default 'Trial',
  p_subscription_plan text default 'Basic',
  p_subscription_expires_at timestamptz default null,
  p_logo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  insert into public.companies (
    name,
    status,
    subscription_plan,
    subscription_expires_at,
    logo_url,
    company_type,
    tenant_provisioning_status
  )
  values (
    p_name,
    coalesce(p_status, 'Trial'),
    coalesce(p_subscription_plan, 'Basic'),
    p_subscription_expires_at,
    p_logo_url,
    'tenant',
    'pending'
  )
  returning * into v_company;

  -- Trigger runs provisioning; call again idempotently for callers expecting synchronous result
  v_result := public.execute_tenant_provisioning(v_company.id);

  select * into v_company from public.companies where id = v_company.id;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'provisioning', v_result
  );
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
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

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

-- ── 7. Role protection policies (DEFAULT + PLATFORM immutable to tenants) ─

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
        and role_type = 'CUSTOM'
      )
    )
  );

-- ── 8. Assignable roles RPC (tenant-local catalog only) ─────

create or replace function public.get_assignable_roles(p_company_id uuid)
returns table (
  id uuid,
  name text,
  is_system boolean,
  role_type text
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
  select r.id, r.name, r.is_system, r.role_type
  from public.roles r
  where r.company_id = p_company_id
    and r.role_type in ('DEFAULT', 'CUSTOM')
  order by
    case r.role_type when 'DEFAULT' then 0 else 1 end,
    r.name asc nulls last;
end;
$$;

comment on function public.get_assignable_roles(uuid) is
  'Users-page assignable role catalog. Tenant-scoped DEFAULT + CUSTOM roles for p_company_id. Requires users.edit.';

revoke all on function public.get_assignable_roles(uuid) from public;
grant execute on function public.get_assignable_roles(uuid) to authenticated;

grant execute on function public.retry_tenant_provisioning(uuid) to authenticated;
grant execute on function public.create_company_v1(text, text, text, timestamptz, text) to authenticated;
grant execute on function public.repair_companies_missing_roles() to authenticated;

-- Provisioning internals + bootstrap repair: see 124_provisioning_security_hardening.sql
