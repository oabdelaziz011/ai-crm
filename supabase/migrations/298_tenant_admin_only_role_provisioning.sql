-- ============================================================
-- 298 — Tenant roles: provision Company Admin only
--
-- Product model: new companies must NOT auto-create Manager /
-- Employee as mandatory DEFAULT roles. The owner/Company Admin
-- remains the required initial authorization mechanism; custom
-- roles are created by the company afterward.
--
-- Safety:
-- - Does NOT delete existing Manager/Employee/Admin roles
-- - Does NOT modify user_roles or role IDs
-- - Does NOT touch migration 297 delegation guards
-- - platform_role_templates for manager/employee remain for
--   historical backfills; they are simply not auto-provisioned
-- ============================================================

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
    -- Only the company-scoped Company Admin DEFAULT role is mandatory.
    for v_template in
      select t.template_key, t.name, t.description
      from public.platform_role_templates t
      where t.template_scope = 'tenant'
        and t.template_key = 'admin'
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
          and r.name in ('Admin', 'Company Admin')
          and not exists (
            select 1
            from public.roles existing
            where existing.company_id = p_company_id
              and existing.template_key = 'admin'
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

  if not exists (
    select 1
    from public.roles r
    where r.company_id = p_company_id
      and r.role_type = 'DEFAULT'
      and r.template_key = 'admin'
  ) then
    raise exception 'failed to ensure Company Admin role for company %', p_company_id;
  end if;

  return jsonb_build_object(
    'company_id', p_company_id,
    'created', v_created,
    'repaired', v_repaired,
    'role_ids', to_jsonb(v_role_ids)
  );
end;
$$;

comment on function public.provision_tenant_default_roles(uuid) is
  'Provisions the company-scoped Company Admin DEFAULT role only. Manager/Employee are not auto-created; tenants create CUSTOM roles as needed.';

-- Skip/complete when Company Admin exists (do not require Manager/Employee).
create or replace function public.execute_tenant_provisioning(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_roles jsonb;
  v_ai jsonb;
  v_error text;
  v_has_admin boolean;
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

  select exists (
    select 1
    from public.roles r
    where r.company_id = p_company_id
      and r.role_type = 'DEFAULT'
      and r.template_key = 'admin'
  )
  into v_has_admin;

  if v_company.tenant_provisioning_status = 'completed' and v_has_admin then
    v_ai := public.provision_tenant_ai_bootstrap(p_company_id);
    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'completed',
      'skipped', true,
      'reason', 'already_provisioned',
      'ai_bootstrap', v_ai
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
    v_ai := public.provision_tenant_ai_bootstrap(p_company_id);

    update public.companies
    set tenant_provisioning_status = 'completed',
        provisioned_at = now(),
        provisioning_error = null
    where id = p_company_id;

    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'completed',
      'roles', v_roles,
      'ai_bootstrap', v_ai
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

-- Repair only companies missing Company Admin (do not force Manager/Employee).
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
      and not exists (
        select 1
        from public.roles r
        where r.company_id = c.id
          and r.role_type = 'DEFAULT'
          and r.template_key = 'admin'
      )
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
