-- 309 — Company-specific custom commercial package (transactional)
-- Reuses company_commercial_terms, company_feature_overrides (source=contract),
-- company_resource_limits, company_usage_limit_overrides.
-- Does NOT insert a catalog row into plans.

alter table public.company_commercial_terms
  add column if not exists custom_package_name text;

alter table public.company_commercial_terms
  add column if not exists custom_granted_feature_codes text[];

comment on column public.company_commercial_terms.custom_package_name is
  'Display name for a company-specific custom package. Not a plans catalog row.';

comment on column public.company_commercial_terms.custom_granted_feature_codes is
  'Contract grants created by configure_company_custom_package_v1. Overlay reset removes only these.';

insert into public.billing_audit_event_types (code, label, description)
values (
  'company_custom_package_configured',
  'Company custom package configured',
  'Platform admin saved a company-specific custom commercial configuration (no payment)'
)
on conflict (code) do update
set label = excluded.label, description = excluded.description, is_active = true;

create or replace function public._reset_company_custom_commercial_overlay(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_custom boolean := false;
  v_plan_id uuid;
  v_codes text[] := '{}';
  v_code text;
  v_granted text[] := '{}';
begin
  if p_company_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.company_commercial_terms
    where company_id = p_company_id
      and pricing_source = 'custom'
  ) into v_was_custom;

  if not v_was_custom then
    return;
  end if;

  select coalesce(custom_granted_feature_codes, '{}')
    into v_granted
  from public.company_commercial_terms
  where company_id = p_company_id;

  update public.company_commercial_terms
  set
    pricing_source = 'list',
    discount_percent = 0,
    custom_price_monthly = null,
    custom_price_yearly = null,
    custom_package_name = null,
    custom_granted_feature_codes = null,
    configured_at = now(),
    configured_by = auth.uid(),
    updated_at = now()
  where company_id = p_company_id
    and pricing_source = 'custom';

  -- Remove only contract grants created by the Custom overlay.
  -- Pre-existing manual / contract / system grants are preserved.
  if coalesce(array_length(v_granted, 1), 0) > 0 then
    update public.company_feature_overrides
    set is_active = false, updated_by = auth.uid(), updated_at = now()
    where company_id = p_company_id
      and is_active = true
      and source = 'contract'
      and feature_code = any (v_granted);
  end if;

  update public.company_usage_limit_overrides
  set is_active = false, updated_at = now(), configured_at = now(), configured_by = auth.uid()
  where company_id = p_company_id
    and is_active = true;

  select plan_id into v_plan_id
  from public.company_subscriptions
  where company_id = p_company_id;

  if v_plan_id is not null then
    perform public._apply_company_resource_limits_from_plan(p_company_id, v_plan_id, 'package');
    v_codes := coalesce(public._package_feature_codes(v_plan_id), '{}');
    foreach v_code in array v_codes loop
      perform public._set_company_feature_grant_internal(
        p_company_id,
        v_code,
        true,
        'package',
        now(),
        null,
        'Restored after leaving custom package',
        'Catalog package grant after custom overlay reset'
      );
    end loop;
  end if;
end;
$$;

revoke all on function public._reset_company_custom_commercial_overlay(uuid) from public, anon, authenticated;
grant execute on function public._reset_company_custom_commercial_overlay(uuid) to service_role;

