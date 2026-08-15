-- ============================================================
-- 276 — SaaS verified payment → subscription settlement (Part 3)
-- ============================================================
-- Single provider-neutral boundary:
--   PAYMENT_VERIFIED (checkout succeeded)
--     → settle_saas_verified_payment_v1
--     → convert_trial_to_paid_v1 (trial only)
--     → renew_subscription_from_payment (list_price, Part 1)
-- Does NOT implement portal UI / recurring / refunds / proration.
-- ============================================================

-- ── 1. Settlement markers on checkout sessions ────────────────

alter table public.billing_checkout_sessions
  add column if not exists settled_at timestamptz;

alter table public.billing_checkout_sessions
  add column if not exists billing_payment_id uuid
    references public.billing_payments(id) on delete set null;

alter table public.billing_checkout_sessions
  add column if not exists settlement_code text;

create index if not exists idx_billing_checkout_sessions_settlement
  on public.billing_checkout_sessions (status, settled_at)
  where settled_at is not null;

comment on column public.billing_checkout_sessions.billing_payment_id is
  'Part 3: billing_payments.id produced by settle_saas_verified_payment_v1 (idempotent marker).';

-- ── 2. Extend renew with optional period advance flag ─────────
-- Trial→paid: convert sets period; renew records payment without double-extend.
-- Drop any prior Part 1 signature so only one overload remains.

drop function if exists public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb, text, text, text, uuid
);
drop function if exists public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb, text, text, text, uuid, boolean
);

