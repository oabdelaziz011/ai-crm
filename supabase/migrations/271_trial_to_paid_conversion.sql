-- ============================================================
-- 271 — Trial → Paid subscription foundation (Phase 7.6)
-- ============================================================
-- Administrative conversion only. Does NOT implement payment collection.
--
-- Flow:
--   trialing + approved + fixed-price package + cycle
--     → expire trial grants
--     → assign_company_package_v1 (snapshot + package grants)
--     → status active + paid period dates
--     → audit trial_converted_to_paid
--
-- Runtime access remains Phase 6 (company_feature_overrides + is_feature_enabled).
-- ============================================================

insert into public.billing_audit_event_types (code, label, description)
values
  (
    'trial_converted_to_paid',
    'Trial Converted to Paid',
    'Administrative trial→paid subscription activation (no payment confirmation)'
  )
on conflict (code) do update
set label = excluded.label, description = excluded.description, is_active = true;

create or replace function public.convert_trial_to_paid_v1(
  p_company_id uuid,
  p_plan_id uuid,
  p_billing_cycle text,
  p_reason text default null,
  p_conversion_source text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_sub public.company_subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_cycle text := lower(trim(coalesce(p_billing_cycle, '')));
  v_source text := lower(trim(coalesce(nullif(trim(p_conversion_source), ''), 'admin')));
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Administrative trial to paid conversion');
  v_now timestamptz := now();
  v_period_end timestamptz;
  v_previous jsonb;
  v_assign jsonb;
  v_trial_grants_expired integer := 0;
  v_was_suspended boolean := false;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public._can_manage_commercial_packages() then
    raise exception 'Insufficient permissions to convert trial to paid';
  end if;

  if auth.role() <> 'service_role' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot convert trial for this company';
  end if;

  if p_company_id is null or p_plan_id is null then
    raise exception 'company_id and plan_id are required';
  end if;

  if v_cycle not in ('monthly', 'yearly') then
    raise exception 'Invalid billing cycle: % (expected monthly|yearly)', v_cycle;
  end if;

  if v_source not in ('admin', 'payment', 'api', 'migration', 'system') then
    raise exception 'Invalid conversion_source: %', v_source;
  end if;

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'Company not found';
  end if;

  if coalesce(v_company.approval_status, 'approved') <> 'approved' then
    raise exception 'Company must be approved before trial-to-paid conversion (approval_status=%)',
      coalesce(v_company.approval_status, 'null');
  end if;

  v_was_suspended := (v_company.status = 'Suspended');

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  for update;

  if not found then
    raise exception 'Subscription not found for company %', p_company_id;
  end if;

  -- Idempotent: already active with same package + cycle
  if v_sub.status = 'active'
     and v_sub.plan_id is not distinct from p_plan_id
     and v_sub.billing_cycle = v_cycle then
    return jsonb_build_object(
      'company_id', p_company_id,
      'subscription_id', v_sub.id,
      'status', 'active',
      'plan_id', v_sub.plan_id,
      'billing_cycle', v_sub.billing_cycle,
      'skipped', true,
      'reason', 'already_active_same_package_cycle',
      'note', 'Administrative conversion only — no payment confirmation'
    );
  end if;

  if v_sub.status = 'active' then
    raise exception 'Subscription is already active (use package assign to change package)';
  end if;

  if v_sub.status in ('expired', 'canceled') then
    raise exception 'Cannot convert subscription from status %', v_sub.status;
  end if;

  if v_sub.status <> 'trialing' then
    raise exception 'Trial-to-paid conversion requires status=trialing (current=%)', v_sub.status;
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Package not found';
  end if;

  if coalesce(v_plan.is_active, false) is not true then
    raise exception 'Package is inactive';
  end if;

  -- Paid conversion requires fixed list pricing (Phase 7.4 modes).
  if coalesce(v_plan.pricing_mode, 'fixed') = 'free' then
    raise exception 'Cannot convert trial to paid using a free package (pricing_mode=free)';
  end if;

  if coalesce(v_plan.pricing_mode, 'fixed') = 'custom' then
    raise exception 'Cannot convert trial to paid using a custom package until negotiated pricing exists';
  end if;

  if coalesce(v_plan.pricing_mode, 'fixed') <> 'fixed' then
    raise exception 'Invalid package pricing_mode for paid conversion: %', v_plan.pricing_mode;
  end if;

  if coalesce(v_plan.price_monthly, 0) <= 0 and coalesce(v_plan.price_yearly, 0) <= 0 then
    raise exception 'Fixed package requires a positive monthly and/or yearly list price';
  end if;

  if v_cycle = 'monthly' and coalesce(v_plan.price_monthly, 0) <= 0 then
    raise exception 'Selected monthly cycle requires price_monthly > 0';
  end if;

  if v_cycle = 'yearly' and coalesce(v_plan.price_yearly, 0) <= 0 then
    raise exception 'Selected yearly cycle requires price_yearly > 0';
  end if;

  perform public.assert_subscription_status_transition(v_sub.status, 'active');

  v_previous := jsonb_build_object(
    'status', v_sub.status,
    'plan_id', v_sub.plan_id,
    'billing_cycle', v_sub.billing_cycle,
    'trial_ends_at', v_sub.trial_ends_at,
    'current_period_start', v_sub.current_period_start,
    'current_period_end', v_sub.current_period_end,
    'package_feature_snapshot', v_sub.package_feature_snapshot,
    'company_status', v_company.status,
    'approval_status', v_company.approval_status
  );

  -- Expire trial grants so package grants can provision (internal grant skips other active sources).
  update public.company_feature_overrides
  set
    is_active = false,
    expires_at = least(coalesce(expires_at, v_now), v_now),
    updated_by = auth.uid(),
    updated_at = v_now,
    notes = case
      when notes is null or length(trim(notes)) = 0 then 'expired on trial→paid conversion'
      else notes || ' | expired on trial→paid conversion'
    end
  where company_id = p_company_id
    and source = 'trial'
    and is_active = true;

  get diagnostics v_trial_grants_expired = row_count;

  -- Reuse package assignment for snapshot + package grants (preserves manual/contract/system).
  v_assign := public.assign_company_package_v1(p_company_id, p_plan_id, v_cycle);

  v_period_end := case
    when v_cycle = 'yearly' then v_now + interval '1 year'
    else v_now + interval '1 month'
  end;

  update public.company_subscriptions
  set
    status = 'active',
    billing_cycle = v_cycle,
    current_period_start = v_now,
    current_period_end = v_period_end,
    next_renewal_at = case when auto_renewal then v_period_end else null end,
    grace_period_ends_at = null,
    -- Retain trial_ends_at for history; ignored while status=active (Phase 6 expired helper).
    updated_at = v_now
  where id = v_sub.id
  returning * into v_sub;

  -- Preserve administrative Suspended across sync.
  if v_was_suspended then
    update public.companies
    set status = 'Suspended', updated_at = v_now
    where id = p_company_id;
  end if;

  perform public.sync_company_subscription_denormalized(p_company_id);

  if v_was_suspended then
    update public.companies
    set status = 'Suspended', updated_at = v_now
    where id = p_company_id;
  end if;

  perform public.emit_subscription_event(
    p_company_id,
    v_sub.id,
    'subscription_activated',
    'Trial Converted to Paid',
    v_reason,
    jsonb_build_object(
      'conversion', 'trial_to_paid',
      'conversion_source', v_source,
      'plan_id', p_plan_id,
      'package_code', v_plan.code,
      'billing_cycle', v_cycle,
      'list_price', case
        when v_cycle = 'yearly' then v_plan.price_yearly
        else v_plan.price_monthly
      end,
      'trial_grants_expired', v_trial_grants_expired
    )
  );

  perform public.write_billing_audit_log(
    'trial_converted_to_paid',
    p_company_id,
    v_previous,
    jsonb_build_object(
      'status', 'active',
      'plan_id', p_plan_id,
      'package_code', v_plan.code,
      'billing_cycle', v_cycle,
      'current_period_start', v_sub.current_period_start,
      'current_period_end', v_sub.current_period_end,
      'list_price_monthly', v_plan.price_monthly,
      'list_price_yearly', v_plan.price_yearly,
      'trial_grants_expired', v_trial_grants_expired,
      'conversion_source', v_source,
      'reason', v_reason,
      'company_status', case when v_was_suspended then 'Suspended' else 'Active' end,
      'assign_result', v_assign
    ),
    'manual',
    jsonb_build_object(
      'subscription_id', v_sub.id,
      'package_id', p_plan_id,
      'note', 'Administrative activation — no payment confirmation'
    )
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'subscription_id', v_sub.id,
    'status', 'active',
    'plan_id', p_plan_id,
    'package_code', v_plan.code,
    'billing_cycle', v_cycle,
    'current_period_start', v_sub.current_period_start,
    'current_period_end', v_sub.current_period_end,
    'next_renewal_at', v_sub.next_renewal_at,
    'trial_ends_at', v_sub.trial_ends_at,
    'trial_grants_expired', v_trial_grants_expired,
    'list_price', case
      when v_cycle = 'yearly' then v_plan.price_yearly
      else v_plan.price_monthly
    end,
    'conversion_source', v_source,
    'company_suspended', v_was_suspended,
    'skipped', false,
    'note', 'Administrative trial→paid activation. No payment confirmation. Phase 6 remains access authority.'
  );
end;
$$;

revoke all on function public.convert_trial_to_paid_v1(uuid, uuid, text, text, text) from public;
grant execute on function public.convert_trial_to_paid_v1(uuid, uuid, text, text, text) to authenticated, service_role;

comment on function public.convert_trial_to_paid_v1(uuid, uuid, text, text, text) is
  'Phase 7.6 administrative trial→paid conversion. Expires trial grants, assigns package, activates subscription. Does not collect payment.';
