-- ============================================================
-- 334 — Human Handoff Agent role template + tenant provisioning
--
-- Adds platform template `human_handoff_agent` ("Human Handoff Agent")
-- with minimum Omnichannel / handoff desk permissions (by permission
-- code). Extends provision_tenant_default_roles to create the company
-- DEFAULT role alongside Company Admin. Backfills existing tenants.
--
-- Safety:
-- - Does NOT insert new permissions (codes must already exist)
-- - Does NOT grant handoff.manage / handoff.queue / admin / platform
-- - Does NOT delete or rename existing Manager/Employee roles
-- - Does NOT modify user_roles assignments
-- - Idempotent: safe to re-run inserts / provisioning sync
-- ============================================================

-- ── 1. Platform template ─────────────────────────────────────

insert into public.platform_role_templates (
  template_key,
  name,
  description,
  sort_order,
  template_scope
)
values (
  'human_handoff_agent',
  'Human Handoff Agent',
  'Omnichannel human agent: presence, assignment, reply, and conversation lifecycle — without routing/admin configuration',
  4,
  'tenant'
)
on conflict (template_key) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    template_scope = excluded.template_scope;

-- ── 2. Template permissions (by code only) ───────────────────

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    -- Conversation (requested)
    ('human_handoff_agent', 'conversation.view'),
    ('human_handoff_agent', 'conversation.assign'),
    ('human_handoff_agent', 'conversation.reassign'),
    ('human_handoff_agent', 'conversation.take_over'),
    ('human_handoff_agent', 'conversation.return_to_ai'),
    ('human_handoff_agent', 'conversation.escalate'),
    ('human_handoff_agent', 'conversation.resolve'),
    ('human_handoff_agent', 'conversation.close'),
    -- Handoff (requested)
    ('human_handoff_agent', 'handoff.view'),
    ('human_handoff_agent', 'handoff.assign'),
    ('human_handoff_agent', 'handoff.accept'),
    ('human_handoff_agent', 'handoff.transfer'),
    ('human_handoff_agent', 'handoff.escalate'),
    ('human_handoff_agent', 'handoff.return_to_ai'),
    ('human_handoff_agent', 'handoff.presence'),
    -- Omnichannel / desk required
    ('human_handoff_agent', 'conversation.reply'),
    ('human_handoff_agent', 'ai.conversations.view'),
    ('human_handoff_agent', 'ai.conversations.reply'),
    ('human_handoff_agent', 'ai.conversations.takeover'),
    ('human_handoff_agent', 'ai.conversations.release'),
    ('human_handoff_agent', 'channels.view'),
    ('human_handoff_agent', 'customers.view'),
    -- Recommended desk
    ('human_handoff_agent', 'conversation.reopen'),
    ('human_handoff_agent', 'conversation.internal_note'),
    ('human_handoff_agent', 'conversation.link_customer'),
    ('human_handoff_agent', 'conversation.create_customer')
) as v(template_key, permission_code)
on conflict do nothing;

-- Fail closed if any required catalog code is missing (do not invent permissions).
do $$
declare
  v_missing text[];
begin
  select coalesce(array_agg(tp.permission_code order by tp.permission_code), '{}'::text[])
  into v_missing
  from public.platform_role_template_permissions tp
  left join public.permissions p on p.code = tp.permission_code
  where tp.template_key = 'human_handoff_agent'
    and p.id is null;

  if cardinality(v_missing) > 0 then
    raise exception
      'human_handoff_agent template references missing permission codes: %',
      array_to_string(v_missing, ', ');
  end if;

  if exists (
    select 1
    from public.platform_role_template_permissions tp
    where tp.template_key = 'human_handoff_agent'
      and tp.permission_code in (
        'handoff.manage',
        'handoff.queue',
        'channels.manage',
        'conversation.internal_notes.manage'
      )
  ) then
    raise exception 'human_handoff_agent must not include admin/routing configuration permissions';
  end if;
end;
$$;

