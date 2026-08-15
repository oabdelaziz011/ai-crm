-- ============================================================
-- 274 — Commercial SaaS payment foundation hardening (Part 1)
-- ============================================================
-- Scope: billing_payments idempotency + harden renew_subscription_from_payment.
-- Does NOT implement checkout, provider webhooks, or customer-payment domain.
--
-- Guarantees:
--   A/B. Same provider payment id / idempotency key cannot settle twice
--   C.   Duplicate settlement does not extend subscription twice
--   D–G. list_price mode validates amount/currency/plan/company server-side
--   H.   manual mode preserves platform-admin custom amounts
-- ============================================================

-- ── 1. Schema: idempotency_key ────────────────────────────────

alter table public.billing_payments
  add column if not exists idempotency_key text;

comment on column public.billing_payments.idempotency_key is
  'Optional settlement idempotency key (SaaS commercial payments). Unique per company when set. Never store card/PAN/CVV.';

-- Normalize blank provider payment ids / keys before unique indexes
update public.billing_payments
set provider_payment_id = null
where provider_payment_id is not null
  and length(trim(provider_payment_id)) = 0;

update public.billing_payments
set idempotency_key = null
where idempotency_key is not null
  and length(trim(idempotency_key)) = 0;

-- ── 2. Preflight: refuse unique indexes if conflicts exist ────

do $$
declare
  v_dup_provider integer;
  v_dup_idem integer;
  v_sample text;
begin
  select count(*)::int into v_dup_provider
  from (
    select 1
    from public.billing_payments
    where provider_payment_id is not null
      and length(trim(provider_payment_id)) > 0
    group by coalesce(nullif(trim(provider), ''), ''), trim(provider_payment_id)
    having count(*) > 1
  ) d;

  if v_dup_provider > 0 then
    select string_agg(provider || ':' || provider_payment_id || '(' || n::text || ')', ', ')
    into v_sample
    from (
      select coalesce(nullif(trim(provider), ''), '') as provider,
             trim(provider_payment_id) as provider_payment_id,
             count(*)::int as n
      from public.billing_payments
      where provider_payment_id is not null
        and length(trim(provider_payment_id)) > 0
      group by 1, 2
      having count(*) > 1
      limit 5
    ) s;
    raise exception
      'Migration 274 blocked: % duplicate billing_payments provider payment group(s). Samples: %. Do not delete financial rows; resolve manually.',
      v_dup_provider, coalesce(v_sample, '(none)');
  end if;

  select count(*)::int into v_dup_idem
  from (
    select 1
    from public.billing_payments
    where idempotency_key is not null
      and length(trim(idempotency_key)) > 0
    group by company_id, trim(idempotency_key)
    having count(*) > 1
  ) d;

  if v_dup_idem > 0 then
    raise exception
      'Migration 274 blocked: % duplicate billing_payments idempotency_key group(s). Resolve manually before applying.',
      v_dup_idem;
  end if;
end $$;

-- Partial unique: provider + provider_payment_id when set
drop index if exists public.idx_billing_payments_provider_payment_unique;
create unique index idx_billing_payments_provider_payment_unique
  on public.billing_payments (
    coalesce(nullif(trim(provider), ''), ''),
    trim(provider_payment_id)
  )
  where provider_payment_id is not null
    and length(trim(provider_payment_id)) > 0;

-- Partial unique: company + idempotency_key when set
drop index if exists public.idx_billing_payments_idempotency_unique;
create unique index idx_billing_payments_idempotency_unique
  on public.billing_payments (company_id, trim(idempotency_key))
  where idempotency_key is not null
    and length(trim(idempotency_key)) > 0;

-- ── 3. Helper: rebuild settlement result from existing payment ─