create or replace function public.renew_subscription_from_payment(
  p_company_id uuid,
  p_amount numeric default null,
  p_currency text default null,
  p_payment_method_label text default null,
  p_provider text default null,
  p_provider_payment_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_payment_method_code text default null,
  p_idempotency_key text default null,
  p_amount_mode text default 'manual',
  p_expected_subscription_id uuid default null,
  p_advance_period boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_currency text;
  v_tax_rate numeric;
  v_subtotal numeric;
  v_tax_amount numeric;
  v_total numeric;
  v_expected_amount numeric;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_receipt_id uuid;
  v_invoice_number text;
  v_receipt_number text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_method_id uuid;
  v_now timestamptz := now();
  v_previous_status text;
  v_method_label text;
  v_provider_code text;
  v_bus_detail text;
  v_method_code text;
  v_payment_terms_days integer;
  v_due_at timestamptz;
  v_amount_mode text := lower(trim(coalesce(nullif(trim(p_amount_mode), ''), 'manual')));
  v_idempotency_key text := nullif(trim(p_idempotency_key), '');
  v_provider_payment_id text := nullif(trim(p_provider_payment_id), '');
  v_existing_id uuid;
  v_existing_status text;
  v_existing_company_id uuid;
  v_advance boolean := coalesce(p_advance_period, true);
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public.can_record_billing_payment() then
    raise exception 'Insufficient permissions to record subscription payment';
  end if;

  if auth.role() <> 'service_role' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot record payment for this company';
  end if;

  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if v_amount_mode not in ('manual', 'list_price') then
    raise exception 'Invalid amount_mode: % (expected manual|list_price)', v_amount_mode;
  end if;

  if v_idempotency_key is not null then
    select bp.id, bp.status into v_existing_id, v_existing_status
    from public.billing_payments bp
    where bp.company_id = p_company_id
      and trim(bp.idempotency_key) = v_idempotency_key
    limit 1;

    if v_existing_id is not null then
      if v_existing_status <> 'succeeded' then
        raise exception 'Idempotency key % already used by non-succeeded payment %',
          v_idempotency_key, v_existing_id;
      end if;
      return public._billing_payment_settlement_result_v1(v_existing_id);
    end if;
  end if;

  if v_provider_payment_id is not null then
    select bp.id, bp.company_id
    into v_existing_id, v_existing_company_id
    from public.billing_payments bp
    where trim(bp.provider_payment_id) = v_provider_payment_id
      and bp.company_id <> p_company_id
    limit 1;

    if v_existing_id is not null then
      raise exception 'Provider payment % belongs to another company', v_provider_payment_id;
    end if;

    v_existing_id := null;
    v_existing_status := null;

    if nullif(trim(p_provider), '') is not null then
      select bp.id, bp.status
      into v_existing_id, v_existing_status
      from public.billing_payments bp
      where bp.company_id = p_company_id
        and trim(bp.provider_payment_id) = v_provider_payment_id
        and coalesce(nullif(trim(bp.provider), ''), '') = nullif(trim(p_provider), '')
      limit 1;
    else
      select bp.id, bp.status
      into v_existing_id, v_existing_status
      from public.billing_payments bp
      where bp.company_id = p_company_id
        and trim(bp.provider_payment_id) = v_provider_payment_id
      order by bp.created_at asc
      limit 1;
    end if;

    if v_existing_id is not null then
      if v_existing_status <> 'succeeded' then
        raise exception 'Provider payment % already used by non-succeeded payment %',
          v_provider_payment_id, v_existing_id;
      end if;
      return public._billing_payment_settlement_result_v1(v_existing_id);
    end if;
  end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then
    raise exception 'Subscription not found for company %', p_company_id;
  end if;

  if p_expected_subscription_id is not null and v_sub.id <> p_expected_subscription_id then
    raise exception 'Subscription mismatch for company %', p_company_id;
  end if;

  if v_sub.company_id <> p_company_id then
    raise exception 'Subscription company isolation violation';
  end if;

  v_previous_status := v_sub.status;

  if v_sub.plan_id is null then
    raise exception 'Subscription has no plan/package; cannot settle payment';
  end if;

  select * into v_plan from public.plans where id = v_sub.plan_id;
  if not found then
    raise exception 'Plan not found for subscription';
  end if;

  v_currency := coalesce(
    nullif(trim(public.resolve_billing_setting_value('default_currency', p_company_id)#>>'{}'), ''),
    nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), '')
  );
  if v_currency is null then
    raise exception 'default_currency billing setting is not configured';
  end if;

  if nullif(trim(p_currency), '') is not null
     and lower(trim(p_currency)) <> lower(v_currency) then
    raise exception 'Currency mismatch: expected %, got %', v_currency, trim(p_currency);
  end if;

  if v_amount_mode = 'list_price' then
    if v_plan.pricing_mode <> 'fixed' then
      raise exception
        'list_price settlement requires fixed-price package (got pricing_mode=%)',
        v_plan.pricing_mode;
    end if;

    if v_sub.billing_cycle not in ('monthly', 'yearly') then
      raise exception 'Invalid subscription billing_cycle: %', v_sub.billing_cycle;
    end if;

    v_expected_amount := case
      when v_sub.billing_cycle = 'yearly' then v_plan.price_yearly
      else v_plan.price_monthly
    end;

    if v_expected_amount is null or v_expected_amount <= 0 then
      raise exception 'Authoritative package list price is missing or non-positive';
    end if;

    if p_amount is not null and abs(p_amount - v_expected_amount) > 0.009 then
      raise exception 'Amount mismatch: expected %, got %', v_expected_amount, p_amount;
    end if;

    v_subtotal := v_expected_amount;
  else
    if p_amount is null then
      raise exception 'Amount is required for manual payment settlement';
    end if;
    if p_amount < 0 then
      raise exception 'Amount cannot be negative';
    end if;
    v_subtotal := p_amount;
  end if;

  v_tax_rate := coalesce(
    nullif(public.resolve_billing_setting_value('vat_percentage', p_company_id)::text, 'null')::numeric,
    0
  );

  v_tax_amount := round(v_subtotal * v_tax_rate / 100.0, 2);
  v_total := v_subtotal + v_tax_amount;

  if v_advance then
    v_period_start := coalesce(v_sub.current_period_end, v_now);
    v_period_end := case when v_sub.billing_cycle = 'yearly'
      then v_period_start + interval '1 year'
      else v_period_start + interval '1 month'
    end;
  else
    -- Record payment against the already-established period (e.g. after trial convert).
    v_period_start := coalesce(v_sub.current_period_start, v_now);
    v_period_end := coalesce(v_sub.current_period_end, v_now);
  end if;

  v_method_code := coalesce(nullif(trim(p_payment_method_code), ''), 'manual');
  v_method_id := public.resolve_payment_method_type_id(v_method_code, p_company_id);

  select coalesce(
    nullif(trim(p_payment_method_label), ''),
    nullif(trim(pmt.display_name), ''),
    pmt.code
  )
  into v_method_label
  from public.payment_method_types pmt
  where pmt.id = v_method_id;

  v_provider_code := coalesce(
    nullif(trim(p_provider), ''),
    public.resolve_active_payment_provider_code(p_company_id)
  );

  if v_provider_payment_id is not null then
    select bp.id into v_existing_id
    from public.billing_payments bp
    where trim(bp.provider_payment_id) = v_provider_payment_id
      and coalesce(nullif(trim(bp.provider), ''), '') =
          coalesce(nullif(trim(v_provider_code), ''), '')
    limit 1;

    if v_existing_id is not null then
      return public._billing_payment_settlement_result_v1(v_existing_id);
    end if;
  end if;

  v_payment_terms_days := greatest(
    coalesce(public.resolve_billing_setting_integer('default_payment_terms_days', p_company_id), 30),
    0
  );
  v_due_at := v_now + (v_payment_terms_days || ' days')::interval;

  v_invoice_number := public.format_billing_document_number('invoice', p_company_id);
  v_receipt_number := public.format_billing_document_number('receipt', p_company_id);

  begin
    insert into public.billing_payments (
      company_id, subscription_id, payment_method_type_id, payment_method_label,
      provider, provider_payment_id, status, amount, currency, paid_at, metadata,
      idempotency_key
    )
    values (
      p_company_id, v_sub.id, v_method_id, v_method_label,
      v_provider_code, v_provider_payment_id, 'succeeded', v_total, v_currency, v_now,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_method_code', v_method_code,
        'amount_mode', v_amount_mode,
        'list_price_subtotal', case when v_amount_mode = 'list_price' then v_subtotal else null end,
        'advance_period', v_advance
      ),
      v_idempotency_key
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      if v_idempotency_key is not null then
        select bp.id into v_existing_id
        from public.billing_payments bp
        where bp.company_id = p_company_id
          and trim(bp.idempotency_key) = v_idempotency_key
        limit 1;
      end if;
      if v_existing_id is null and v_provider_payment_id is not null then
        select bp.id into v_existing_id
        from public.billing_payments bp
        where trim(bp.provider_payment_id) = v_provider_payment_id
        limit 1;
      end if;
      if v_existing_id is null then
        raise;
      end if;
      return public._billing_payment_settlement_result_v1(v_existing_id);
  end;

  insert into public.billing_invoices (
    invoice_number, company_id, subscription_id, billing_payment_id, status, currency,
    subtotal_amount, tax_amount, total_amount, period_start, period_end, line_items,
    billing_contact_snapshot, company_snapshot, issued_at, due_at, paid_at
  )
  values (
    v_invoice_number, p_company_id, v_sub.id, v_payment_id, 'paid', v_currency,
    v_subtotal, v_tax_amount, v_total, v_period_start, v_period_end,
    jsonb_build_array(jsonb_build_object(
      'description', coalesce(v_plan.display_name, v_plan.name, 'Subscription'),
      'quantity', 1, 'unit_amount', v_subtotal, 'total_amount', v_subtotal
    )),
    coalesce(public.build_billing_contact_snapshot(p_company_id), '{}'::jsonb),
    coalesce(public.build_billing_company_snapshot(p_company_id), '{}'::jsonb),
    v_now, v_due_at, v_now
  )
  returning id into v_invoice_id;

  insert into public.billing_receipts (
    receipt_number, company_id, subscription_id, billing_invoice_id, billing_payment_id,
    amount, currency, payment_method_label, company_snapshot, billing_contact_snapshot, issued_at
  )
  values (
    v_receipt_number, p_company_id, v_sub.id, v_invoice_id, v_payment_id,
    v_total, v_currency, v_method_label,
    coalesce(public.build_billing_company_snapshot(p_company_id), '{}'::jsonb),
    coalesce(public.build_billing_contact_snapshot(p_company_id), '{}'::jsonb),
    v_now
  )
  returning id into v_receipt_id;

  update public.billing_payments
  set receipt_id = v_receipt_id,
      billing_invoice_id = v_invoice_id
  where id = v_payment_id;

  if v_advance then
    update public.company_subscriptions
    set status = 'active',
        current_period_start = v_period_start,
        current_period_end = v_period_end,
        next_renewal_at = case when auto_renewal then v_period_end else null end,
        trial_ends_at = case when v_sub.status = 'trialing' then v_period_end else trial_ends_at end,
        grace_period_ends_at = null,
        payment_method_label = coalesce(v_method_label, payment_method_label),
        updated_at = v_now
    where id = v_sub.id;
  else
    update public.company_subscriptions
    set status = 'active',
        grace_period_ends_at = null,
        payment_method_label = coalesce(v_method_label, payment_method_label),
        updated_at = v_now
    where id = v_sub.id;
  end if;

  perform public.sync_company_subscription_denormalized(p_company_id);
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'invoice_generated', 'Invoice Generated', v_invoice_number,
    jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number, 'due_at', v_due_at));
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'payment_received', 'Payment Received',
    v_total::text || ' ' || v_currency, jsonb_build_object(
      'payment_id', v_payment_id, 'amount', v_total, 'currency', v_currency,
      'provider', v_provider_code, 'amount_mode', v_amount_mode,
      'idempotency_key', v_idempotency_key, 'advance_period', v_advance
    ));
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'receipt_generated', 'Receipt Generated', v_receipt_number,
    jsonb_build_object('receipt_id', v_receipt_id, 'receipt_number', v_receipt_number));
  perform public.emit_subscription_event(p_company_id, v_sub.id,
    case when v_previous_status in ('trialing', 'expired', 'grace_period', 'past_due') then 'subscription_activated' else 'renewed' end,
    case when v_previous_status in ('trialing', 'expired', 'grace_period', 'past_due') then 'Subscription Activated' else 'Subscription Renewed' end,
    null, jsonb_build_object('period_end', v_period_end, 'previous_status', v_previous_status, 'auto_renewal', v_sub.auto_renewal, 'advance_period', v_advance));

  perform public.write_billing_audit_log('manual_payment_recorded', p_company_id, null,
    jsonb_build_object(
      'payment_id', v_payment_id, 'invoice_id', v_invoice_id, 'receipt_id', v_receipt_id,
      'amount', v_total, 'currency', v_currency, 'provider', v_provider_code,
      'payment_method_code', v_method_code, 'amount_mode', v_amount_mode,
      'idempotency_key', v_idempotency_key, 'provider_payment_id', v_provider_payment_id,
      'advance_period', v_advance
    ),
    case when v_amount_mode = 'list_price' then 'system' else 'manual' end,
    jsonb_build_object('provider', v_provider_code));
  perform public.write_billing_audit_log('receipt_generated', p_company_id, null,
    jsonb_build_object('receipt_id', v_receipt_id, 'receipt_number', v_receipt_number),
    'system', jsonb_build_object('payment_id', v_payment_id));

  v_bus_detail := v_total::text || ' ' || v_currency;

  perform public.notification_bus_emit_v1(
    'financial.payment.succeeded', p_company_id, auth.uid(),
    jsonb_build_object('payment_id', v_payment_id, 'amount', v_total, 'currency', v_currency, 'detail', v_bus_detail),
    null, 'financial.payment.succeeded:' || v_payment_id::text
  );
  perform public.notification_bus_emit_v1(
    'financial.invoice.generated', p_company_id, auth.uid(),
    jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number, 'detail', v_invoice_number),
    null, 'financial.invoice.generated:' || v_invoice_id::text
  );
  perform public.notification_bus_emit_v1(
    'financial.receipt.generated', p_company_id, auth.uid(),
    jsonb_build_object('receipt_id', v_receipt_id, 'receipt_number', v_receipt_number, 'detail', v_receipt_number),
    null, 'financial.receipt.generated:' || v_receipt_id::text
  );

  if v_previous_status = 'active' and v_advance then
    perform public.notification_bus_emit_v1(
      'billing.subscription.renewed', p_company_id, auth.uid(),
      jsonb_build_object('subscription_id', v_sub.id, 'period_end', v_period_end, 'detail', 'Subscription renewed'),
      null, 'billing.subscription.renewed:' || v_payment_id::text
    );
  elsif v_previous_status <> 'active' then
    perform public.notification_bus_emit_v1(
      'billing.subscription.created', p_company_id, auth.uid(),
      jsonb_build_object('subscription_id', v_sub.id, 'previous_status', v_previous_status, 'detail', 'Subscription activated'),
      null, 'billing.subscription.created:' || v_payment_id::text
    );
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'invoice_id', v_invoice_id,
    'receipt_id', v_receipt_id,
    'invoice_number', v_invoice_number,
    'receipt_number', v_receipt_number,
    'subscription_id', v_sub.id,
    'period_end', v_period_end,
    'due_at', v_due_at,
    'payment_terms_days', v_payment_terms_days,
    'provider', v_provider_code,
    'payment_method_code', v_method_code,
    'idempotent_replay', false,
    'amount_mode', v_amount_mode,
    'amount', v_total,
    'currency', v_currency,
    'advance_period', v_advance
  );
