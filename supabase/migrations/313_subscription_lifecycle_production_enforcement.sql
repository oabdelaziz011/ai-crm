-- ============================================================
-- 313 — Production subscription lifecycle self-enforcement
--
-- Closes two production gaps without a second lifecycle system:
--   1) Concurrent orchestrator runs can overlap; add a transaction
--      advisory lock so worker + HTTP endpoint share one RPC safely.
--   2) An `active` row past current_period_end still looked like a
--      current paid period until the worker ran (fail-open window).
--
-- Lifecycle transitions remain 273 (active→past_due→grace→expired).
-- Does NOT fabricate payments, delete package/manual/contract/system
-- grants, or change past_due/grace entitlement.
-- ============================================================

create or replace function public.subscription_active_period_lapsed(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_subscriptions cs
    where cs.company_id = p_company_id
      and cs.status = 'active'
      and coalesce(cs.current_period_end, cs.next_renewal_at) is not null
      and coalesce(cs.current_period_end, cs.next_renewal_at) <= now()
  );
$$;

comment on function public.subscription_active_period_lapsed(uuid) is
  'True when subscription status is still active but the paid period has ended. Used to fail-close commercial access before lifecycle enforcement runs.';

revoke all on function public.subscription_active_period_lapsed(uuid) from public, anon;
grant execute on function public.subscription_active_period_lapsed(uuid) to service_role;

