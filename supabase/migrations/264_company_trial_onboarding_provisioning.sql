-- ============================================================
-- ValueOR Phase 4 — Real trial + onboarding commercial provisioning
-- Additive: shared helpers + redefine onboarding RPCs (261/262 unchanged).
-- ============================================================

-- ── 1. Resolve default plan for onboarding subscriptions ──────

create or replace function public._resolve_default_onboarding_plan_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
begin
  select p.id into v_plan_id
  from public.plans p
  where p.is_active = true
    and lower(coalesce(p.code, '')) = 'basic'
  order by p.sort_order nulls last, p.created_at
  limit 1;

  if v_plan_id is null then
    select p.id into v_plan_id
    from public.plans p
    where p.is_active = true
      and lower(coalesce(p.name, '')) = 'basic'
    order by p.sort_order nulls last, p.created_at
    limit 1;
  end if;

  if v_plan_id is null then
    select p.id into v_plan_id
    from public.plans p
    where p.is_active = true
    order by p.sort_order nulls last, p.created_at
    limit 1;
  end if;

  if v_plan_id is null then
    raise exception 'no_active_plan_configured';
  end if;

  return v_plan_id;
end;
$$;

-- ── 2. Internal subscription row (no billing.edit gate) ───────
-- Used by onboarding SECURITY DEFINER paths. Idempotent.

create or replace function public._ensure_company_subscription_row(
  p_company_id uuid,
  p_start_trial boolean default true,
  p_billing_cycle text default 'monthly',
  p_plan_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_sub public.company_subscriptions%rowtype;
  v_plan_id uuid := p_plan_id;
  v_trial_days integer;
  v_auto_renewal boolean;
  v_now timestamptz := now();
  v_status text;
  v_trial_ends timestamptz;
  v_period_end timestamptz;
  v_created boolean := false;
begin
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;

  if coalesce(p_billing_cycle, 'monthly') not in ('monthly', 'yearly') then
    raise exception 'Invalid billing cycle: %', p_billing_cycle;
  end if;

  select * into v_sub
  from public.company_subscriptions cs
  where cs.company_id = p_company_id;

  if found then
    return jsonb_build_object(
      'subscription_id', v_sub.id,
      'company_id', p_company_id,
      'status', v_sub.status,
      'trial_ends_at', v_sub.trial_ends_at,
      'auto_renewal', v_sub.auto_renewal,
      'trial_duration_days', null,
      'created', false
    );
  end if;

  if v_plan_id is null then
    v_plan_id := public._resolve_default_onboarding_plan_id();
  end if;

  select * into v_plan from public.plans where id = v_plan_id and is_active = true;
  if not found then
    raise exception 'Plan not found or inactive';
  end if;

  v_trial_days := coalesce(public.resolve_billing_setting_integer('trial_duration_days', p_company_id), 14);
  v_auto_renewal := coalesce(public.resolve_billing_setting_boolean('auto_renewal_default', p_company_id), true);

  if p_start_trial and v_trial_days > 0 then
    v_status := 'trialing';
    v_trial_ends := v_now + (v_trial_days || ' days')::interval;
    v_period_end := v_trial_ends;
  else
    v_status := 'active';
    v_trial_ends := null;
    v_period_end := case
      when p_billing_cycle = 'yearly' then v_now + interval '1 year'
      else v_now + interval '1 month'
    end;
  end if;

  insert into public.company_subscriptions (
    company_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, next_renewal_at,
    trial_ends_at, auto_renewal
  )
  values (
    p_company_id, v_plan_id, v_status, coalesce(p_billing_cycle, 'monthly'),
    v_now, v_period_end,
    case when v_auto_renewal then v_period_end else null end,
    v_trial_ends, v_auto_renewal
  )
  on conflict (company_id) do nothing
  returning * into v_sub;

  if v_sub.id is null then
    select * into v_sub from public.company_subscriptions where company_id = p_company_id;
  else
    v_created := true;
  end if;

  perform public.sync_company_subscription_denormalized(p_company_id);

  if v_created then
    begin
      perform public.emit_subscription_event(
        p_company_id, v_sub.id, 'subscription_created', 'Subscription Created',
        coalesce(v_plan.display_name, v_plan.name),
        jsonb_build_object(
          'plan_id', v_plan_id,
          'billing_cycle', coalesce(p_billing_cycle, 'monthly'),
          'status', v_sub.status,
          'trial_duration_days', v_trial_days,
          'trial_ends_at', v_sub.trial_ends_at,
          'auto_renewal', v_sub.auto_renewal,
          'source', 'onboarding'
        )
      );
    exception when others then
      -- Event emit must not abort onboarding
      null;
    end;

    perform public.write_billing_audit_log(
      'subscription_created', p_company_id, null,
      jsonb_build_object(
        'subscription_id', v_sub.id,
        'plan_id', v_plan_id,
        'status', v_sub.status,
        'trial_ends_at', v_sub.trial_ends_at,
        'auto_renewal', v_sub.auto_renewal
      ),
      'system',
      jsonb_build_object('billing_cycle', coalesce(p_billing_cycle, 'monthly'), 'source', 'onboarding')
    );
  end if;

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'company_id', p_company_id,
    'status', v_sub.status,
    'trial_ends_at', v_sub.trial_ends_at,
    'auto_renewal', v_sub.auto_renewal,
    'trial_duration_days', v_trial_days,
    'created', v_created
  );
