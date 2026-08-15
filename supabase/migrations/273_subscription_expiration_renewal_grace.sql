-- ============================================================
-- 273 — Subscription expiration / renewal / grace lifecycle (Phase 7.8)
-- ============================================================
-- Makes existing lifecycle RPCs operationally complete via bounded,
-- idempotent batch enforcement. Does NOT implement payment providers,
-- fabricated renewals, or a second entitlement system.
--
-- Commercial policy (preserved from Phase 6):
--   past_due / grace_period → still entitled if grants valid
--   expired → trial grants ineffective; package/manual/contract/system preserved
--   companies.status Suspended → never auto-reactivated
--
-- Renewal remains authoritative via renew_subscription_from_payment only.
-- ============================================================

-- Ensure audit event types exist (idempotent)
insert into public.billing_audit_event_types (code, label, description)
values
  (
    'trial_expired',
    'Trial Expired',
    'Trial ended; subscription entered unpaid lifecycle (grace) without payment'
  ),
  (
    'subscription_lifecycle_enforced',
    'Subscription Lifecycle Enforced',
    'Batch lifecycle enforcement run (trial/period/grace) — no payment collected'
  )
on conflict (code) do update
set label = excluded.label, description = excluded.description, is_active = true;

create or replace function public._assert_lifecycle_enforcement_caller()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return;
  end if;
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;
  if not public.can_edit_billing() then
    raise exception 'Insufficient permissions for subscription lifecycle enforcement';
  end if;
end;
$$;

revoke all on function public._assert_lifecycle_enforcement_caller() from public;
grant execute on function public._assert_lifecycle_enforcement_caller() to authenticated, service_role;

-- ── Trial due → grace (reuse renewal-failure path; no fabricated payment) ──

create or replace function public.enforce_trial_expirations_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_skipped integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_result jsonb;
  v_was_suspended boolean;
begin
  perform public._assert_lifecycle_enforcement_caller();

  for v_row in
    select cs.company_id, cs.id as subscription_id, cs.status, cs.trial_ends_at
    from public.company_subscriptions cs
    where cs.status = 'trialing'
      and cs.trial_ends_at is not null
      and cs.trial_ends_at <= now()
    order by cs.trial_ends_at asc
    limit v_limit
    for update of cs skip locked
  loop
    select (c.status = 'Suspended') into v_was_suspended
    from public.companies c where c.id = v_row.company_id;

    v_result := public.record_subscription_renewal_failure_v1(
      v_row.company_id,
      'Trial ended without payment'
    );

    if coalesce((v_result->>'skipped')::boolean, false) then
      v_skipped := v_skipped + 1;
    else
      perform public.write_billing_audit_log(
        'trial_expired',
        v_row.company_id,
        jsonb_build_object(
          'status', 'trialing',
          'trial_ends_at', v_row.trial_ends_at
        ),
        jsonb_build_object(
          'status', coalesce(v_result->>'status', 'grace_period'),
          'grace_period_ends_at', v_result->'grace_period_ends_at',
          'reason', 'Trial ended without payment',
          'source', 'enforce_trial_expirations_v1'
        ),
        'system',
        jsonb_build_object('subscription_id', v_row.subscription_id)
      );

      begin
        perform public.emit_subscription_event(
          v_row.company_id,
          v_row.subscription_id,
          'trial_expired',
          'Trial Expired',
          'Trial ended without payment',
          jsonb_build_object(
            'trial_ends_at', v_row.trial_ends_at,
            'next_status', coalesce(v_result->>'status', 'grace_period'),
            'source', 'enforce_trial_expirations_v1'
          )
        );
      exception when others then
        null;
      end;

      v_count := v_count + 1;
    end if;

    if coalesce(v_was_suspended, false) then
      update public.companies
      set status = 'Suspended', updated_at = now()
      where id = v_row.company_id and status is distinct from 'Suspended';
    end if;
  end loop;

  return jsonb_build_object(
    'processed_count', v_count,
    'skipped_count', v_skipped,
    'limit', v_limit,
    'note', 'Trial → grace via record_subscription_renewal_failure_v1; no payment fabricated'
  );
end;
$$;

revoke all on function public.enforce_trial_expirations_v1(integer) from public;
grant execute on function public.enforce_trial_expirations_v1(integer) to authenticated, service_role;

