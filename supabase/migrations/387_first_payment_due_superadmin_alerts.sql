/**
 * Migration 387 — First subscription payment due + super-admin overdue alerts.
 *
 * LOCAL ONLY.
 * Reuses company_subscriptions clocks + notifications + existing grace→expired enforcement.
 * Does NOT invent parallel billing statuses.
 */

-- ── 1) Super admin: set first / next payment due clock ──────────────────────
create or replace function public.set_company_first_payment_due_v1(
  p_company_id uuid,
  p_due_at timestamptz,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;
  if p_due_at is null then
    raise exception 'due_at_required';
  end if;
  if p_due_at < (now() - interval '1 day') then
    raise exception 'due_at_in_past';
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  order by created_at desc nulls last
  limit 1
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  if v_sub.status not in ('trialing', 'active', 'past_due', 'grace_period') then
    raise exception 'invalid_subscription_status';
  end if;

  update public.company_subscriptions
  set
    trial_ends_at = case when status = 'trialing' then p_due_at else trial_ends_at end,
    next_renewal_at = p_due_at,
    current_period_end = coalesce(current_period_end, p_due_at),
    updated_at = now()
  where id = v_sub.id;

  update public.companies
  set
    subscription_expires_at = p_due_at,
    updated_at = now()
  where id = p_company_id;

  perform public.emit_subscription_event(
    p_company_id,
    v_sub.id,
    'first_payment_due_set',
    'First payment due set',
    coalesce(v_note, 'Super admin set subscription payment due date'),
    jsonb_build_object(
      'due_at', p_due_at,
      'note', v_note,
      'previous_trial_ends_at', v_sub.trial_ends_at,
      'previous_next_renewal_at', v_sub.next_renewal_at,
      'source', 'set_company_first_payment_due_v1'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'company_id', p_company_id,
    'subscription_id', v_sub.id,
    'due_at', p_due_at,
    'note', v_note
  );
end;
$$;

revoke all on function public.set_company_first_payment_due_v1(uuid, timestamptz, text) from public;
grant execute on function public.set_company_first_payment_due_v1(uuid, timestamptz, text) to authenticated, service_role;

comment on function public.set_company_first_payment_due_v1(uuid, timestamptz, text) is
  'Super admin sets the first/next subscription payment due clock used by tenant payment notices.';

-- ── 2) Notify every super admin about a company subscription event ──────────
create or replace function public.notify_super_admins_v1(
  p_company_id uuid,
  p_title text,
  p_body text,
  p_type text default 'warning',
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_uid uuid;
  v_sa_company_id uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_type text := coalesce(nullif(trim(p_type), ''), 'warning');
  v_message text;
begin
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;
  if v_title is null or v_body is null then
    raise exception 'title_and_message_required';
  end if;
  if v_type not in ('success', 'warning', 'error', 'info') then
    raise exception 'unsupported_notification_type';
  end if;

  -- message stores i18n/json payload used by the client href resolver.
  -- Subject company stays in params so clicking opens that company's subscription detail.
  v_message := jsonb_build_object(
    'body', v_body,
    'params', coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'companyId', p_company_id,
      'entityType', 'company',
      'entityId', p_company_id,
      'navigationTarget', '/dashboard/subscriptions/' || p_company_id::text
    )
  )::text;

  for v_uid, v_sa_company_id in
    select p.id, p.company_id
    from public.profiles p
    where coalesce(p.is_super_admin, false) = true
  loop
    -- Deliver into the super-admin's own company inbox so the platform bell shows it.
    -- Payload.companyId / navigationTarget still point at the overdue subject company.
    perform public.insert_notification(
      coalesce(v_sa_company_id, p_company_id),
      v_uid,
      v_title,
      v_message,
      v_type,
      'subscription'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.notify_super_admins_v1(uuid, text, text, text, jsonb) from public;
grant execute on function public.notify_super_admins_v1(uuid, text, text, text, jsonb) to authenticated, service_role;

comment on function public.notify_super_admins_v1(uuid, text, text, text, jsonb) is
  'Creates subscription notifications addressed to every super admin for a subject company.';

-- ── 3) Extend grace→expired: notify super admins + suspend unpaid first-pay ─
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
  v_was_never_active boolean;
  v_company_name text;
  v_notified integer := 0;
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

    -- Never reached active paid → hard-lock whole company (users/branches).
    select not exists (
      select 1
      from public.subscription_events se
      where se.company_id = v_row.company_id
        and se.event_type in (
          'activated',
          'renewed',
          'trial_converted',
          'payment_succeeded',
          'converted_to_paid'
        )
    )
    into v_was_never_active;

    if coalesce(v_was_never_active, true) and not coalesce(v_was_suspended, false) then
      begin
        perform public.suspend_billing_subscription(
          v_row.company_id,
          'Subscription payment not received after the payment window ended.'
        );
      exception
        when others then
          null;
      end;
    end if;

    select c.name into v_company_name from public.companies c where c.id = v_row.company_id;

    begin
      v_notified := public.notify_super_admins_v1(
        v_row.company_id,
        'Company subscription unpaid',
        coalesce(v_company_name, 'A company')
          || ' exhausted its payment window without renewing.',
        'warning',
        jsonb_build_object(
          'companyName', v_company_name,
          'subscriptionId', v_row.subscription_id
        )
      );
    exception
      when others then
        v_notified := 0;
    end;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'expired_count', v_count,
    'limit', v_limit,
    'super_admin_notifications', v_notified,
    'note', 'grace→expired; unpaid first-payment companies suspended; super admins notified'
  );
end;
$$;

comment on function public.enforce_grace_period_expirations_v1(integer) is
  'Grace ended → expired. Unpaid first-payment companies are suspended; super admins notified.';