create or replace function public.is_company_commercially_expired(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_sub_status text;
  v_expires_at timestamptz;
  v_trial_ends timestamptz;
  v_cs_status text;
begin
  if p_company_id is null then
    return true;
  end if;

  select c.status, c.subscription_status, c.subscription_expires_at
  into v_status, v_sub_status, v_expires_at
  from public.companies c
  where c.id = p_company_id;

  if not found then
    return true;
  end if;

  -- Suspended is a separate access state; not "expired".
  if v_status = 'Suspended' then
    return false;
  end if;

  if v_sub_status = 'expired' then
    return true;
  end if;

  select cs.status, cs.trial_ends_at, cs.current_period_end
  into v_cs_status, v_trial_ends, v_expires_at
  from public.company_subscriptions cs
  where cs.company_id = p_company_id;

  if found then
    if v_cs_status = 'expired' then
      return true;
    end if;
    if v_cs_status = 'trialing' and v_trial_ends is not null and v_trial_ends <= now() then
      return true;
    end if;
    -- Fail-closed: stale `active` past period end is not a current paid period.
    -- past_due / grace_period remain commercially entitled until they expire.
    if public.subscription_active_period_lapsed(p_company_id) then
      return true;
    end if;
    if v_cs_status in ('canceled') and v_expires_at is not null and v_expires_at <= now() then
      return true;
    end if;
  else
    if v_status = 'Trial'
       and v_sub_status = 'trialing'
       and v_expires_at is not null
       and v_expires_at <= now() then
      return true;
    end if;
    if v_sub_status = 'expired' then
      return true;
    end if;
  end if;

  return false;
end;
$$;

comment on function public.is_company_commercially_expired(uuid) is
  'Commercial expiry clock. Overdue trial, overdue active (period ended), expired, and canceled-past-period are expired. past_due/grace_period are not. Suspended is not expired.';

create or replace function internal.is_feature_enabled(
  p_company_id uuid,
  p_feature_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path to internal, public
as $$
declare
  v_company_status text;
  v_approval_status text;
  v_default_enabled boolean;
  v_is_billable boolean;
  v_requires_subscription boolean;
  v_commercial boolean;
  v_flag_enabled boolean;
  v_override_state text;
  v_grant_source text;
begin
  if p_company_id is null or p_feature_code is null or trim(p_feature_code) = '' then
    return false;
  end if;

  select c.status, coalesce(c.approval_status, 'approved')
  into v_company_status, v_approval_status
  from public.companies c
  where c.id = p_company_id;

  if not found then
    return false;
  end if;

  select fd.default_enabled, fd.is_billable, fd.requires_subscription
  into v_default_enabled, v_is_billable, v_requires_subscription
  from public.feature_definitions fd
  where fd.code = p_feature_code
    and fd.is_active = true
  limit 1;

  if not found then
    return false;
  end if;

  v_commercial := coalesce(v_is_billable, false) or coalesce(v_requires_subscription, false);

  select ff.is_globally_enabled
  into v_flag_enabled
  from public.feature_flags ff
  where ff.feature_code = p_feature_code;

  if v_flag_enabled is not null and v_flag_enabled = false then
    return false;
  end if;

  if v_commercial and v_approval_status is distinct from 'approved' then
    return false;
  end if;

  if v_company_status = 'Suspended' and v_commercial then
    return false;
  end if;

  select o.override_state, o.source
  into v_override_state, v_grant_source
  from public.company_feature_overrides o
  where o.company_id = p_company_id
    and o.feature_code = p_feature_code
    and o.is_active = true
    and o.starts_at <= now()
    and (o.expires_at is null or o.expires_at > now())
  order by o.created_at desc
  limit 1;

  if found then
    if v_override_state = 'disabled' then
      return false;
    end if;
    if v_override_state = 'enabled' then
      if v_grant_source = 'trial' and public.is_company_commercially_expired(p_company_id) then
        return false;
      end if;
      -- Stale active (period ended, worker not yet run): do not treat package
      -- (paid-bundle) grants as a current paid period. Independent grants remain.
      -- past_due/grace/expired are not `active`, so this does not change them.
      if v_commercial
         and v_grant_source in ('trial', 'package')
         and public.subscription_active_period_lapsed(p_company_id) then
        return false;
      end if;
      return true;
    end if;
  end if;

  if v_commercial then
    return false;
  end if;

  return coalesce(v_default_enabled, false);
end;
$$;

comment on function internal.is_feature_enabled(uuid, text) is
  'Canonical company feature resolver. Overdue active (period ended) fail-closes trial/package commercial access; manual/contract/system grants and past_due/grace policy are unchanged.';

create or replace function internal.run_subscription_lifecycle_enforcement_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path to internal, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_trials jsonb;
  v_period jsonb;
  v_past_due jsonb;
  v_grace jsonb;
begin
  perform public._assert_lifecycle_enforcement_caller();

  if not pg_try_advisory_xact_lock(
    hashtext('run_subscription_lifecycle_enforcement_v1')
  ) then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'concurrent_run',
      'limit', v_limit,
      'note', 'Another lifecycle enforcement run holds the lock; no duplicate transition'
    );
  end if;

  v_trials := public.enforce_trial_expirations_v1(v_limit);
  v_period := public.enforce_active_period_due_v1(v_limit);
  v_past_due := public.enforce_past_due_to_grace_v1(v_limit);
  v_grace := public.enforce_grace_period_expirations_v1(v_limit);

  perform public.write_billing_audit_log(
    'subscription_lifecycle_enforced',
    null,
    null,
    jsonb_build_object(
      'trials', v_trials,
      'active_period_due', v_period,
      'past_due_to_grace', v_past_due,
      'grace_expirations', v_grace,
      'limit', v_limit,
      'note', 'No payment fabricated; renewal requires renew_subscription_from_payment'
    ),
    'system',
    jsonb_build_object('source', 'run_subscription_lifecycle_enforcement_v1')
  );

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'limit', v_limit,
    'trials', v_trials,
    'active_period_due', v_period,
    'past_due_to_grace', v_past_due,
    'grace_expirations', v_grace,
    'renewal', jsonb_build_object(
      'automatic_paid_renewal', false,
      'authoritative_rpc', 'renew_subscription_from_payment',
      'note', 'Scheduler never fabricates payment success'
    )
  );
end;
$$;

comment on function internal.run_subscription_lifecycle_enforcement_v1(integer) is
  'Phase 7.8 orchestrator. Bounded, idempotent, advisory-locked. No payment capture or fabricated renewal.';

comment on function public.run_subscription_lifecycle_enforcement_v1(integer) is
  'Public wrapper for internal.run_subscription_lifecycle_enforcement_v1. Production worker/HTTP cron entry. No payment fabrication.';
