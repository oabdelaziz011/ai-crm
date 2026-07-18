-- ============================================================
-- Billing Settings Core Runtime — Sprint completion
-- Wires grace period, trial, auto-renewal, payment terms,
-- supported payment methods, and sandbox mode into business logic.
-- ============================================================

-- ── Setting helpers ───────────────────────────────────────────

create or replace function public.resolve_billing_setting_integer(
  p_code text,
  p_company_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
  v_text text;
begin
  v_raw := public.resolve_billing_setting_value(p_code, p_company_id);
  v_text := nullif(trim(v_raw#>>'{}'), '');
  if v_text is null or v_text = 'null' then
    return null;
  end if;
  return v_text::integer;
exception
  when others then
    return null;
end;
$$;

create or replace function public.resolve_billing_setting_boolean(
  p_code text,
  p_company_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
begin
  v_raw := public.resolve_billing_setting_value(p_code, p_company_id);
  if v_raw is null or v_raw = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(v_raw) = 'boolean' then
    return v_raw::boolean;
  end if;
  return lower(trim(v_raw#>>'{}')) in ('true', '1', 'yes');
exception
  when others then
    return null;
end;
$$;

create or replace function public.resolve_supported_payment_method_codes(
  p_company_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
begin
  v_raw := public.resolve_billing_setting_value('supported_payment_method_codes', p_company_id);
  if v_raw is null or v_raw = 'null'::jsonb then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(v_raw) = 'array' then
    return v_raw;
  end if;
  begin
    return coalesce(v_raw#>>'{}')::jsonb;
  exception
    when others then
      return '[]'::jsonb;
  end;
end;
$$;

create or replace function public.resolve_active_payment_provider_code(
  p_company_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.resolve_billing_setting_boolean('payment_sandbox_mode', p_company_id), false) then
    return 'sandbox';
  end if;
  return 'manual';
end;
$$;

create or replace function public.resolve_payment_method_type_id(
  p_code text,
  p_company_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_supported jsonb;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Payment method code is required';
  end if;

  v_supported := public.resolve_supported_payment_method_codes(p_company_id);
  if not exists (
    select 1
    from jsonb_array_elements_text(v_supported) elem
    where elem = trim(p_code)
  ) then
    raise exception 'Payment method % is not enabled in billing settings', p_code;
  end if;

  select pmt.id into v_id
  from public.payment_method_types pmt
  where pmt.code = trim(p_code)
    and pmt.is_active = true
  limit 1;

  if v_id is null then
    raise exception 'Payment method type % not found or inactive', p_code;
  end if;

  return v_id;
end;
$$;

-- ── Subscription lifecycle ───────────────────────────────────

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
  v_plan public.plans%rowtype;
  v_sub public.company_subscriptions%rowtype;
  v_trial_days integer;
  v_auto_renewal boolean;
  v_now timestamptz := now();
  v_status text;
  v_trial_ends timestamptz;
  v_period_end timestamptz;
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

  select * into v_plan from public.plans where id = p_plan_id and is_active = true;
  if not found then
    raise exception 'Plan not found or inactive';
  end if;

  if p_billing_cycle not in ('monthly', 'yearly') then
    raise exception 'Invalid billing cycle: %', p_billing_cycle;
  end if;

  if exists (select 1 from public.company_subscriptions cs where cs.company_id = p_company_id) then
    raise exception 'Subscription already exists for company %', p_company_id;
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
    p_company_id, p_plan_id, v_status, p_billing_cycle,
    v_now, v_period_end,
    case when v_auto_renewal then v_period_end else null end,
    v_trial_ends, v_auto_renewal
  )
  returning * into v_sub;

  perform public.sync_company_subscription_denormalized(p_company_id);

  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'subscription_created', 'Subscription Created',
    coalesce(v_plan.display_name, v_plan.name),
    jsonb_build_object(
      'plan_id', p_plan_id,
      'billing_cycle', p_billing_cycle,
      'status', v_status,
      'trial_duration_days', v_trial_days,
      'trial_ends_at', v_trial_ends,
      'auto_renewal', v_auto_renewal
    )
  );

  perform public.write_billing_audit_log(
    'subscription_created', p_company_id, null,
    jsonb_build_object(
      'subscription_id', v_sub.id,
      'plan_id', p_plan_id,
      'status', v_status,
      'trial_ends_at', v_trial_ends,
      'auto_renewal', v_auto_renewal
    ),
    'manual', jsonb_build_object('billing_cycle', p_billing_cycle)
  );

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'company_id', p_company_id,
    'status', v_status,
    'trial_ends_at', v_trial_ends,
    'auto_renewal', v_auto_renewal,
    'trial_duration_days', v_trial_days
  );
end;
$$;

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
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;
  if not public.can_edit_billing() then
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

  perform public.notification_bus_emit_v1(
    'billing.subscription.grace_period', p_company_id, auth.uid(),
    jsonb_build_object(
      'subscription_id', v_sub.id,
      'grace_period_ends_at', v_grace_ends,
      'detail', v_reason
    ),
    null, 'billing.subscription.grace_period:' || p_company_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'status', 'grace_period',
    'grace_period_days', v_grace_days,
    'grace_period_ends_at', v_grace_ends
  );
end;
$$;

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
    select cs.company_id, cs.id as subscription_id
    from public.company_subscriptions cs
    where cs.status = 'grace_period'
      and cs.grace_period_ends_at is not null
      and cs.grace_period_ends_at <= now()
  loop
    update public.company_subscriptions
    set status = 'expired', updated_at = now()
    where id = v_row.subscription_id;

    perform public.sync_company_subscription_denormalized(v_row.company_id);

    perform public.emit_subscription_event(
      v_row.company_id, v_row.subscription_id, 'expired', 'Subscription Expired',
      'Grace period ended',
      jsonb_build_object('previous_status', 'grace_period')
    );

    perform public.write_billing_audit_log(
      'subscription_expired', v_row.company_id,
      jsonb_build_object('status', 'grace_period'),
      jsonb_build_object('status', 'expired'),
      'system', jsonb_build_object('subscription_id', v_row.subscription_id)
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('expired_count', v_count);
end;
$$;

create or replace function public.enforce_trial_expirations_v1()
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
    select cs.company_id
    from public.company_subscriptions cs
    where cs.status = 'trialing'
      and cs.trial_ends_at is not null
      and cs.trial_ends_at <= now()
  loop
    perform public.record_subscription_renewal_failure_v1(v_row.company_id, 'Trial ended without payment');
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('processed_count', v_count);
end;
$$;

-- ── Payment options for UI ────────────────────────────────────

create or replace function public.get_billing_payment_options_v1(
  p_company_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_supported jsonb;
  v_methods jsonb;
  v_sandbox boolean;
  v_provider text;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  v_supported := public.resolve_supported_payment_method_codes(p_company_id);
  v_sandbox := coalesce(public.resolve_billing_setting_boolean('payment_sandbox_mode', p_company_id), false);
  v_provider := public.resolve_active_payment_provider_code(p_company_id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'code', pmt.code,
      'display_name', pmt.display_name,
      'category', pmt.category
    )
    order by pmt.sort_order, pmt.display_name
  ), '[]'::jsonb)
  into v_methods
  from public.payment_method_types pmt
  where pmt.is_active = true
    and exists (
      select 1
      from jsonb_array_elements_text(v_supported) elem
      where elem = pmt.code
    );

  return jsonb_build_object(
    'schema_version', 1,
    'payment_methods', v_methods,
    'payment_sandbox_mode', v_sandbox,
    'active_provider_code', v_provider,
    'active_mode', case when v_sandbox then 'sandbox' else 'production' end
  );
end;
$$;

-- ── Renew from payment (settings-aware) ───────────────────────

create or replace function public.renew_subscription_from_payment(
  p_company_id uuid,
  p_amount numeric,
  p_currency text default null,
  p_payment_method_label text default null,
  p_provider text default null,
  p_provider_payment_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_payment_method_code text default null
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
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  if not public.can_record_billing_payment() then
    raise exception 'Insufficient permissions to record subscription payment';
  end if;

  if not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot record payment for this company';
  end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then raise exception 'Subscription not found for company %', p_company_id; end if;

  v_previous_status := v_sub.status;
  select * into v_plan from public.plans where id = v_sub.plan_id;

  v_currency := coalesce(
    nullif(trim(p_currency), ''),
    nullif(trim(public.resolve_billing_setting_value('default_currency', p_company_id)#>>'{}'), ''),
    nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), '')
  );
  if v_currency is null then
    raise exception 'default_currency billing setting is not configured';
  end if;

  v_tax_rate := coalesce(
    nullif(public.resolve_billing_setting_value('vat_percentage', p_company_id)::text, 'null')::numeric,
    0
  );

  v_subtotal := coalesce(p_amount, 0);
  v_tax_amount := round(v_subtotal * v_tax_rate / 100.0, 2);
  v_total := v_subtotal + v_tax_amount;

  v_period_start := coalesce(v_sub.current_period_end, v_now);
  v_period_end := case when v_sub.billing_cycle = 'yearly'
    then v_period_start + interval '1 year'
    else v_period_start + interval '1 month'
  end;

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

  v_provider_code := coalesce(nullif(trim(p_provider), ''), public.resolve_active_payment_provider_code(p_company_id));

  v_payment_terms_days := greatest(
    coalesce(public.resolve_billing_setting_integer('default_payment_terms_days', p_company_id), 30),
    0
  );
  v_due_at := v_now + (v_payment_terms_days || ' days')::interval;

  v_invoice_number := public.format_billing_document_number('invoice', p_company_id);
  v_receipt_number := public.format_billing_document_number('receipt', p_company_id);

  insert into public.billing_payments (
    company_id, subscription_id, payment_method_type_id, payment_method_label,
    provider, provider_payment_id, status, amount, currency, paid_at, metadata
  )
  values (
    p_company_id, v_sub.id, v_method_id, v_method_label,
    v_provider_code, p_provider_payment_id, 'succeeded', v_total, v_currency, v_now,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('payment_method_code', v_method_code)
  )
  returning id into v_payment_id;

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

  update public.billing_payments set receipt_id = v_receipt_id where id = v_payment_id;

  update public.company_subscriptions
  set status = 'active', current_period_start = v_period_start, current_period_end = v_period_end,
      next_renewal_at = case when auto_renewal then v_period_end else null end,
      trial_ends_at = case when v_sub.status = 'trialing' then v_period_end else trial_ends_at end,
      grace_period_ends_at = null,
      payment_method_label = coalesce(v_method_label, payment_method_label),
      updated_at = v_now
  where id = v_sub.id;

  perform public.sync_company_subscription_denormalized(p_company_id);
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'invoice_generated', 'Invoice Generated', v_invoice_number,
    jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number, 'due_at', v_due_at));
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'payment_received', 'Payment Received',
    v_total::text || ' ' || v_currency, jsonb_build_object('payment_id', v_payment_id, 'amount', v_total, 'currency', v_currency, 'provider', v_provider_code));
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'receipt_generated', 'Receipt Generated', v_receipt_number,
    jsonb_build_object('receipt_id', v_receipt_id, 'receipt_number', v_receipt_number));
  perform public.emit_subscription_event(p_company_id, v_sub.id,
    case when v_previous_status in ('trialing', 'expired', 'grace_period', 'past_due') then 'subscription_activated' else 'renewed' end,
    case when v_previous_status in ('trialing', 'expired', 'grace_period', 'past_due') then 'Subscription Activated' else 'Subscription Renewed' end,
    null, jsonb_build_object('period_end', v_period_end, 'previous_status', v_previous_status, 'auto_renewal', v_sub.auto_renewal));

  perform public.write_billing_audit_log('manual_payment_recorded', p_company_id, null,
    jsonb_build_object('payment_id', v_payment_id, 'invoice_id', v_invoice_id, 'receipt_id', v_receipt_id,
      'amount', v_total, 'currency', v_currency, 'provider', v_provider_code, 'payment_method_code', v_method_code), 'manual', jsonb_build_object('provider', v_provider_code));
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

  if v_previous_status = 'active' then
    perform public.notification_bus_emit_v1(
      'billing.subscription.renewed', p_company_id, auth.uid(),
      jsonb_build_object('subscription_id', v_sub.id, 'period_end', v_period_end, 'detail', 'Subscription renewed'),
      null, 'billing.subscription.renewed:' || v_payment_id::text
    );
  else
    perform public.notification_bus_emit_v1(
      'billing.subscription.created', p_company_id, auth.uid(),
      jsonb_build_object('subscription_id', v_sub.id, 'previous_status', v_previous_status, 'detail', 'Subscription activated'),
      null, 'billing.subscription.created:' || v_payment_id::text
    );
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id, 'invoice_id', v_invoice_id, 'receipt_id', v_receipt_id,
    'invoice_number', v_invoice_number, 'receipt_number', v_receipt_number,
    'subscription_id', v_sub.id, 'period_end', v_period_end,
    'due_at', v_due_at, 'payment_terms_days', v_payment_terms_days,
    'provider', v_provider_code, 'payment_method_code', v_method_code
  );
end;
$$;

-- ── Provider health includes active mode ──────────────────────

create or replace function public.get_payment_provider_health_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_sandbox boolean;
  v_active_provider text;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.is_platform_billing_operator() then raise exception 'Insufficient permissions'; end if;

  v_sandbox := coalesce(public.resolve_billing_setting_boolean('payment_sandbox_mode', null), false);
  v_active_provider := public.resolve_active_payment_provider_code(null);

  select coalesce(jsonb_agg(to_jsonb(latest)), '[]'::jsonb) into v_rows
  from (
    select distinct on (s.provider_code)
      s.provider_code, pp.display_name, s.status, s.latency_ms,
      s.success_rate, s.error_rate, s.checked_at,
      (s.provider_code = v_active_provider) as is_active_route
    from public.payment_provider_health_snapshots s
    join public.payment_providers pp on pp.code = s.provider_code
    order by s.provider_code, s.checked_at desc
  ) latest;

  return jsonb_build_object(
    'schema_version', 2,
    'payment_sandbox_mode', v_sandbox,
    'active_mode', case when v_sandbox then 'sandbox' else 'production' end,
    'active_provider_code', v_active_provider,
    'providers', v_rows
  );
end;
$$;

-- ── Expiring list uses trial_duration_days ────────────────────

create or replace function public.list_expiring_subscriptions_paged_v1(
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_rows jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_trial_window_days integer;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.is_platform_billing_operator() then raise exception 'Insufficient permissions'; end if;

  v_trial_window_days := greatest(coalesce(public.resolve_billing_setting_integer('trial_duration_days', null), 14), 1);

  select count(*) into v_total
  from public.company_subscriptions cs
  where cs.status in ('expired', 'grace_period', 'past_due')
     or (cs.status = 'trialing' and cs.trial_ends_at is not null
         and cs.trial_ends_at <= now() + (v_trial_window_days || ' days')::interval);

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
  from (
    select cs.*, jsonb_build_object('id', c.id, 'name', c.name) as company
    from public.company_subscriptions cs
    join public.companies c on c.id = cs.company_id
    where cs.status in ('expired', 'grace_period', 'past_due')
       or (cs.status = 'trialing' and cs.trial_ends_at is not null
           and cs.trial_ends_at <= now() + (v_trial_window_days || ' days')::interval)
    order by coalesce(cs.next_renewal_at, cs.current_period_end, cs.trial_ends_at) asc nulls last
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('schema_version', 1, 'total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$$;

-- ── Grants ───────────────────────────────────────────────────

insert into public.billing_audit_event_types (code, label, description)
values
  ('grace_period_started', 'Grace Period Started', 'Subscription entered grace period after renewal failure'),
  ('subscription_expired', 'Subscription Expired', 'Subscription expired after grace period ended')
on conflict (code) do update
set label = excluded.label, description = excluded.description;

revoke all on function public.resolve_billing_setting_integer(text, uuid) from public;
revoke all on function public.resolve_billing_setting_boolean(text, uuid) from public;
revoke all on function public.resolve_supported_payment_method_codes(uuid) from public;
revoke all on function public.resolve_active_payment_provider_code(uuid) from public;
revoke all on function public.resolve_payment_method_type_id(text, uuid) from public;

grant execute on function public.resolve_billing_setting_integer(text, uuid) to authenticated;
grant execute on function public.resolve_billing_setting_boolean(text, uuid) to authenticated;
grant execute on function public.resolve_supported_payment_method_codes(uuid) to authenticated;
grant execute on function public.resolve_active_payment_provider_code(uuid) to authenticated;
grant execute on function public.resolve_payment_method_type_id(text, uuid) to authenticated;

revoke all on function public.create_company_subscription_v1(uuid, uuid, text, boolean) from public;
grant execute on function public.create_company_subscription_v1(uuid, uuid, text, boolean) to authenticated;

revoke all on function public.record_subscription_renewal_failure_v1(uuid, text) from public;
grant execute on function public.record_subscription_renewal_failure_v1(uuid, text) to authenticated;

revoke all on function public.enforce_grace_period_expirations_v1() from public;
grant execute on function public.enforce_grace_period_expirations_v1() to authenticated;

revoke all on function public.enforce_trial_expirations_v1() from public;
grant execute on function public.enforce_trial_expirations_v1() to authenticated;

revoke all on function public.get_billing_payment_options_v1(uuid) from public;
grant execute on function public.get_billing_payment_options_v1(uuid) to authenticated;

revoke all on function public.renew_subscription_from_payment(uuid, numeric, text, text, text, text, jsonb, text) from public;
grant execute on function public.renew_subscription_from_payment(uuid, numeric, text, text, text, text, jsonb, text) to authenticated;