end;
$$;

-- Keep public create_company_subscription_v1 but reuse internal helper
create or replace function public.create_company_subscription_v1(
  p_company_id uuid,
  p_plan_id uuid,
  p_billing_cycle text default 'monthly',
  p_start_trial boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;
  if not public.can_edit_billing() then
    raise exception 'Insufficient permissions to create subscription';
  end if;
  if not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot create subscription for this company';
  end if;

  if exists (select 1 from public.company_subscriptions cs where cs.company_id = p_company_id) then
    raise exception 'Subscription already exists for company %', p_company_id;
  end if;

  v_result := public._ensure_company_subscription_row(
    p_company_id,
    p_start_trial,
    p_billing_cycle,
    p_plan_id
  );

  return v_result - 'created';
end;
$$;

-- ── 3. Core system grants (idempotent) ────────────────────────

create or replace function public._ensure_core_system_feature_grants(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_inserted text[] := '{}';
  v_codes text[] := array['core_crm', 'customers'];
begin
  foreach v_code in array v_codes loop
    if not exists (
      select 1 from public.feature_definitions fd
      where fd.code = v_code and fd.is_active = true
        and fd.is_billable = false and fd.requires_subscription = false
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.company_feature_overrides o
      where o.company_id = p_company_id
        and o.feature_code = v_code
        and o.is_active = true
    ) then
      continue;
    end if;

    insert into public.company_feature_overrides (
      company_id, feature_code, override_state, reason,
      starts_at, expires_at, source, notes, is_active
    ) values (
      p_company_id, v_code, 'enabled', 'Core system grant',
      now(), null, 'system', 'core onboarding grant', true
    );

    v_inserted := array_append(v_inserted, v_code);
  end loop;

  return jsonb_build_object('inserted', to_jsonb(v_inserted));
end;
$$;

-- ── 4. Apply trial_feature_set (validated, idempotent) ────────

create or replace function public._apply_configured_trial_feature_grants(
  p_company_id uuid,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_grant_source text default 'trial'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
  v_elem jsonb;
  v_code text;
  v_fd public.feature_definitions%rowtype;
  v_applied text[] := '{}';
  v_skipped_core text[] := '{}';
  v_source text := coalesce(nullif(trim(p_grant_source), ''), 'trial');
begin
  if v_source not in ('trial', 'manual', 'contract', 'system') then
    raise exception 'invalid_grant_source';
  end if;

  v_raw := public.resolve_billing_setting_value('trial_feature_set', p_company_id);

  if v_raw is null or v_raw = 'null'::jsonb then
    v_raw := '[]'::jsonb;
  end if;

  if jsonb_typeof(v_raw) <> 'array' then
    raise exception 'invalid_trial_feature_set';
  end if;

  for v_elem in select * from jsonb_array_elements(v_raw)
  loop
    if jsonb_typeof(v_elem) = 'string' then
      v_code := nullif(trim(v_elem #>> '{}'), '');
    else
      raise exception 'invalid_trial_feature_code';
    end if;

    if v_code is null then
      raise exception 'invalid_trial_feature_code';
    end if;

    select * into v_fd
    from public.feature_definitions fd
    where fd.code = v_code;

    if not found then
      raise exception 'unknown_trial_feature_code:%', v_code;
    end if;

    if not v_fd.is_active then
      raise exception 'inactive_trial_feature_code:%', v_code;
    end if;

    -- Core/non-commercial: ensure system grant only — never convert to trial.
    if not (v_fd.is_billable or v_fd.requires_subscription) then
      if not exists (
        select 1 from public.company_feature_overrides o
        where o.company_id = p_company_id and o.feature_code = v_code and o.is_active = true
      ) then
        insert into public.company_feature_overrides (
          company_id, feature_code, override_state, reason,
          starts_at, expires_at, source, notes, is_active
        ) values (
          p_company_id, v_code, 'enabled', 'Core system grant from trial pack',
          coalesce(p_starts_at, now()), null, 'system', 'core from trial_feature_set', true
        );
      end if;
      v_skipped_core := array_append(v_skipped_core, v_code);
      continue;
    end if;

    -- Commercial: idempotent trial/manual grant
    if exists (
      select 1 from public.company_feature_overrides o
      where o.company_id = p_company_id
        and o.feature_code = v_code
        and o.is_active = true
    ) then
      continue;
    end if;

    insert into public.company_feature_overrides (
      company_id, feature_code, override_state, reason,
      starts_at, expires_at, source, notes, is_active
    ) values (
      p_company_id,
      v_code,
      'enabled',
      case when v_source = 'trial' then 'Trial feature pack' else 'Onboarding feature pack' end,
      coalesce(p_starts_at, now()),
      p_expires_at,
      v_source,
      'from trial_feature_set',
      true
    );

    v_applied := array_append(v_applied, v_code);
  end loop;

  return jsonb_build_object(
    'applied', to_jsonb(v_applied),
    'core_retained', to_jsonb(v_skipped_core),
    'source', v_source,
    'starts_at', p_starts_at,
    'expires_at', p_expires_at
  );
end;
$$;

-- ── 5. Orchestrator for onboarding commercial access ─────────

create or replace function public.provision_company_commercial_access_v1(
  p_company_id uuid,
  p_mode text default 'trial'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text := lower(coalesce(nullif(trim(p_mode), ''), 'trial'));
  v_start_trial boolean;
  v_sub jsonb;
  v_core jsonb;
  v_features jsonb;
  v_starts timestamptz := now();
  v_ends timestamptz;
  v_grant_source text;
  v_duration integer;
begin
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;

  if v_mode not in ('trial', 'active') then
    raise exception 'invalid_access_mode';
  end if;

  v_start_trial := (v_mode = 'trial');
  v_grant_source := case when v_mode = 'trial' then 'trial' else 'manual' end;

  v_sub := public._ensure_company_subscription_row(
    p_company_id,
    v_start_trial,
    'monthly',
    null
  );

  v_ends := case
    when v_mode = 'trial' then (v_sub->>'trial_ends_at')::timestamptz
    else null
  end;

  v_duration := coalesce((v_sub->>'trial_duration_days')::integer,
    public.resolve_billing_setting_integer('trial_duration_days', p_company_id),
    14);

  v_core := public._ensure_core_system_feature_grants(p_company_id);

  v_features := public._apply_configured_trial_feature_grants(
    p_company_id,
    v_starts,
    v_ends,
    v_grant_source
  );

  if v_mode = 'trial' and (
    coalesce((v_sub->>'created')::boolean, false)
    or coalesce(jsonb_array_length(coalesce(v_features->'applied', '[]'::jsonb)), 0) > 0
    or coalesce(jsonb_array_length(coalesce(v_core->'inserted', '[]'::jsonb)), 0) > 0
  ) then
    perform public.write_billing_audit_log(
      'trial_started',
      p_company_id,
      null,
      jsonb_build_object(
        'trial_starts_at', v_starts,
        'trial_ends_at', v_ends,
        'trial_duration_days', v_duration,
        'feature_set', v_features->'applied',
        'core_grants', v_core->'inserted',
        'subscription_id', v_sub->>'subscription_id'
      ),
      'system',
      jsonb_build_object('source', 'onboarding')
    );
  end if;

  return jsonb_build_object(
    'mode', v_mode,
    'subscription', v_sub,
    'core', v_core,
    'features', v_features,
    'trial_starts_at', v_starts,
    'trial_ends_at', v_ends,
    'trial_duration_days', v_duration
  );
end;
$$;

-- ── 6. Extend trial (platform admin) — capability for Phase 5/6 UI

create or replace function public.extend_company_trial_v1(
  p_company_id uuid,
  p_new_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_previous jsonb;
  v_updated_grants integer := 0;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to extend trial';
  end if;

  if p_company_id is null or p_new_ends_at is null then
    raise exception 'company_id and new_ends_at are required';
  end if;

  if p_new_ends_at <= now() then
    raise exception 'new_ends_at_must_be_future';
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  v_previous := jsonb_build_object(
    'trial_ends_at', v_sub.trial_ends_at,
    'status', v_sub.status,
    'current_period_end', v_sub.current_period_end
  );

  update public.company_subscriptions
  set
    trial_ends_at = p_new_ends_at,
    status = case when status in ('trialing', 'expired') then 'trialing' else status end,
    current_period_end = case
      when status in ('trialing', 'expired') or trial_ends_at is not null then p_new_ends_at
      else current_period_end
    end,
    next_renewal_at = case
      when auto_renewal and (status in ('trialing', 'expired') or trial_ends_at is not null)
        then p_new_ends_at
      else next_renewal_at
    end,
    updated_at = now()
  where company_id = p_company_id;

  update public.companies
  set
    status = case when status = 'Suspended' then status else 'Trial' end,
    subscription_status = 'trialing',
    subscription_expires_at = p_new_ends_at,
    updated_at = now()
  where id = p_company_id;

  update public.company_feature_overrides o
  set
    expires_at = p_new_ends_at,
    updated_at = now(),
    updated_by = auth.uid()
  where o.company_id = p_company_id
    and o.is_active = true
    and o.source = 'trial';

  get diagnostics v_updated_grants = row_count;

  perform public.sync_company_subscription_denormalized(p_company_id);

  perform public.write_billing_audit_log(
    'trial_extended',
    p_company_id,
    v_previous,
    jsonb_build_object(
      'trial_ends_at', p_new_ends_at,
      'trial_grants_updated', v_updated_grants
    ),
    'manual',
    jsonb_build_object('source', 'extend_company_trial_v1')
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'trial_ends_at', p_new_ends_at,
    'trial_grants_updated', v_updated_grants
  );
end;
$$;

-- ── 7. Redefine onboard_own_company_v1 ────────────────────────

create or replace function public.onboard_own_company_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_company public.companies%rowtype;
  v_admin_role_id uuid;
  v_name text;
  v_legal_name text;
  v_business_type text;
  v_industry text;
  v_contact_email text;
  v_contact_phone text;
  v_owner_display_name text;
  v_owner_phone text;
  v_owner_job_title text;
  v_timezone text;
  v_provisioning jsonb;
  v_access jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  perform pg_advisory_xact_lock(hashtext('onboard_own_company_v1:' || v_user_id::text));

  select *
  into v_profile
  from public.profiles p
  where p.id = v_user_id or p.user_id = v_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  if v_profile.company_id is not null then
    raise exception 'company_already_assigned';
  end if;

  if coalesce(v_profile.is_super_admin, false) then
    raise exception 'super_admin_use_admin_create';
  end if;

  v_name := public._company_onboarding_text(p_payload->>'name', 200);
  v_legal_name := public._company_onboarding_text(p_payload->>'legal_name', 200);
  v_business_type := public._company_onboarding_text(p_payload->>'business_type', 80);
  v_industry := public._company_onboarding_text(p_payload->>'industry', 120);
  v_contact_email := public._company_onboarding_text(p_payload->>'contact_email', 254);
  v_contact_phone := public._company_onboarding_text(p_payload->>'contact_phone', 40);
  v_owner_display_name := coalesce(
    public._company_onboarding_text(p_payload->>'owner_display_name', 200),
    public._company_onboarding_text(p_payload->>'owner_full_name', 200),
    v_profile.full_name,
    v_profile.email
  );
  v_owner_phone := public._company_onboarding_text(p_payload->>'owner_phone', 40);
  v_owner_job_title := coalesce(
    public._company_onboarding_text(p_payload->>'owner_job_title', 120),
    'Owner'
  );
  v_timezone := coalesce(
    public._company_onboarding_text(p_payload->>'timezone', 64),
    v_profile.timezone,
    'UTC'
  );

  if v_name is null then raise exception 'company_name_required'; end if;
  if v_legal_name is null then raise exception 'legal_name_required'; end if;
  if v_business_type is null then raise exception 'business_type_required'; end if;
  if v_industry is null then raise exception 'industry_required'; end if;
  if v_contact_email is null or v_contact_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'contact_email_invalid';
  end if;
  if v_contact_phone is null then raise exception 'contact_phone_required'; end if;

  perform set_config('vault.provisioning_bootstrap', 'true', true);

  insert into public.companies (
    name, status, subscription_plan, subscription_status, company_type,
    industry, business_type, contact_person, contact_email, contact_phone,
    tenant_provisioning_status
  )
  values (
    v_name, 'Trial', 'Basic', 'trialing', 'tenant',
    v_industry, v_business_type, v_owner_display_name, v_contact_email, v_contact_phone,
    'pending'
  )
  returning * into v_company;

  v_provisioning := public.execute_tenant_provisioning(v_company.id);

  perform public._apply_company_onboarding_identity(
    v_company.id,
    p_payload || jsonb_build_object('name', v_name, 'timezone', v_timezone)
  );

  -- Real trial + commercial grants (atomic with this transaction)
  v_access := public.provision_company_commercial_access_v1(v_company.id, 'trial');

  select r.id into v_admin_role_id
  from public.roles r
  where r.company_id = v_company.id
    and r.role_type = 'DEFAULT'
    and r.template_key = 'admin'
  limit 1;

  if v_admin_role_id is null then
    raise exception 'admin_role_missing';
  end if;

  perform set_config('valueor.allow_privileged_profile_update', 'on', true);

  update public.profiles
  set
    company_id = v_company.id,
    full_name = coalesce(v_owner_display_name, full_name),
    phone = coalesce(v_owner_phone, phone),
    job_title = coalesce(v_owner_job_title, job_title),
    timezone = v_timezone,
    updated_at = now()
  where id = v_profile.id;

  delete from public.user_roles where user_id = v_profile.id;
  insert into public.user_roles (user_id, role_id)
  values (v_profile.id, v_admin_role_id);

  perform set_config('vault.provisioning_bootstrap', 'false', true);

  select * into v_company from public.companies where id = v_company.id;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'company_id', v_company.id,
    'role_id', v_admin_role_id,
    'provisioning', v_provisioning,
    'access', v_access,
    'subscription', v_access->'subscription',
    'trial_ends_at', v_access->'trial_ends_at',
    'trial_features', v_access->'features'->'applied'
  );
exception
  when unique_violation then
    raise exception 'duplicate_onboarding';
end;
$$;

-- ── 8. Redefine create_company_admin_v1 ───────────────────────

create or replace function public.create_company_admin_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_name text;
  v_legal_name text;
  v_business_type text;
  v_industry text;
  v_contact_email text;
  v_contact_phone text;
  v_contact_person text;
  v_status text;
  v_plan text;
  v_mode text;
  v_provisioning jsonb;
  v_access jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not (
    public.is_super_admin()
    or public.user_has_permission('companies.create')
  ) then
    raise exception 'forbidden';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  v_name := public._company_onboarding_text(p_payload->>'name', 200);
  v_legal_name := public._company_onboarding_text(p_payload->>'legal_name', 200);
  v_business_type := public._company_onboarding_text(p_payload->>'business_type', 80);
  v_industry := public._company_onboarding_text(p_payload->>'industry', 120);
  v_contact_email := public._company_onboarding_text(p_payload->>'contact_email', 254);
  v_contact_phone := public._company_onboarding_text(p_payload->>'contact_phone', 40);
  v_contact_person := public._company_onboarding_text(p_payload->>'contact_person', 200);
  v_status := coalesce(public._company_onboarding_text(p_payload->>'status', 32), 'Trial');
  v_plan := coalesce(public._company_onboarding_text(p_payload->>'subscription_plan', 64), 'Basic');

  if v_name is null then raise exception 'company_name_required'; end if;
  if v_legal_name is null then raise exception 'legal_name_required'; end if;
  if v_business_type is null then raise exception 'business_type_required'; end if;
  if v_industry is null then raise exception 'industry_required'; end if;
  if v_contact_email is null or v_contact_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'contact_email_invalid';
  end if;
  if v_contact_phone is null then raise exception 'contact_phone_required'; end if;
  if v_status not in ('Active', 'Suspended', 'Trial') then
    raise exception 'invalid_status';
  end if;

  v_mode := case when v_status = 'Active' then 'active' else 'trial' end;

  perform set_config('vault.provisioning_bootstrap', 'true', true);

  insert into public.companies (
    name, status, subscription_plan, subscription_status, company_type,
    industry, business_type, contact_person, contact_email, contact_phone,
    tenant_provisioning_status
  )
  values (
    v_name,
    v_status,
    v_plan,
    case when v_mode = 'active' then 'active' else 'trialing' end,
    'tenant',
    v_industry, v_business_type, v_contact_person, v_contact_email, v_contact_phone,
    'pending'
  )
  returning * into v_company;

  v_provisioning := public.execute_tenant_provisioning(v_company.id);

  perform public._apply_company_onboarding_identity(
    v_company.id,
    p_payload || jsonb_build_object('name', v_name)
  );

  v_access := public.provision_company_commercial_access_v1(v_company.id, v_mode);

  -- Preserve Suspended after provisioning if requested
  if v_status = 'Suspended' then
    update public.companies
    set status = 'Suspended', updated_at = now()
    where id = v_company.id;
  end if;

  perform set_config('vault.provisioning_bootstrap', 'false', true);

  select * into v_company from public.companies where id = v_company.id;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'company_id', v_company.id,
    'provisioning', v_provisioning,
    'access', v_access,
    'subscription', v_access->'subscription',
    'trial_ends_at', v_access->'trial_ends_at',
    'trial_features', v_access->'features'->'applied'
  );
end;
$$;

-- ── 9. Grants ─────────────────────────────────────────────────

revoke all on function public._resolve_default_onboarding_plan_id() from public;
revoke all on function public._ensure_company_subscription_row(uuid, boolean, text, uuid) from public;
revoke all on function public._ensure_core_system_feature_grants(uuid) from public;
revoke all on function public._apply_configured_trial_feature_grants(uuid, timestamptz, timestamptz, text) from public;

revoke all on function public.provision_company_commercial_access_v1(uuid, text) from public;
grant execute on function public.provision_company_commercial_access_v1(uuid, text) to service_role;

revoke all on function public.extend_company_trial_v1(uuid, timestamptz) from public;
grant execute on function public.extend_company_trial_v1(uuid, timestamptz) to authenticated;
grant execute on function public.extend_company_trial_v1(uuid, timestamptz) to service_role;

revoke all on function public.onboard_own_company_v1(jsonb) from public;
grant execute on function public.onboard_own_company_v1(jsonb) to authenticated;
grant execute on function public.onboard_own_company_v1(jsonb) to service_role;

revoke all on function public.create_company_admin_v1(jsonb) from public;
grant execute on function public.create_company_admin_v1(jsonb) to authenticated;
grant execute on function public.create_company_admin_v1(jsonb) to service_role;

revoke all on function public.create_company_subscription_v1(uuid, uuid, text, boolean) from public;
grant execute on function public.create_company_subscription_v1(uuid, uuid, text, boolean) to authenticated;