create or replace function public._billing_payment_settlement_result_v1(
  p_payment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payment public.billing_payments%rowtype;
  v_invoice public.billing_invoices%rowtype;
  v_receipt public.billing_receipts%rowtype;
  v_sub public.company_subscriptions%rowtype;
begin
  select * into v_payment from public.billing_payments where id = p_payment_id;
  if not found then
    raise exception 'Billing payment % not found', p_payment_id;
  end if;

  select * into v_invoice
  from public.billing_invoices
  where billing_payment_id = p_payment_id
  order by created_at desc nulls last
  limit 1;

  select * into v_receipt
  from public.billing_receipts
  where billing_payment_id = p_payment_id
  order by created_at desc nulls last
  limit 1;

  if v_payment.subscription_id is not null then
    select * into v_sub from public.company_subscriptions where id = v_payment.subscription_id;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'invoice_id', v_invoice.id,
    'receipt_id', coalesce(v_receipt.id, v_payment.receipt_id),
    'invoice_number', v_invoice.invoice_number,
    'receipt_number', v_receipt.receipt_number,
    'subscription_id', coalesce(v_payment.subscription_id, v_sub.id),
    'period_end', v_sub.current_period_end,
    'due_at', v_invoice.due_at,
    'payment_terms_days', null,
    'provider', v_payment.provider,
    'payment_method_code', v_payment.metadata->>'payment_method_code',
    'idempotent_replay', true,
    'amount', v_payment.amount,
    'currency', v_payment.currency,
    'status', v_payment.status
  );
end;
$$;

revoke all on function public._billing_payment_settlement_result_v1(uuid) from public;
grant execute on function public._billing_payment_settlement_result_v1(uuid) to authenticated;
grant execute on function public._billing_payment_settlement_result_v1(uuid) to service_role;

-- ── 4. Drop legacy overloads (keep a single authoritative RPC) ─

drop function if exists public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb
);
drop function if exists public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb, text
);

-- ── 5. Hardened renew_subscription_from_payment ───────────────

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
  p_expected_subscription_id uuid default null
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

  -- Idempotent replay (before mutating subscription period)
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
    -- Cross-company collision is always rejected
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

  -- Currency: always settle in server-resolved default_currency
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

  -- Amount: manual (admin) vs list_price (online-safe)
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
    -- manual: preserve platform-admin caller amount
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

  v_provider_code := coalesce(
    nullif(trim(p_provider), ''),
    public.resolve_active_payment_provider_code(p_company_id)
  );

  -- Re-check provider payment uniqueness after provider resolution
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
        'list_price_subtotal', case when v_amount_mode = 'list_price' then v_subtotal else null end
      ),
      v_idempotency_key
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      -- Concurrent duplicate settlement: return existing, do not extend period again
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

  perform public.sync_company_subscription_denormalized(p_company_id);
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'invoice_generated', 'Invoice Generated', v_invoice_number,
    jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number, 'due_at', v_due_at));
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'payment_received', 'Payment Received',
    v_total::text || ' ' || v_currency, jsonb_build_object(
      'payment_id', v_payment_id, 'amount', v_total, 'currency', v_currency,
      'provider', v_provider_code, 'amount_mode', v_amount_mode,
      'idempotency_key', v_idempotency_key
    ));
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'receipt_generated', 'Receipt Generated', v_receipt_number,
    jsonb_build_object('receipt_id', v_receipt_id, 'receipt_number', v_receipt_number));
  perform public.emit_subscription_event(p_company_id, v_sub.id,
    case when v_previous_status in ('trialing', 'expired', 'grace_period', 'past_due') then 'subscription_activated' else 'renewed' end,
    case when v_previous_status in ('trialing', 'expired', 'grace_period', 'past_due') then 'Subscription Activated' else 'Subscription Renewed' end,
    null, jsonb_build_object('period_end', v_period_end, 'previous_status', v_previous_status, 'auto_renewal', v_sub.auto_renewal));

  perform public.write_billing_audit_log('manual_payment_recorded', p_company_id, null,
    jsonb_build_object(
      'payment_id', v_payment_id, 'invoice_id', v_invoice_id, 'receipt_id', v_receipt_id,
      'amount', v_total, 'currency', v_currency, 'provider', v_provider_code,
      'payment_method_code', v_method_code, 'amount_mode', v_amount_mode,
      'idempotency_key', v_idempotency_key, 'provider_payment_id', v_provider_payment_id
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
    'currency', v_currency
  );
end;
$$;

revoke all on function public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb, text, text, text, uuid
) from public;

grant execute on function public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb, text, text, text, uuid
) to authenticated;

grant execute on function public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb, text, text, text, uuid
) to service_role;

comment on function public.renew_subscription_from_payment(
  uuid, numeric, text, text, text, text, jsonb, text, text, text, uuid
) is
  'Commercial SaaS subscription settlement. amount_mode=manual preserves admin amounts; list_price validates against package list price. Idempotent on idempotency_key / provider_payment_id.';