-- Drop legacy zero-arg overload to avoid PostgreSQL ambiguity with DEFAULT args.
drop function if exists public.enforce_trial_expirations_v1();

-- ── Active period due → past_due (no payment assumed) ─────────

create or replace function public.enforce_active_period_due_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_skipped integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_result jsonb;
  v_due_at timestamptz;
  v_was_suspended boolean;
begin
  perform public._assert_lifecycle_enforcement_caller();

  for v_row in
    select cs.company_id, cs.id as subscription_id, cs.status,
           cs.current_period_end, cs.next_renewal_at
    from public.company_subscriptions cs
    where cs.status = 'active'
      and coalesce(cs.current_period_end, cs.next_renewal_at) is not null
      and coalesce(cs.current_period_end, cs.next_renewal_at) <= now()
    order by coalesce(cs.current_period_end, cs.next_renewal_at) asc
    limit v_limit
    for update of cs skip locked
  loop
    select (c.status = 'Suspended') into v_was_suspended
    from public.companies c where c.id = v_row.company_id;

    v_due_at := coalesce(v_row.current_period_end, v_row.next_renewal_at);
    v_result := public.mark_subscription_past_due_v1(
      v_row.company_id,
      'Billing period ended without authoritative renewal payment'
    );

    if coalesce((v_result->>'skipped')::boolean, false) then
      v_skipped := v_skipped + 1;
    else
      v_count := v_count + 1;
      begin
        perform public.emit_subscription_event(
          v_row.company_id,
          v_row.subscription_id,
          'past_due',
          'Subscription Past Due',
          'Billing period ended without authoritative renewal payment',
          jsonb_build_object(
            'due_at', v_due_at,
            'source', 'enforce_active_period_due_v1',
            'note', 'No payment fabricated'
          )
        );
      exception when others then
        null;
      end;
    end if;

    if coalesce(v_was_suspended, false) then
      update public.companies
      set status = 'Suspended', updated_at = now()
      where id = v_row.company_id and status is distinct from 'Suspended';
    end if;
  end loop;

  return jsonb_build_object(
    'processed_count', v_count,
    'skipped_count', v_skipped,
    'limit', v_limit,
    'note', 'active→past_due only; renewal requires renew_subscription_from_payment'
  );
end;
$$;

revoke all on function public.enforce_active_period_due_v1(integer) from public;
grant execute on function public.enforce_active_period_due_v1(integer) to authenticated, service_role;

-- ── past_due (still unpaid) → grace ───────────────────────────
-- Runs after active→past_due so same-tick upgrades need a later run
-- (or a subsequent call) to enter grace — keeps past_due observable.

create or replace function public.enforce_past_due_to_grace_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_skipped integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_result jsonb;
  v_was_suspended boolean;
begin
  perform public._assert_lifecycle_enforcement_caller();

  for v_row in
    select cs.company_id, cs.id as subscription_id, cs.status,
           cs.current_period_end, cs.next_renewal_at, cs.updated_at
    from public.company_subscriptions cs
    where cs.status = 'past_due'
      and coalesce(cs.current_period_end, cs.next_renewal_at) is not null
      and coalesce(cs.current_period_end, cs.next_renewal_at) <= now()
      -- Avoid same-millisecond past_due→grace in the same orchestrator pass
      and cs.updated_at < now() - interval '1 second'
    order by coalesce(cs.current_period_end, cs.next_renewal_at) asc
    limit v_limit
    for update of cs skip locked
  loop
    select (c.status = 'Suspended') into v_was_suspended
    from public.companies c where c.id = v_row.company_id;

    v_result := public.record_subscription_renewal_failure_v1(
      v_row.company_id,
      'Past due without authoritative renewal payment'
    );

    if coalesce((v_result->>'skipped')::boolean, false) then
      v_skipped := v_skipped + 1;
    else
      v_count := v_count + 1;
    end if;

    if coalesce(v_was_suspended, false) then
      update public.companies
      set status = 'Suspended', updated_at = now()
      where id = v_row.company_id and status is distinct from 'Suspended';
    end if;
  end loop;

  return jsonb_build_object(
    'processed_count', v_count,
    'skipped_count', v_skipped,
    'limit', v_limit,
    'note', 'past_due→grace; uses grace_period_days setting; no payment fabricated'
  );