end;
$$;

revoke all on function public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb, text, text, text, uuid, boolean
) from public;

grant execute on function public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb, text, text, text, uuid, boolean
) to authenticated;

grant execute on function public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb, text, text, text, uuid, boolean
) to service_role;

-- ── 3. Authoritative SaaS settlement boundary ─────────────────

create or replace function public.settle_saas_verified_payment_v1(
  p_checkout_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.billing_checkout_sessions%rowtype;
  v_sub public.company_subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_expected numeric;
  v_currency text;
  v_prior_status text;
  v_convert jsonb;
  v_renew jsonb;
  v_idem text;
  v_provider_payment text;
  v_payment_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SETTLEMENT_AUTH_REQUIRED: service_role required for SaaS settlement';
  end if;

  if p_checkout_session_id is null then
    raise exception 'CHECKOUT_NOT_FOUND: checkout_session_id is required';
  end if;

  select * into v_session
  from public.billing_checkout_sessions
  where id = p_checkout_session_id
  for update;

  if not found then
    raise exception 'CHECKOUT_NOT_FOUND: checkout session % not found', p_checkout_session_id;
  end if;

  -- Idempotent: already settled
  if v_session.billing_payment_id is not null and v_session.settled_at is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'SETTLEMENT_IDEMPOTENT',
      'idempotent_replay', true,
      'checkout_session_id', v_session.id,
      'billing_payment_id', v_session.billing_payment_id,
      'settlement_code', v_session.settlement_code,
      'company_id', v_session.company_id,
      'subscription_id', v_session.subscription_id,
      'payment', public._billing_payment_settlement_result_v1(v_session.billing_payment_id)
    );
  end if;

  if v_session.status = 'expired'
     or (v_session.expires_at is not null and v_session.expires_at < now() and v_session.status not in ('succeeded', 'pending')) then
    raise exception 'CHECKOUT_EXPIRED: checkout session % is expired', p_checkout_session_id;
  end if;

  if v_session.status in ('failed', 'canceled') then
    raise exception 'INVALID_PAYMENT_STATUS: cannot settle checkout in status %', v_session.status;
  end if;

  if v_session.status <> 'succeeded' then
    raise exception 'INVALID_PAYMENT_STATUS: checkout must be succeeded before settlement (status=%)', v_session.status;
  end if;

  if v_session.expires_at is not null and v_session.expires_at < now() and v_session.verified_at is null then
    raise exception 'CHECKOUT_EXPIRED: checkout session % expired before verification', p_checkout_session_id;
  end if;

  select * into v_sub
  from public.company_subscriptions
  where id = v_session.subscription_id
  for update;

  if not found then
    raise exception 'SUBSCRIPTION_MISMATCH: subscription not found';
  end if;

  if v_sub.company_id <> v_session.company_id then
    raise exception 'COMPANY_MISMATCH: subscription does not belong to checkout company';
  end if;

  if v_sub.id <> v_session.subscription_id then
    raise exception 'SUBSCRIPTION_MISMATCH: checkout subscription mismatch';
  end if;

  if v_sub.status in ('canceled', 'expired') then
    raise exception 'INVALID_SUBSCRIPTION_STATE: cannot settle payment for status %', v_sub.status;
  end if;

  select * into v_plan from public.plans where id = v_session.plan_id;
  if not found then
    raise exception 'CHECKOUT_NOT_FOUND: locked plan missing';
  end if;

  if v_plan.pricing_mode = 'free' then
    raise exception 'FREE_PACKAGE_NO_PAYMENT: free packages cannot settle online';
  end if;

  if v_plan.pricing_mode = 'custom' then
    raise exception 'CUSTOM_PRICING_REQUIRES_MANUAL_BILLING: custom packages cannot settle online';
  end if;

  if v_plan.pricing_mode <> 'fixed' then
    raise exception 'INVALID_PAYMENT_STATUS: unsupported pricing_mode %', v_plan.pricing_mode;
  end if;

  -- Online package change via webhook is not supported; checkout plan must match subscription
  -- except trialing conversion which uses locked checkout plan.
  if v_sub.status <> 'trialing' and v_sub.plan_id is distinct from v_session.plan_id then
    raise exception 'ONLINE_PACKAGE_CHANGE_NOT_SUPPORTED: checkout plan differs from subscription plan';
  end if;

  if v_session.billing_cycle <> v_sub.billing_cycle and v_sub.status <> 'trialing' then
    raise exception 'SUBSCRIPTION_MISMATCH: billing cycle mismatch';
  end if;

  v_expected := case
    when v_session.billing_cycle = 'yearly' then v_plan.price_yearly
    else v_plan.price_monthly
  end;

  if v_expected is null or v_expected <= 0 then
    raise exception 'AMOUNT_MISMATCH: locked plan has non-positive list price';
  end if;

  if abs(v_session.amount - v_expected) > 0.009 then
    raise exception 'AMOUNT_MISMATCH: checkout amount % != list price %', v_session.amount, v_expected;
  end if;

  v_currency := coalesce(
    nullif(trim(public.resolve_billing_setting_value('default_currency', v_session.company_id)#>>'{}'), ''),
    nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), '')
  );

  if v_currency is null then
    raise exception 'CURRENCY_MISMATCH: default_currency not configured';
  end if;

  if lower(trim(v_session.currency)) <> lower(trim(v_currency)) then
    raise exception 'CURRENCY_MISMATCH: checkout currency % != server currency %',
      v_session.currency, v_currency;
  end if;

  v_prior_status := v_sub.status;
  v_provider_payment := coalesce(
    nullif(trim(v_session.provider_payment_id), ''),
    nullif(trim(v_session.provider_session_id), '')
  );
  v_idem := 'saas_checkout:' || v_session.id::text;

  -- Trial → paid: convert (package + grants + period), then record payment without second advance
  if v_prior_status = 'trialing' then
    v_convert := public.convert_trial_to_paid_v1(
      v_session.company_id,
      v_session.plan_id,
      v_session.billing_cycle,
      'Online SaaS payment settlement',
      'payment'
    );

    v_renew := public.renew_subscription_from_payment(
      v_session.company_id,
      v_session.amount,
      v_session.currency,
      coalesce(v_session.provider_code, 'manual'),
      v_session.provider_code,
      v_provider_payment,
      jsonb_build_object(
        'source', 'saas_checkout',
        'checkout_session_id', v_session.id,
        'provider_session_id', v_session.provider_session_id,
        'trial_conversion', true
      ),
      'manual',
      v_idem,
      'list_price',
      v_session.subscription_id,
      false  -- do not double-extend period after convert
    );
  elsif v_prior_status in ('active', 'past_due', 'grace_period') then
    v_renew := public.renew_subscription_from_payment(
      v_session.company_id,
      v_session.amount,
      v_session.currency,
      coalesce(v_session.provider_code, 'manual'),
      v_session.provider_code,
      v_provider_payment,
      jsonb_build_object(
        'source', 'saas_checkout',
        'checkout_session_id', v_session.id,
        'provider_session_id', v_session.provider_session_id,
        'prior_status', v_prior_status
      ),
      'manual',
      v_idem,
      'list_price',
      v_session.subscription_id,
      true
    );
  else
    raise exception 'INVALID_SUBSCRIPTION_STATE: unsupported status % for settlement', v_prior_status;
  end if;

  v_payment_id := (v_renew->>'payment_id')::uuid;
  if v_payment_id is null then
    raise exception 'SETTLEMENT_FAILED: renew did not return payment_id';
  end if;

  update public.billing_checkout_sessions
  set settled_at = now(),
      billing_payment_id = v_payment_id,
      settlement_code = case
        when v_prior_status = 'trialing' then 'TRIAL_CONVERTED_AND_PAID'
        when v_prior_status in ('past_due', 'grace_period') then 'RECOVERY_PAID'
        else 'RENEWED'
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'settlement', v_renew,
        'trial_conversion', coalesce(v_convert, 'null'::jsonb),
        'prior_status', v_prior_status
      ),
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  perform public.write_billing_audit_log(
    'manual_payment_recorded',
    v_session.company_id,
    jsonb_build_object('checkout_session_id', v_session.id, 'prior_status', v_prior_status),
    jsonb_build_object(
      'settlement_code', v_session.settlement_code,
      'billing_payment_id', v_payment_id,
      'checkout_session_id', v_session.id,
      'provider', v_session.provider_code,
      'provider_payment_id', v_provider_payment
    ),
    'system',
    jsonb_build_object('source', 'settle_saas_verified_payment_v1')
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'SETTLEMENT_SUCCEEDED',
    'idempotent_replay', coalesce((v_renew->>'idempotent_replay')::boolean, false),
    'settlement_code', v_session.settlement_code,
    'checkout_session_id', v_session.id,
    'company_id', v_session.company_id,
    'subscription_id', v_session.subscription_id,
    'billing_payment_id', v_payment_id,
    'prior_status', v_prior_status,
    'trial_conversion', v_convert,
    'payment', v_renew
  );
end;
$$;

revoke all on function public.settle_saas_verified_payment_v1(uuid) from public;
grant execute on function public.settle_saas_verified_payment_v1(uuid) to service_role;

comment on function public.settle_saas_verified_payment_v1(uuid) is
  'Part 3: provider-neutral SaaS settlement. Requires checkout status=succeeded. Uses convert_trial_to_paid_v1 + renew_subscription_from_payment(list_price).';
