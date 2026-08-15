-- ============================================================
-- 270 — Subscription lifecycle admin hardening (Phase 7.5)
-- ============================================================
-- company_subscriptions = lifecycle SoT (NOT feature authorization).
-- Runtime commercial access remains Phase 6:
--   company_feature_overrides + is_feature_enabled / require_company_feature_v1
--
-- Does NOT implement payment gateways, checkout, renewal workers, or dunning.
-- ============================================================

comment on table public.company_subscriptions is
  'SaaS subscription lifecycle (one row per company). Status is lifecycle only — does NOT replace Phase 6 commercial entitlement resolver.';

comment on column public.company_subscriptions.status is
  'Lifecycle: trialing|active|past_due|grace_period|expired|canceled. Not a feature allowlist.';

comment on column public.company_subscriptions.billing_cycle is
  'Authoritative cycle: monthly|yearly. Catalog list prices live on plans.';

comment on column public.company_subscriptions.plan_id is
  'Authoritative FK → plans.id. companies.subscription_plan is a display mirror only.';

-- ── 1. Date integrity (nullable-safe) ─────────────────────────

alter table public.company_subscriptions
  drop constraint if exists company_subscriptions_period_order_check;

alter table public.company_subscriptions
  add constraint company_subscriptions_period_order_check
  check (
    current_period_start is null
    or current_period_end is null
    or current_period_end >= current_period_start
  );

-- ── 2. Transition matrix helper ───────────────────────────────
-- Mirrors production writers: renew → active; failure → grace;
-- grace end → expired; extend → trialing; cancel → canceled;
-- past_due optional intermediate.