end;
$$;

revoke all on function public.enforce_past_due_to_grace_v1(integer) from public;
grant execute on function public.enforce_past_due_to_grace_v1(integer) to authenticated, service_role;

-- ── Grace ended → expired (+ deactivate trial grants only) ────

create or replace function public.enforce_grace_period_expirations_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_was_suspended boolean;
  v_trial_deactivated integer := 0;
begin
  perform public._assert_lifecycle_enforcement_caller();

  for v_row in
    select cs.company_id, cs.id as subscription_id, cs.status, cs.grace_period_ends_at
    from public.company_subscriptions cs
    where cs.status = 'grace_period'
      and cs.grace_period_ends_at is not null
      and cs.grace_period_ends_at <= now()
    order by cs.grace_period_ends_at asc
    limit v_limit
    for update of cs skip locked
  loop
    select (c.status = 'Suspended') into v_was_suspended
    from public.companies c where c.id = v_row.company_id;

    perform public.assert_subscription_status_transition(v_row.status, 'expired');

    update public.company_subscriptions
    set status = 'expired', updated_at = now()
    where id = v_row.subscription_id;

    -- Deactivate trial grants only (resolver also denies trial when commercially expired).
    -- Do NOT revoke package / manual / contract / system.
    update public.company_feature_overrides
    set
      is_active = false,
      expires_at = least(coalesce(expires_at, now()), now()),
      updated_at = now(),
      notes = case
        when notes is null or length(trim(notes)) = 0 then 'deactivated on subscription expired'
        else notes || ' | deactivated on subscription expired'
      end
    where company_id = v_row.company_id
      and source = 'trial'
      and is_active = true;

    get diagnostics v_trial_deactivated = row_count;

    perform public.sync_company_subscription_denormalized(v_row.company_id);

    if coalesce(v_was_suspended, false) then
      update public.companies
      set status = 'Suspended', updated_at = now()
      where id = v_row.company_id;
    end if;

    perform public.emit_subscription_event(
      v_row.company_id, v_row.subscription_id, 'expired', 'Subscription Expired',
      'Grace period ended',
      jsonb_build_object(
        'source', 'enforce_grace_period_expirations_v1',
        'grace_period_ends_at', v_row.grace_period_ends_at,
        'trial_grants_deactivated', v_trial_deactivated
      )
    );

    perform public.write_billing_audit_log(
      'subscription_expired',
      v_row.company_id,
      jsonb_build_object('status', 'grace_period', 'grace_period_ends_at', v_row.grace_period_ends_at),
      jsonb_build_object(
        'status', 'expired',
        'trial_grants_deactivated', v_trial_deactivated,
        'note', 'package/manual/contract/system grants preserved'
      ),
      'system',
      jsonb_build_object('subscription_id', v_row.subscription_id)
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'expired_count', v_count,
    'limit', v_limit,
    'note', 'grace→expired; trial grants deactivated; other sources preserved'
  );
end;
$$;

revoke all on function public.enforce_grace_period_expirations_v1(integer) from public;
grant execute on function public.enforce_grace_period_expirations_v1(integer) to authenticated, service_role;

-- Drop legacy zero-arg overload to avoid PostgreSQL ambiguity with DEFAULT args.
drop function if exists public.enforce_grace_period_expirations_v1();

-- ── Orchestrator (idempotent batch) ───────────────────────────

create or replace function public.run_subscription_lifecycle_enforcement_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_trials jsonb;
  v_period jsonb;
  v_past_due jsonb;
  v_grace jsonb;
begin
  perform public._assert_lifecycle_enforcement_caller();

  -- Order matters: trials first; then active→past_due; then past_due→grace
  -- (past_due→grace skips rows updated in the last second); then grace→expired.
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

revoke all on function public.run_subscription_lifecycle_enforcement_v1(integer) from public;
grant execute on function public.run_subscription_lifecycle_enforcement_v1(integer) to authenticated, service_role;

comment on function public.run_subscription_lifecycle_enforcement_v1(integer) is
  'Phase 7.8: bounded idempotent lifecycle enforcement (trial/period/grace). No payment capture or fabricated renewal.';