-- ── 3. Provisioning: Admin + Human Handoff Agent ─────────────

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
    -- Company Admin remains mandatory; Human Handoff Agent is the desk DEFAULT role.
    -- Manager/Employee templates stay in catalog but are NOT auto-provisioned.
    for v_template in
      select t.template_key, t.name, t.description
      from public.platform_role_templates t
      where t.template_scope = 'tenant'
        and t.template_key in ('admin', 'human_handoff_agent')
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
            or (v_template.template_key = 'human_handoff_agent' and r.name = 'Human Handoff Agent')
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
            or description is distinct from v_template.description
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

  if not exists (
    select 1
    from public.roles r
    where r.company_id = p_company_id
      and r.role_type = 'DEFAULT'
      and r.template_key = 'human_handoff_agent'
  ) then
    raise exception 'failed to ensure Human Handoff Agent role for company %', p_company_id;
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
  'Provisions company-scoped DEFAULT roles: Company Admin and Human Handoff Agent. Manager/Employee are not auto-created; tenants may create additional CUSTOM roles as needed.';

-- When a tenant is already marked completed but is missing Human Handoff Agent,
-- sync DEFAULT roles instead of permanently skipping.
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
  v_has_handoff_agent boolean;
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

  select exists (
    select 1
    from public.roles r
    where r.company_id = p_company_id
      and r.role_type = 'DEFAULT'
      and r.template_key = 'human_handoff_agent'
  )
  into v_has_handoff_agent;

  if v_company.tenant_provisioning_status = 'completed' and v_has_admin and v_has_handoff_agent then
    v_ai := public.provision_tenant_ai_bootstrap(p_company_id);
    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'completed',
      'skipped', true,
      'reason', 'already_provisioned',
      'ai_bootstrap', v_ai
    );
  end if;

  if v_company.tenant_provisioning_status = 'completed' and v_has_admin and not v_has_handoff_agent then
    v_roles := public.provision_tenant_default_roles(p_company_id);
    v_ai := public.provision_tenant_ai_bootstrap(p_company_id);
    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'completed',
      'roles', v_roles,
      'ai_bootstrap', v_ai,
      'repaired_missing_default_roles', true
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

-- Repair companies missing Company Admin and/or Human Handoff Agent.
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
        not exists (
          select 1
          from public.roles r
          where r.company_id = c.id
            and r.role_type = 'DEFAULT'
            and r.template_key = 'admin'
        )
        or not exists (
          select 1
          from public.roles r
          where r.company_id = c.id
            and r.role_type = 'DEFAULT'
            and r.template_key = 'human_handoff_agent'
        )
      )
    order by c.created_at
  loop
    begin
      -- Prefer full provisioning when Admin is missing; otherwise sync DEFAULT roles only.
      if not exists (
        select 1
        from public.roles r
        where r.company_id = v_company.id
          and r.role_type = 'DEFAULT'
          and r.template_key = 'admin'
      ) then
        v_result := public.execute_tenant_provisioning(v_company.id);
      else
        v_result := public.provision_tenant_default_roles(v_company.id);
      end if;
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

-- ── 4. Backfill existing tenant companies ────────────────────

do $$
declare
  v_company record;
  v_ok integer := 0;
  v_fail integer := 0;
  v_error text;
begin
  perform set_config('vault.provisioning_bootstrap', 'true', true);
  perform set_config('vault.disable_role_notifications', 'true', true);

  for v_company in
    select c.id, c.name
    from public.companies c
    where coalesce(c.company_type, 'tenant') not in ('platform', 'demo')
    order by c.created_at
  loop
    begin
      perform public.provision_tenant_default_roles(v_company.id);
      v_ok := v_ok + 1;
    exception
      when others then
        get stacked diagnostics v_error = message_text;
        v_fail := v_fail + 1;
        raise warning 'human_handoff_agent backfill failed for company % (%): %',
          v_company.id, v_company.name, v_error;
    end;
  end loop;

  perform set_config('vault.disable_role_notifications', 'false', true);
  perform set_config('vault.provisioning_bootstrap', 'false', true);

  raise notice 'human_handoff_agent backfill complete: ok=%, fail=%', v_ok, v_fail;

  if v_fail > 0 then
    raise exception 'human_handoff_agent backfill failed for % companies', v_fail;
  end if;
end;
$$;
