-- ============================================================
-- 272 — Package upgrade / downgrade + grant synchronization (Phase 7.7)
-- ============================================================
-- Administrative package change for existing subscriptions.
-- Does NOT implement payment, proration, checkout, or Trial→Paid.
--
-- Reuses grant sync semantics from assign_company_package_v1:
--   revoke source=package only when not in new snapshot
--   provision source=package for new features
--   preserve manual / contract / system / trial grants
--
-- Runtime access remains Phase 6 (company_feature_overrides + resolver).
-- ============================================================

insert into public.billing_audit_event_types (code, label, description)
values
  (
    'package_upgraded',
    'Package Upgraded',
    'Company commercial package upgraded with grant synchronization (no payment)'
  ),
  (
    'package_downgraded',
    'Package Downgraded',
    'Company commercial package downgraded with grant synchronization (no payment)'
  )
on conflict (code) do update
set label = excluded.label, description = excluded.description, is_active = true;

-- package_changed already seeded in 267.

create or replace function public.change_company_package_v1(
  p_company_id uuid,
  p_plan_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_sub public.company_subscriptions%rowtype;
  v_old_plan public.plans%rowtype;
  v_new_plan public.plans%rowtype;
  v_previous_plan_id uuid;
  v_previous_snapshot jsonb;
  v_previous_codes text[];
  v_codes text[];
  v_snapshot jsonb;
  v_cycle text;
  v_code text;
  v_event text;
  v_direction text;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Administrative package change');
  v_now timestamptz := now();
  v_was_suspended boolean := false;
  v_added text[] := '{}'::text[];
  v_removed text[] := '{}'::text[];
  v_preserved text[] := '{}'::text[];
  v_status text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_next_renewal timestamptz;
  v_trial_ends timestamptz;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public._can_manage_commercial_packages() then
    raise exception 'Insufficient permissions to change commercial packages';
  end if;

  if auth.role() <> 'service_role' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot change package for this company';
  end if;

  if p_company_id is null or p_plan_id is null then
    raise exception 'company_id and plan_id are required';
  end if;

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'Company not found';
  end if;

  v_was_suspended := (v_company.status = 'Suspended');

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  for update;

  if not found then
    raise exception 'Subscription not found for company %', p_company_id;
  end if;

  -- Trial package switching is not Trial→Paid and is unsafe mixed with trial grants.
  if v_sub.status = 'trialing' then
    raise exception
      'Cannot change package while status=trialing; use convert_trial_to_paid_v1 for Trial→Paid';
  end if;

  if v_sub.status in ('expired', 'canceled') then
    raise exception 'Cannot change package from status %', v_sub.status;
  end if;

  if v_sub.status not in ('active', 'past_due', 'grace_period') then
    raise exception 'Package change requires status active|past_due|grace_period (current=%)', v_sub.status;
  end if;

  -- Idempotent: already on target package (preserve dates/grants/audit noise)
  if v_sub.plan_id is not distinct from p_plan_id then
    return jsonb_build_object(
      'company_id', p_company_id,
      'subscription_id', v_sub.id,
      'status', v_sub.status,
      'plan_id', v_sub.plan_id,
      'billing_cycle', v_sub.billing_cycle,
      'skipped', true,
      'reason', 'already_on_target_package',
      'direction', 'noop',
      'note', 'No payment collected. Phase 6 remains access authority.'
    );
  end if;

  select * into v_new_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Package not found';
  end if;

  if coalesce(v_new_plan.is_active, false) is not true then
    raise exception 'Package is inactive';
  end if;

  v_previous_plan_id := v_sub.plan_id;
  if v_previous_plan_id is not null then
    select * into v_old_plan from public.plans where id = v_previous_plan_id;
  end if;

  v_previous_snapshot := coalesce(v_sub.package_feature_snapshot, '[]'::jsonb);
  select coalesce(array_agg(x), '{}'::text[])
  into v_previous_codes
  from (
    select jsonb_array_elements_text(v_previous_snapshot) as x
  ) s;

  -- Preserve lifecycle fields (Phase 7.7: no period reset, no cycle switch)
  v_cycle := coalesce(v_sub.billing_cycle, 'monthly');
  v_status := v_sub.status;
  v_period_start := v_sub.current_period_start;
  v_period_end := v_sub.current_period_end;
  v_next_renewal := v_sub.next_renewal_at;
  v_trial_ends := v_sub.trial_ends_at;

  v_codes := public._package_feature_codes(p_plan_id);
  v_snapshot := to_jsonb(v_codes);

  select coalesce(array_agg(c), '{}'::text[])
  into v_added
  from unnest(v_codes) c
  where not (c = any (v_previous_codes));

  select coalesce(array_agg(c), '{}'::text[])
  into v_removed
  from unnest(v_previous_codes) c
  where not (c = any (v_codes));

  select coalesce(array_agg(o.feature_code order by o.feature_code), '{}'::text[])
  into v_preserved
  from public.company_feature_overrides o
  where o.company_id = p_company_id
    and o.is_active = true
    and o.source in ('manual', 'contract', 'system');

  -- Direction via tier_rank when available; else net feature delta
  if v_old_plan.id is not null
     and coalesce(v_new_plan.tier_rank, 0) > coalesce(v_old_plan.tier_rank, 0) then
    v_direction := 'upgrade';
    v_event := 'package_upgraded';
  elsif v_old_plan.id is not null
     and coalesce(v_new_plan.tier_rank, 0) < coalesce(v_old_plan.tier_rank, 0) then
    v_direction := 'downgrade';
    v_event := 'package_downgraded';
  elsif coalesce(cardinality(v_added), 0) > coalesce(cardinality(v_removed), 0) then
    v_direction := 'upgrade';
    v_event := 'package_upgraded';
  elsif coalesce(cardinality(v_removed), 0) > coalesce(cardinality(v_added), 0) then
    v_direction := 'downgrade';
    v_event := 'package_downgraded';
  else
    v_direction := 'change';
    v_event := 'package_changed';
  end if;

  update public.company_subscriptions
  set
    plan_id = p_plan_id,
    billing_cycle = v_cycle,
    package_feature_snapshot = v_snapshot,
    package_assigned_at = v_now,
    package_assigned_by = auth.uid(),
    -- Explicitly preserve lifecycle dates/status
    status = v_status,
    current_period_start = v_period_start,
    current_period_end = v_period_end,
    next_renewal_at = v_next_renewal,
    trial_ends_at = v_trial_ends,
    updated_at = v_now
  where id = v_sub.id
  returning * into v_sub;

  -- Revoke ONLY package-sourced grants no longer in the new snapshot
  update public.company_feature_overrides
  set
    is_active = false,
    updated_by = auth.uid(),
    updated_at = v_now,
    notes = case
      when notes is null or length(trim(notes)) = 0 then 'package change revoke'
      else notes || ' | package change revoke'
    end
  where company_id = p_company_id
    and source = 'package'
    and is_active = true
    and not (feature_code = any (v_codes));

  foreach v_code in array v_codes loop
    perform public._set_company_feature_grant_internal(
      p_company_id,
      v_code,
      true,
      'package',
      v_now,
      null,
      'package change provision',
      'Package feature grant'
    );
  end loop;

  perform public.sync_company_subscription_denormalized(p_company_id);

  if v_was_suspended then
    update public.companies
    set status = 'Suspended', updated_at = v_now
    where id = p_company_id;
  end if;

  perform public.write_billing_audit_log(
    v_event,
    p_company_id,
    jsonb_build_object(
      'plan_id', v_previous_plan_id,
      'package_code', v_old_plan.code,
      'package_feature_snapshot', v_previous_snapshot,
      'billing_cycle', v_cycle,
      'status', v_status
    ),
    jsonb_build_object(
      'plan_id', p_plan_id,
      'package_code', v_new_plan.code,
      'package_feature_snapshot', v_snapshot,
      'billing_cycle', v_cycle,
      'status', v_status,
      'direction', v_direction,
      'added_feature_codes', to_jsonb(v_added),
      'removed_feature_codes', to_jsonb(v_removed),
      'preserved_non_package_features', to_jsonb(v_preserved),
      'reason', v_reason,
      'current_period_start', v_period_start,
      'current_period_end', v_period_end,
      'list_price_monthly', v_new_plan.price_monthly,
      'list_price_yearly', v_new_plan.price_yearly
    ),
    'manual',
    jsonb_build_object(
      'subscription_id', v_sub.id,
      'package_id', p_plan_id,
      'note', 'Administrative package change — no payment collected'
    )
  );

  begin
    perform public.emit_subscription_event(
      p_company_id,
      v_sub.id,
      'plan_changed',
      case
        when v_direction = 'upgrade' then 'Package Upgraded'
        when v_direction = 'downgrade' then 'Package Downgraded'
        else 'Package Changed'
      end,
      v_reason,
      jsonb_build_object(
        'direction', v_direction,
        'previous_plan_id', v_previous_plan_id,
        'plan_id', p_plan_id,
        'billing_cycle', v_cycle,
        'added_feature_codes', to_jsonb(v_added),
        'removed_feature_codes', to_jsonb(v_removed),
        'package_feature_snapshot', v_snapshot
      )
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'company_id', p_company_id,
    'subscription_id', v_sub.id,
    'status', v_sub.status,
    'previous_plan_id', v_previous_plan_id,
    'previous_package_code', v_old_plan.code,
    'plan_id', p_plan_id,
    'package_code', v_new_plan.code,
    'billing_cycle', v_cycle,
    'direction', v_direction,
    'event', v_event,
    'added_feature_codes', to_jsonb(v_added),
    'removed_feature_codes', to_jsonb(v_removed),
    'preserved_non_package_features', to_jsonb(v_preserved),
    'package_feature_snapshot', v_snapshot,
    'current_period_start', v_sub.current_period_start,
    'current_period_end', v_sub.current_period_end,
    'next_renewal_at', v_sub.next_renewal_at,
    'company_suspended', v_was_suspended,
    'skipped', false,
    'note', 'Administrative package change. No payment collected. Phase 6 remains access authority.'
  );
end;
$$;

revoke all on function public.change_company_package_v1(uuid, uuid, text) from public;
grant execute on function public.change_company_package_v1(uuid, uuid, text) to authenticated, service_role;

comment on function public.change_company_package_v1(uuid, uuid, text) is
  'Phase 7.7: administrative package upgrade/downgrade with package-grant sync. Preserves lifecycle dates/cycle/status. No payment.';