create or replace function public.assert_subscription_status_transition(
  p_from text,
  p_to text
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_from is null or p_to is null then
    raise exception 'subscription_status_transition_requires_from_and_to';
  end if;

  if p_from = p_to then
    return;
  end if;

  if p_from not in ('trialing', 'active', 'past_due', 'grace_period', 'expired', 'canceled')
     or p_to not in ('trialing', 'active', 'past_due', 'grace_period', 'expired', 'canceled') then
    raise exception 'invalid_subscription_status: % → %', p_from, p_to;
  end if;

  if p_to = 'active' and p_from in ('trialing', 'past_due', 'grace_period', 'expired', 'canceled') then
    return; -- renew / reactivate
  end if;

  if p_to = 'trialing' and p_from in ('expired', 'canceled') then
    return; -- extend_company_trial revive
  end if;

  if p_to = 'past_due' and p_from in ('active', 'trialing', 'grace_period') then
    return;
  end if;

  if p_to = 'grace_period' and p_from in ('active', 'trialing', 'past_due') then
    return; -- renewal failure / trial end without payment
  end if;

  if p_to = 'expired' and p_from in ('grace_period', 'past_due', 'trialing', 'active', 'canceled') then
    return;
  end if;

  if p_to = 'canceled' and p_from in ('trialing', 'active', 'past_due', 'grace_period', 'expired') then
    return;
  end if;

  raise exception 'illegal_subscription_status_transition: % → %', p_from, p_to;
end;
$$;

revoke all on function public.assert_subscription_status_transition(text, text) from public;
grant execute on function public.assert_subscription_status_transition(text, text) to authenticated, service_role;

-- ── 3. Sync: preserve administrative Suspended ────────────────
-- companies.status Suspended is operational (Phase 6). Previously sync
-- forced Active for active/grace subscriptions and undid admin suspend.
-- Restore must clear Suspended before calling sync.

create or replace function public.sync_company_subscription_denormalized(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_plan_name text;
  v_company_status text;
  v_was_suspended boolean := false;
begin
  select * into v_sub from public.company_subscriptions where company_id = p_company_id;
  if not found then
    return;
  end if;

  select p.name into v_plan_name from public.plans p where p.id = v_sub.plan_id;

  select (c.status = 'Suspended') into v_was_suspended
  from public.companies c
  where c.id = p_company_id;

  v_company_status := case
    when v_sub.status = 'expired' then 'Suspended'
    when coalesce(v_was_suspended, false) then 'Suspended'
    when v_sub.status = 'trialing' then 'Trial'
    else 'Active'
  end;

  update public.companies c
  set
    plan_id = v_sub.plan_id,
    subscription_plan = coalesce(v_plan_name, c.subscription_plan),
    subscription_status = v_sub.status,
    billing_cycle = v_sub.billing_cycle,
    subscription_expires_at = coalesce(v_sub.current_period_end, v_sub.next_renewal_at),
    status = v_company_status,
    updated_at = now()
  where c.id = p_company_id;
end;
$$;

-- ── 4. Audit event types ──────────────────────────────────────

insert into public.billing_audit_event_types (code, label, description)
values
  ('subscription_canceled', 'Subscription Canceled', 'Company subscription marked canceled (lifecycle only)'),
  ('subscription_past_due', 'Subscription Past Due', 'Company subscription marked past due'),
  ('subscription_status_changed', 'Subscription Status Changed', 'Explicit subscription lifecycle status change')
on conflict (code) do update
set label = excluded.label, description = excluded.description, is_active = true;

-- ── 5. cancel_company_subscription_v1 ─────────────────────────
-- Immediate cancel by default. Does NOT delete tenant data or revoke
-- manual/contract/system/package grants. Access after cancel follows
-- Phase 6 is_company_commercially_expired (canceled + period ended).

create or replace function public.cancel_company_subscription_v1(
  p_company_id uuid,
  p_reason text default null,
  p_at_period_end boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_previous jsonb;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Administrative cancellation');
  v_now timestamptz := now();
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public.can_edit_billing() then
    raise exception 'Insufficient permissions to cancel subscription';
  end if;

  if auth.role() <> 'service_role' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot cancel subscription for this company';
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  for update;

  if not found then
    raise exception 'Subscription not found for company %', p_company_id;
  end if;

  if v_sub.status = 'canceled' then
    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'canceled',
      'skipped', true,
      'reason', 'already_canceled'
    );
  end if;

  perform public.assert_subscription_status_transition(v_sub.status, 'canceled');

  v_previous := jsonb_build_object(
    'status', v_sub.status,
    'auto_renewal', v_sub.auto_renewal,
    'canceled_at', v_sub.canceled_at,
    'current_period_end', v_sub.current_period_end
  );

  update public.company_subscriptions
  set
    status = 'canceled',
    auto_renewal = false,
    canceled_at = v_now,
    current_period_end = case
      when coalesce(p_at_period_end, false) then coalesce(current_period_end, next_renewal_at, v_now)
      else coalesce(current_period_end, v_now)
    end,
    updated_at = v_now
  where id = v_sub.id
  returning * into v_sub;

  perform public.sync_company_subscription_denormalized(p_company_id);

  perform public.emit_subscription_event(
    p_company_id,
    v_sub.id,
    'canceled',
    'Subscription Canceled',
    v_reason,
    jsonb_build_object(
      'at_period_end', coalesce(p_at_period_end, false),
      'reason', v_reason
    )
  );

  perform public.write_billing_audit_log(
    'subscription_canceled',
    p_company_id,
    v_previous,
    jsonb_build_object(
      'status', 'canceled',
      'at_period_end', coalesce(p_at_period_end, false),
      'reason', v_reason,
      'current_period_end', v_sub.current_period_end
    ),
    'manual',
    jsonb_build_object('subscription_id', v_sub.id)
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'subscription_id', v_sub.id,
    'status', 'canceled',
    'at_period_end', coalesce(p_at_period_end, false),
    'current_period_end', v_sub.current_period_end,
    'note', 'Lifecycle only — does not delete data or revoke non-expired grants by itself'
  );
end;
$$;

revoke all on function public.cancel_company_subscription_v1(uuid, text, boolean) from public;
grant execute on function public.cancel_company_subscription_v1(uuid, text, boolean) to authenticated, service_role;

-- ── 6. mark_subscription_past_due_v1 ──────────────────────────

create or replace function public.mark_subscription_past_due_v1(
  p_company_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_previous jsonb;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Payment overdue');
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public.can_edit_billing() then
    raise exception 'Insufficient permissions to mark past due';
  end if;

  if auth.role() <> 'service_role' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot update subscription for this company';
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  for update;

  if not found then
    raise exception 'Subscription not found for company %', p_company_id;
  end if;

  if v_sub.status in ('expired', 'canceled') then
    return jsonb_build_object('company_id', p_company_id, 'status', v_sub.status, 'skipped', true);
  end if;

  if v_sub.status = 'past_due' then
    return jsonb_build_object('company_id', p_company_id, 'status', 'past_due', 'skipped', true);
  end if;

  perform public.assert_subscription_status_transition(v_sub.status, 'past_due');

  v_previous := jsonb_build_object('status', v_sub.status);

  update public.company_subscriptions
  set status = 'past_due', updated_at = now()
  where id = v_sub.id;

  perform public.sync_company_subscription_denormalized(p_company_id);

  perform public.write_billing_audit_log(
    'subscription_past_due',
    p_company_id,
    v_previous,
    jsonb_build_object('status', 'past_due', 'reason', v_reason),
    'manual',
    jsonb_build_object('subscription_id', v_sub.id)
  );

  return jsonb_build_object('company_id', p_company_id, 'status', 'past_due');
end;
$$;

revoke all on function public.mark_subscription_past_due_v1(uuid, text) from public;
grant execute on function public.mark_subscription_past_due_v1(uuid, text) to authenticated, service_role;

-- ── 7. Harden renewal-failure → grace (assert transition) ─────

create or replace function public.record_subscription_renewal_failure_v1(
  p_company_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_grace_days integer;
  v_grace_ends timestamptz;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Renewal payment failed');
  v_previous jsonb;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;
  if auth.role() <> 'service_role' and not public.can_edit_billing() then
    raise exception 'Insufficient permissions to record renewal failure';
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  for update;

  if not found then
    raise exception 'Subscription not found for company %', p_company_id;
  end if;

  if v_sub.status in ('expired', 'canceled') then
    return jsonb_build_object('company_id', p_company_id, 'status', v_sub.status, 'skipped', true);
  end if;

  if v_sub.status = 'grace_period' then
    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'grace_period',
      'grace_period_ends_at', v_sub.grace_period_ends_at,
      'skipped', true
    );
  end if;

  perform public.assert_subscription_status_transition(v_sub.status, 'grace_period');

  v_grace_days := greatest(coalesce(public.resolve_billing_setting_integer('grace_period_days', p_company_id), 7), 1);
  v_grace_ends := now() + (v_grace_days || ' days')::interval;

  v_previous := jsonb_build_object('status', v_sub.status, 'grace_period_ends_at', v_sub.grace_period_ends_at);

  update public.company_subscriptions
  set
    status = 'grace_period',
    grace_period_ends_at = v_grace_ends,
    updated_at = now()
  where id = v_sub.id;

  perform public.sync_company_subscription_denormalized(p_company_id);

  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'grace_period_started', 'Grace Period Started',
    v_reason,
    jsonb_build_object(
      'grace_period_days', v_grace_days,
      'grace_period_ends_at', v_grace_ends,
      'reason', v_reason
    )
  );

  perform public.write_billing_audit_log(
    'grace_period_started', p_company_id, v_previous,
    jsonb_build_object(
      'status', 'grace_period',
      'grace_period_ends_at', v_grace_ends,
      'grace_period_days', v_grace_days,
      'reason', v_reason
    ),
    'system', jsonb_build_object('subscription_id', v_sub.id)
  );

  begin
    perform public.notification_bus_emit_v1(
      'billing.subscription.grace_period', p_company_id, auth.uid(),
      jsonb_build_object(
        'subscription_id', v_sub.id,
        'grace_period_ends_at', v_grace_ends,
        'detail', v_reason
      ),
      null, 'billing.subscription.grace_period:' || p_company_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'company_id', p_company_id,
    'status', 'grace_period',
    'grace_period_days', v_grace_days,
    'grace_period_ends_at', v_grace_ends
  );
end;
$$;

-- ── 8. Harden grace → expired ─────────────────────────────────

create or replace function public.enforce_grace_period_expirations_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select cs.company_id, cs.id as subscription_id, cs.status
    from public.company_subscriptions cs
    where cs.status = 'grace_period'
      and cs.grace_period_ends_at is not null
      and cs.grace_period_ends_at <= now()
  loop
    perform public.assert_subscription_status_transition(v_row.status, 'expired');

    update public.company_subscriptions
    set status = 'expired', updated_at = now()
    where id = v_row.subscription_id;

    perform public.sync_company_subscription_denormalized(v_row.company_id);

    perform public.emit_subscription_event(
      v_row.company_id, v_row.subscription_id, 'expired', 'Subscription Expired',
      'Grace period ended',
      jsonb_build_object('source', 'enforce_grace_period_expirations_v1')
    );

    perform public.write_billing_audit_log(
      'subscription_expired',
      v_row.company_id,
      jsonb_build_object('status', 'grace_period'),
      jsonb_build_object('status', 'expired'),
      'system',
      jsonb_build_object('subscription_id', v_row.subscription_id)
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('expired_count', v_count);
end;
$$;

-- ── 9. Suspend / restore — service_role + Suspended preserve ──

create or replace function public.suspend_billing_subscription(
  p_company_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_previous jsonb;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Administrative suspension');
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;
  if auth.role() <> 'service_role' and not public.can_edit_billing() then
    raise exception 'Insufficient permissions to suspend subscription';
  end if;
  if auth.role() <> 'service_role' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot suspend subscription for this company';
  end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then raise exception 'Subscription not found for company %', p_company_id; end if;

  select jsonb_build_object('company_status', c.status, 'subscription_status', v_sub.status)
  into v_previous
  from public.companies c where c.id = p_company_id;

  update public.companies set status = 'Suspended', updated_at = now() where id = p_company_id;

  -- Do not change company_subscriptions.status — Suspended is operational (Phase 6).
  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'suspended', 'Subscription Suspended', v_reason,
    jsonb_build_object('reason', p_reason)
  );

  perform public.write_billing_audit_log(
    'subscription_suspended', p_company_id, v_previous,
    jsonb_build_object('company_status', 'Suspended', 'reason', p_reason),
    'manual', jsonb_build_object('subscription_id', v_sub.id)
  );

  begin
    perform public.notification_bus_emit_v1(
      'billing.subscription.suspended', p_company_id, auth.uid(),
      jsonb_build_object('subscription_id', v_sub.id, 'reason', v_reason, 'detail', v_reason),
      null, 'billing.subscription.suspended:' || p_company_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('company_id', p_company_id, 'company_status', 'Suspended');
end;
$$;

create or replace function public.restore_billing_subscription(
  p_company_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_previous jsonb;
  v_new_status text;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Administrative restore');
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;
  if auth.role() <> 'service_role' and not public.can_edit_billing() then
    raise exception 'Insufficient permissions to restore subscription';
  end if;
  if auth.role() <> 'service_role' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot restore subscription for this company';
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  for update;

  if not found then
    raise exception 'Subscription not found for company %', p_company_id;
  end if;

  select jsonb_build_object('company_status', c.status, 'subscription_status', v_sub.status)
  into v_previous
  from public.companies c
  where c.id = p_company_id;

  -- Clear administrative Suspended so sync can rematerialize Trial/Active from lifecycle.
  -- Does not invent a subscription; does not change company_subscriptions.status.
  update public.companies
  set
    status = case
      when v_sub.status = 'expired' then 'Suspended'
      when v_sub.status = 'trialing' then 'Trial'
      else 'Active'
    end,
    updated_at = now()
  where id = p_company_id
    and status = 'Suspended';

  perform public.sync_company_subscription_denormalized(p_company_id);

  select status into v_new_status from public.companies where id = p_company_id;

  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'restored', 'Subscription Restored', v_reason,
    jsonb_build_object('reason', p_reason, 'company_status', v_new_status)
  );

  perform public.write_billing_audit_log(
    'subscription_restored', p_company_id, v_previous,
    jsonb_build_object('company_status', v_new_status, 'reason', p_reason),
    'manual', jsonb_build_object('subscription_id', v_sub.id)
  );

  begin
    perform public.notification_bus_emit_v1(
      'billing.subscription.restored', p_company_id, auth.uid(),
      jsonb_build_object('subscription_id', v_sub.id, 'reason', v_reason, 'detail', v_reason),
      null, 'billing.subscription.restored:' || p_company_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'company_id', p_company_id,
    'company_status', v_new_status,
    'subscription_status', v_sub.status
  );
end;
$$;

-- ── 10. extend_company_trial — assert transition when reviving ─

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
  v_next_status text;
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

  if v_sub.status in ('canceled') then
    raise exception 'cannot_extend_canceled_subscription';
  end if;

  v_next_status := case
    when v_sub.status in ('trialing', 'expired') then 'trialing'
    else v_sub.status
  end;

  if v_next_status is distinct from v_sub.status then
    perform public.assert_subscription_status_transition(v_sub.status, v_next_status);
  end if;

  v_previous := jsonb_build_object(
    'trial_ends_at', v_sub.trial_ends_at,
    'status', v_sub.status,
    'current_period_end', v_sub.current_period_end
  );

  update public.company_subscriptions
  set
    trial_ends_at = p_new_ends_at,
    status = v_next_status,
    current_period_end = case
      when v_next_status = 'trialing' or trial_ends_at is not null then p_new_ends_at
      else current_period_end
    end,
    next_renewal_at = case
      when auto_renewal and (v_next_status = 'trialing' or trial_ends_at is not null)
        then p_new_ends_at
      else next_renewal_at
    end,
    updated_at = now()
  where company_id = p_company_id;

  -- Preserve Suspended; mirror trial fields without inventing package grants.
  update public.companies
  set
    status = case when status = 'Suspended' then status else 'Trial' end,
    subscription_status = case when v_next_status = 'trialing' then 'trialing' else subscription_status end,
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
      'status', v_next_status,
      'trial_grants_updated', v_updated_grants
    ),
    'manual',
    jsonb_build_object('source', 'extend_company_trial_v1')
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'trial_ends_at', p_new_ends_at,
    'status', v_next_status,
    'trial_grants_updated', v_updated_grants
  );
end;
$$;

-- ── 11. Status transition guard (all writers) ─────────────────

create or replace function public._company_subscriptions_status_transition_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status then
    perform public.assert_subscription_status_transition(old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists company_subscriptions_status_transition_guard
  on public.company_subscriptions;

create trigger company_subscriptions_status_transition_guard
  before update of status on public.company_subscriptions
  for each row
  execute function public._company_subscriptions_status_transition_guard();

-- ── 12. Integrity verification (report only) ──────────────────

create or replace function public.verify_subscription_lifecycle_integrity_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_orphan int;
  v_bad_plan int;
  v_bad_cycle int;
  v_bad_period int;
  v_dup int;
  v_mirror_mismatch int;
  v_snapshot_orphan int;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role'
     and not (
       public.is_super_admin()
       or public.can_edit_billing()
       or public.can_view_billing_audit(null)
     ) then
    raise exception 'Insufficient permissions';
  end if;

  select count(*)::int into v_orphan
  from public.company_subscriptions cs
  where not exists (select 1 from public.companies c where c.id = cs.company_id);

  select count(*)::int into v_bad_plan
  from public.company_subscriptions cs
  where cs.plan_id is not null
    and not exists (select 1 from public.plans p where p.id = cs.plan_id);

  select count(*)::int into v_bad_cycle
  from public.company_subscriptions
  where billing_cycle not in ('monthly', 'yearly');

  select count(*)::int into v_bad_period
  from public.company_subscriptions
  where current_period_start is not null
    and current_period_end is not null
    and current_period_end < current_period_start;

  select count(*)::int into v_dup
  from (
    select company_id from public.company_subscriptions
    group by company_id having count(*) > 1
  ) d;

  select count(*)::int into v_mirror_mismatch
  from public.company_subscriptions cs
  join public.companies c on c.id = cs.company_id
  left join public.plans p on p.id = cs.plan_id
  where cs.status is distinct from c.subscription_status
     or (p.name is not null and c.subscription_plan is distinct from p.name);

  select count(*)::int into v_snapshot_orphan
  from public.company_subscriptions cs
  where cs.plan_id is null
    and jsonb_typeof(cs.package_feature_snapshot) = 'array'
    and jsonb_array_length(cs.package_feature_snapshot) > 0;

  return jsonb_build_object(
    'ok', (
      v_orphan = 0 and v_bad_plan = 0 and v_bad_cycle = 0
      and v_bad_period = 0 and v_dup = 0
    ),
    'orphan_subscriptions', v_orphan,
    'invalid_plan_id', v_bad_plan,
    'invalid_billing_cycle', v_bad_cycle,
    'invalid_period_range', v_bad_period,
    'duplicate_company_subscriptions', v_dup,
    'denormalized_mirror_mismatches', v_mirror_mismatch,
    'snapshot_without_plan', v_snapshot_orphan,
    'note', 'company_subscriptions is lifecycle only; Phase 6 resolver remains commercial access authority'
  );
end;
$$;

revoke all on function public.verify_subscription_lifecycle_integrity_v1() from public;
grant execute on function public.verify_subscription_lifecycle_integrity_v1() to authenticated, service_role;