create or replace function public.change_company_package_v1(
  p_company_id uuid,
  p_plan_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = internal, public
as $$
declare
  v_result jsonb;
begin
  v_result := internal.change_company_package_v1(p_company_id, p_plan_id, p_reason);
  perform public._reset_company_custom_commercial_overlay(p_company_id);
  return v_result;
end;
$$;

revoke all on function public.change_company_package_v1(uuid, uuid, text) from public, anon;
grant execute on function public.change_company_package_v1(uuid, uuid, text) to authenticated, service_role;

create or replace function public.configure_company_custom_package_v1(
  p_company_id uuid,
  p_package_name text,
  p_billing_cycle text,
  p_custom_price_monthly numeric,
  p_custom_price_yearly numeric,
  p_notes text,
  p_feature_codes text[],
  p_max_users integer,
  p_max_branches integer,
  p_usage_limits jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_sub public.company_subscriptions%rowtype;
  v_cycle text := lower(trim(coalesce(p_billing_cycle, 'monthly')));
  v_name text := nullif(trim(coalesce(p_package_name, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_code text;
  v_item jsonb;
  v_codes text[] := coalesce(p_feature_codes, '{}');
  v_selected text[] := '{}';
  v_terms public.company_commercial_terms%rowtype;
  v_enabled integer := 0;
  v_limit_count integer := 0;
  v_custom_granted text[] := '{}';
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to configure a custom package';
  end if;
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;
  if v_name is null then
    raise exception 'custom_package_name_required';
  end if;
  if v_cycle not in ('monthly', 'yearly') then
    raise exception 'invalid_billing_cycle';
  end if;
  if p_custom_price_monthly is not null and p_custom_price_monthly < 0 then
    raise exception 'invalid_custom_price_monthly';
  end if;
  if p_custom_price_yearly is not null and p_custom_price_yearly < 0 then
    raise exception 'invalid_custom_price_yearly';
  end if;
  if p_max_users is not null and p_max_users < 0 then
    raise exception 'invalid_max_users';
  end if;
  if p_max_branches is not null and p_max_branches < 0 then
    raise exception 'invalid_max_branches';
  end if;

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'Company not found';
  end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then
    raise exception 'Subscription not found for company';
  end if;
  if v_sub.status = 'trialing' then
    raise exception 'Cannot configure a custom package while status=trialing; use convert_trial_to_paid_v1';
  end if;
  if v_sub.status not in ('active', 'past_due', 'grace_period') then
    raise exception 'Custom package requires status active|past_due|grace_period (current=%)', v_sub.status;
  end if;

  foreach v_code in array v_codes
  loop
    v_code := nullif(trim(v_code), '');
    if v_code is null then
      continue;
    end if;
    if not exists (
      select 1 from public.feature_definitions fd
      where fd.code = v_code
        and fd.is_active = true
        and (coalesce(fd.is_billable, false) or coalesce(fd.requires_subscription, false))
    ) then
      raise exception 'unknown_or_non_commercial_feature: %', v_code;
    end if;
    if not v_code = any (v_selected) then
      v_selected := array_append(v_selected, v_code);
    end if;
  end loop;

  update public.company_subscriptions
  set billing_cycle = v_cycle, updated_at = now()
  where id = v_sub.id
  returning * into v_sub;

  insert into public.company_commercial_terms (
    company_id, pricing_source, discount_percent,
    custom_price_monthly, custom_price_yearly, notes, custom_package_name,
    custom_granted_feature_codes,
    configured_at, configured_by, updated_at
  ) values (
    p_company_id, 'custom', 0,
    p_custom_price_monthly, p_custom_price_yearly, v_notes, v_name,
    '{}',
    now(), auth.uid(), now()
  )
  on conflict (company_id) do update
  set
    pricing_source = 'custom',
    discount_percent = 0,
    custom_price_monthly = excluded.custom_price_monthly,
    custom_price_yearly = excluded.custom_price_yearly,
    notes = excluded.notes,
    custom_package_name = excluded.custom_package_name,
    configured_at = now(),
    configured_by = auth.uid(),
    updated_at = now()
  returning * into v_terms;

  -- Replace catalog package commercial grants only.
  -- Preserve unrelated manual / contract / system / trial grants.
  update public.company_feature_overrides
  set is_active = false, updated_by = auth.uid(), updated_at = now()
  where company_id = p_company_id
    and is_active = true
    and source = 'package'
    and feature_code in (
      select fd.code from public.feature_definitions fd
      where fd.is_active = true
        and (coalesce(fd.is_billable, false) or coalesce(fd.requires_subscription, false))
    );

  -- Previous Custom overlay contract grants that are no longer selected.
  if coalesce(array_length(v_terms.custom_granted_feature_codes, 1), 0) > 0 then
    update public.company_feature_overrides
    set is_active = false, updated_by = auth.uid(), updated_at = now()
    where company_id = p_company_id
      and is_active = true
      and source = 'contract'
      and feature_code = any (v_terms.custom_granted_feature_codes)
      and not (feature_code = any (v_selected));
  end if;

  foreach v_code in array v_selected
  loop
    if exists (
      select 1 from public.company_feature_overrides o
      where o.company_id = p_company_id
        and o.feature_code = v_code
        and o.is_active = true
        and o.override_state = 'enabled'
        and o.source in ('system', 'manual', 'trial')
    ) then
      continue;
    end if;
    if exists (
      select 1 from public.company_feature_overrides o
      where o.company_id = p_company_id
        and o.feature_code = v_code
        and o.is_active = true
        and o.override_state = 'enabled'
        and o.source = 'contract'
    ) then
      if v_code = any (coalesce(v_terms.custom_granted_feature_codes, '{}')) then
        v_custom_granted := array_append(v_custom_granted, v_code);
      end if;
      continue;
    end if;
    perform public._set_company_feature_grant_internal(
      p_company_id,
      v_code,
      true,
      'contract',
      now(),
      null,
      v_notes,
      coalesce(v_notes, 'Custom commercial package grant')
    );
    v_custom_granted := array_append(v_custom_granted, v_code);
    v_enabled := v_enabled + 1;
  end loop;

  update public.company_commercial_terms
  set custom_granted_feature_codes = v_custom_granted, updated_at = now()
  where company_id = p_company_id;

  perform public._upsert_company_resource_limits(
    p_company_id,
    p_max_users,
    p_max_branches,
    'contract'
  );

  update public.company_usage_limit_overrides
  set is_active = false, updated_at = now(), configured_at = now(), configured_by = auth.uid()
  where company_id = p_company_id
    and is_active = true;

  if p_usage_limits is not null and jsonb_typeof(p_usage_limits) = 'array' then
    for v_item in select value from jsonb_array_elements(p_usage_limits)
    loop
      v_code := nullif(trim(coalesce(v_item->>'metric_code', '')), '');
      if v_code is null then
        continue;
      end if;
      if not exists (
        select 1 from public.usage_metric_definitions d
        where d.code = v_code and d.is_active = true
      ) then
        raise exception 'unknown_metric_code: %', v_code;
      end if;
      insert into public.company_usage_limit_overrides (
        company_id, metric_code, included_quantity, is_unlimited,
        overage_allowed, overage_unit_size, overage_unit_price,
        is_active, notes, configured_at, configured_by, updated_at
      ) values (
        p_company_id,
        v_code,
        nullif(v_item->>'included_quantity', '')::numeric,
        coalesce((v_item->>'is_unlimited')::boolean, false),
        coalesce((v_item->>'overage_allowed')::boolean, false),
        nullif(v_item->>'overage_unit_size', '')::numeric,
        nullif(v_item->>'overage_unit_price', '')::numeric,
        true,
        v_notes,
        now(),
        auth.uid(),
        now()
      )
      on conflict (company_id, metric_code) do update
      set
        included_quantity = excluded.included_quantity,
        is_unlimited = excluded.is_unlimited,
        overage_allowed = excluded.overage_allowed,
        overage_unit_size = excluded.overage_unit_size,
        overage_unit_price = excluded.overage_unit_price,
        is_active = true,
        notes = excluded.notes,
        configured_at = now(),
        configured_by = auth.uid(),
        updated_at = now();
      v_limit_count := v_limit_count + 1;
    end loop;
  end if;

  perform public.write_billing_audit_log(
    'company_custom_package_configured',
    p_company_id,
    jsonb_build_object(
      'plan_id', v_sub.plan_id,
      'status', v_sub.status,
      'billing_cycle', v_sub.billing_cycle
    ),
    jsonb_build_object(
      'custom_package_name', v_name,
      'billing_cycle', v_cycle,
      'custom_price_monthly', p_custom_price_monthly,
      'custom_price_yearly', p_custom_price_yearly,
      'feature_codes', to_jsonb(v_selected),
      'max_users', p_max_users,
      'max_branches', p_max_branches,
      'usage_limit_count', v_limit_count,
      'notes', v_notes
    ),
    'manual',
    jsonb_build_object(
      'source', 'configure_company_custom_package_v1',
      'note', 'Administrative custom package configuration — no payment collected'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'company_id', p_company_id,
    'subscription_id', v_sub.id,
    'status', v_sub.status,
    'billing_cycle', v_sub.billing_cycle,
    'custom_package_name', v_name,
    'pricing_source', 'custom',
    'custom_price_monthly', p_custom_price_monthly,
    'custom_price_yearly', p_custom_price_yearly,
    'enabled_feature_count', v_enabled,
    'usage_limit_count', v_limit_count,
    'max_users', p_max_users,
    'max_branches', p_max_branches,
    'payment_collected', false,
    'note', 'Administrative custom package configuration. No payment collected.'
  );
end;
$$;

revoke all on function public.configure_company_custom_package_v1(uuid, text, text, numeric, numeric, text, text[], integer, integer, jsonb) from public, anon;
grant execute on function public.configure_company_custom_package_v1(uuid, text, text, numeric, numeric, text, text[], integer, integer, jsonb) to authenticated, service_role;

comment on function public.configure_company_custom_package_v1(uuid, text, text, numeric, numeric, text, text[], integer, integer, jsonb) is
  'Super-admin transactional custom commercial configuration for one company. No catalog plan row. No payment.';
