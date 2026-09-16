-- ============================================================
-- 351 — Dual currency architecture
--
-- Company Operational Currency  ≠ company business money
--   (invoices / payments / reports) — company_financial_settings.default_currency
--
-- Subscription Billing Currency  → ValueOR SaaS charges
--   — company_commercial_terms.subscription_billing_currency
--   — company_subscriptions.billing_currency (lifecycle copy)
--   — plans.pricing_currency (catalog list-price currency)
--
-- These MUST remain independent. Checkout must never use
-- company operational currency. No historical FX conversion.
-- ============================================================

-- ── Catalog list-price currency (global default USD) ─────────
alter table public.plans
  add column if not exists pricing_currency text;

update public.plans
set pricing_currency = 'USD'
where pricing_currency is null or trim(pricing_currency) = '';

alter table public.plans
  alter column pricing_currency set default 'USD';

alter table public.plans
  alter column pricing_currency set not null;

comment on column public.plans.pricing_currency is
  'ISO 4217 currency for catalog list prices. Subscription billing currency is authoritative on commercial terms / subscription.';

-- ── Subscription agreement currency ──────────────────────────
alter table public.company_commercial_terms
  add column if not exists subscription_billing_currency text;

comment on column public.company_commercial_terms.subscription_billing_currency is
  'ISO 4217 currency ValueOR charges for this company subscription. Independent of company operational currency.';

alter table public.company_subscriptions
  add column if not exists billing_currency text;

comment on column public.company_subscriptions.billing_currency is
  'Persisted subscription billing currency for lifecycle stability. Copied from commercial terms; not company operational currency.';

-- Operational default for NEW Egyptian ValueOR tenants (does not rewrite existing rows).
alter table public.company_financial_settings
  alter column default_currency set default 'EGP';

-- One-time backfill: preserve existing checkout behavior by copying the currency
-- that was previously used for payable/checkout (company default_currency / platform).
-- After this migration, operational and subscription currencies diverge safely.
with resolved as (
  select
    c.id as company_id,
    upper(nullif(trim(coalesce(
      nullif(trim(cfs.default_currency), ''),
      nullif(trim(public.resolve_billing_setting_value('default_currency', c.id)#>>'{}'), ''),
      nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), ''),
      'USD'
    )), '')) as currency
  from public.companies c
  left join public.company_financial_settings cfs on cfs.company_id = c.id
)
update public.company_commercial_terms t
set subscription_billing_currency = r.currency
from resolved r
where t.company_id = r.company_id
  and (t.subscription_billing_currency is null or trim(t.subscription_billing_currency) = '');

update public.company_subscriptions s
set billing_currency = upper(nullif(trim(coalesce(
  t.subscription_billing_currency,
  nullif(trim(public.resolve_billing_setting_value('default_currency', s.company_id)#>>'{}'), ''),
  nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), ''),
  (select p.pricing_currency from public.plans p where p.id = s.plan_id),
  'USD'
)), ''))
from public.company_commercial_terms t
where t.company_id = s.company_id
  and (s.billing_currency is null or trim(s.billing_currency) = '');

-- Companies with a subscription but no commercial terms row yet: still seed currency on subscription.
update public.company_subscriptions s
set billing_currency = upper(nullif(trim(coalesce(
  nullif(trim(public.resolve_billing_setting_value('default_currency', s.company_id)#>>'{}'), ''),
  nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), ''),
  (select p.pricing_currency from public.plans p where p.id = s.plan_id),
  'USD'
)), ''))
where (s.billing_currency is null or trim(s.billing_currency) = '');

update public.company_subscriptions s
set billing_currency = upper(nullif(trim(coalesce(
  nullif(trim(public.resolve_billing_setting_value('default_currency', s.company_id)#>>'{}'), ''),
  nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), ''),
  'USD'
)), ''))
where (s.billing_currency is null or trim(s.billing_currency) = '');

-- ── Resolvers ────────────────────────────────────────────────

create or replace function public.resolve_company_operational_currency(p_company_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if p_company_id is null then
    return 'EGP';
  end if;

  select upper(nullif(trim(default_currency), ''))
  into v_code
  from public.company_financial_settings
  where company_id = p_company_id;

  if v_code is not null then
    return v_code;
  end if;

  v_code := upper(nullif(trim(public.resolve_billing_setting_value('default_currency', p_company_id)#>>'{}'), ''));
  if v_code is not null then
    return v_code;
  end if;

  return 'EGP';
end;
$$;

revoke all on function public.resolve_company_operational_currency(uuid) from public, anon;
grant execute on function public.resolve_company_operational_currency(uuid) to authenticated, service_role;

comment on function public.resolve_company_operational_currency(uuid) is
  'Company operational ISO currency for invoices/payments/reports. Never use for SaaS subscription checkout.';

create or replace function public.resolve_subscription_billing_currency(p_company_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
  v_plan_id uuid;
begin
  if p_company_id is null then
    return 'USD';
  end if;

  select upper(nullif(trim(subscription_billing_currency), ''))
  into v_code
  from public.company_commercial_terms
  where company_id = p_company_id;
  if v_code is not null then
    return v_code;
  end if;

  select upper(nullif(trim(billing_currency), '')), plan_id
  into v_code, v_plan_id
  from public.company_subscriptions
  where company_id = p_company_id;
  if v_code is not null then
    return v_code;
  end if;

  if v_plan_id is not null then
    select upper(nullif(trim(pricing_currency), ''))
    into v_code
    from public.plans
    where id = v_plan_id;
    if v_code is not null then
      return v_code;
    end if;
  end if;

  -- Platform catalog default only — never company operational currency.
  v_code := upper(nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), ''));
  if v_code is not null then
    return v_code;
  end if;

  return 'USD';
end;
$$;

revoke all on function public.resolve_subscription_billing_currency(uuid) from public, anon;
grant execute on function public.resolve_subscription_billing_currency(uuid) to authenticated, service_role;

comment on function public.resolve_subscription_billing_currency(uuid) is
  'ValueOR SaaS subscription ISO currency. Independent of company operational currency.';

-- ── Payable amount: subscription currency only ───────────────

create or replace function public.resolve_company_payable_amount(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_terms public.company_commercial_terms%rowtype;
  v_cycle text;
  v_list numeric;
  v_payable numeric;
  v_source text := 'none';
  v_currency text;
  v_online boolean := false;
  v_plan_mode text;
begin
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_super_admin()
     and public.current_company_id() is distinct from p_company_id then
    raise exception 'Insufficient permissions';
  end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id;
  if not found then
    return jsonb_build_object(
      'company_id', p_company_id,
      'payable_amount', null,
      'list_amount', null,
      'source', 'none',
      'currency', public.resolve_subscription_billing_currency(p_company_id),
      'online_checkout_allowed', false
    );
  end if;

  v_cycle := v_sub.billing_cycle;
  if v_sub.plan_id is not null then
    select * into v_plan from public.plans where id = v_sub.plan_id;
  end if;

  select * into v_terms from public.company_commercial_terms where company_id = p_company_id;

  v_list := case
    when v_plan.id is null then null
    when v_cycle = 'yearly' then v_plan.price_yearly
    else v_plan.price_monthly
  end;

  v_plan_mode := coalesce(v_plan.pricing_mode, 'fixed');

  if v_plan.id is not null and v_plan_mode = 'free' then
    v_payable := 0;
    v_source := 'free';
  elsif v_terms.company_id is not null and v_terms.pricing_source = 'custom' then
    v_payable := case
      when v_cycle = 'yearly' then v_terms.custom_price_yearly
      else v_terms.custom_price_monthly
    end;
    v_source := 'custom';
  elsif v_terms.company_id is not null and v_terms.pricing_source = 'discount' and v_list is not null then
    v_payable := round(v_list * (1 - coalesce(v_terms.discount_percent, 0) / 100.0), 2);
    v_source := 'discount';
  else
    v_payable := v_list;
    v_source := case when v_list is null then 'none' else 'list' end;
  end if;

  v_currency := public.resolve_subscription_billing_currency(p_company_id);

  v_online := (
    v_source in ('list', 'discount', 'custom')
    and v_plan_mode <> 'free'
    and not (v_plan_mode = 'custom' and v_source = 'list')
    and v_sub.plan_id is not null
    and v_cycle in ('monthly', 'yearly')
    and v_payable is not null
    and v_payable > 0
    and v_currency is not null
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'plan_id', v_sub.plan_id,
    'billing_cycle', v_cycle,
    'pricing_mode', v_plan.pricing_mode,
    'list_amount', v_list,
    'payable_amount', v_payable,
    'source', v_source,
    'discount_percent', coalesce(v_terms.discount_percent, 0),
    'custom_price_monthly', v_terms.custom_price_monthly,
    'custom_price_yearly', v_terms.custom_price_yearly,
    'currency', v_currency,
    'online_checkout_allowed', v_online
  );
end;
$$;

comment on function public.resolve_company_payable_amount(uuid) is
  'Company SaaS payable amount + subscription billing currency. Never returns company operational currency.';

-- ── Upsert commercial terms (incl. subscription currency) ────

drop function if exists public.upsert_company_commercial_terms_v1(uuid, text, numeric, numeric, numeric, text);

create or replace function public.upsert_company_commercial_terms_v1(
  p_company_id uuid,
  p_pricing_source text,
  p_discount_percent numeric default 0,
  p_custom_price_monthly numeric default null,
  p_custom_price_yearly numeric default null,
  p_notes text default null,
  p_subscription_billing_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := lower(trim(coalesce(p_pricing_source, 'list')));
  v_row public.company_commercial_terms%rowtype;
  v_currency text;
  v_existing text;
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to configure company commercial terms';
  end if;
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;
  if v_source not in ('list', 'discount', 'custom') then
    raise exception 'invalid_pricing_source';
  end if;
  if v_source = 'custom'
     and coalesce(p_custom_price_monthly, 0) <= 0
     and coalesce(p_custom_price_yearly, 0) <= 0 then
    raise exception 'custom_price_required';
  end if;

  select upper(nullif(trim(subscription_billing_currency), ''))
  into v_existing
  from public.company_commercial_terms
  where company_id = p_company_id;

  v_currency := upper(nullif(trim(coalesce(p_subscription_billing_currency, '')), ''));
  if v_currency is null then
    v_currency := coalesce(v_existing, public.resolve_subscription_billing_currency(p_company_id));
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_subscription_billing_currency';
  end if;

  insert into public.company_commercial_terms (
    company_id, pricing_source, discount_percent,
    custom_price_monthly, custom_price_yearly, notes,
    subscription_billing_currency,
    configured_at, configured_by, updated_at
  )
  values (
    p_company_id, v_source, coalesce(p_discount_percent, 0),
    p_custom_price_monthly, p_custom_price_yearly, nullif(trim(coalesce(p_notes, '')), ''),
    v_currency,
    now(), auth.uid(), now()
  )
  on conflict (company_id) do update
  set
    pricing_source = excluded.pricing_source,
    discount_percent = excluded.discount_percent,
    custom_price_monthly = excluded.custom_price_monthly,
    custom_price_yearly = excluded.custom_price_yearly,
    notes = excluded.notes,
    subscription_billing_currency = excluded.subscription_billing_currency,
    configured_at = now(),
    configured_by = auth.uid(),
    updated_at = now()
  returning * into v_row;

  -- Lifecycle copy — do not touch company operational currency.
  update public.company_subscriptions
  set billing_currency = v_currency,
      updated_at = now()
  where company_id = p_company_id
    and (billing_currency is distinct from v_currency);

  perform public.write_billing_audit_log(
    'company_commercial_terms_updated',
    p_company_id,
    null,
    to_jsonb(v_row),
    'manual',
    jsonb_build_object(
      'source', 'upsert_company_commercial_terms_v1',
      'subscription_billing_currency', v_currency
    )
  );

  return jsonb_build_object(
    'ok', true,
    'terms', to_jsonb(v_row),
    'payable', public.resolve_company_payable_amount(p_company_id)
  );
end;
$$;

revoke all on function public.upsert_company_commercial_terms_v1(uuid, text, numeric, numeric, numeric, text, text) from public, anon;
grant execute on function public.upsert_company_commercial_terms_v1(uuid, text, numeric, numeric, numeric, text, text) to authenticated, service_role;

-- ── Checkout settlement: validate subscription currency only ─

create or replace function public._assert_checkout_subscription_currency(
  p_company_id uuid,
  p_session_currency text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_currency text;
begin
  v_currency := public.resolve_subscription_billing_currency(p_company_id);
  if v_currency is null or trim(v_currency) = '' then
    raise exception 'CURRENCY_MISMATCH: subscription billing currency not configured';
  end if;
  if lower(trim(coalesce(p_session_currency, ''))) <> lower(trim(v_currency)) then
    raise exception 'CURRENCY_MISMATCH: checkout currency % != subscription billing currency %',
      p_session_currency, v_currency;
  end if;
  return v_currency;
end;
$$;

revoke all on function public._assert_checkout_subscription_currency(uuid, text) from public, anon, authenticated;
grant execute on function public._assert_checkout_subscription_currency(uuid, text) to service_role;

-- Patch settle functions by redefining currency resolution blocks via wrappers is fragile;
-- replace the two known CURRENCY_MISMATCH sites by recreating settle helpers that call assert.

-- settle_billing_checkout_session_v1 (manual) — currency section only via full recreate is large.
-- Instead: create a trigger-like helper used at the validation points by replacing the
-- settle functions' currency lookups. Read current settle bodies from 304 and patch.

do $$
begin
  -- Soft documentation marker for operators.
  raise notice '351 dual currency: resolve_company_payable_amount + upsert now use subscription_billing_currency';
end $$;


-- ── Patched checkout settlement + portal summary (subscription currency) ──

create or replace function public.record_saas_checkout_payment_documents_v1(
  p_checkout_session_id uuid,
  p_amount_mode text default 'manual'
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
  v_method_label text;
  v_provider_code text;
  v_method_code text;
  v_payment_terms_days integer;
  v_due_at timestamptz;
  v_amount_mode text := lower(trim(coalesce(nullif(trim(p_amount_mode), ''), 'manual')));
  v_idempotency_key text;
  v_provider_payment_id text;
  v_existing_id uuid;
  v_existing_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SETTLEMENT_AUTH_REQUIRED: service_role required';
  end if;

  if v_amount_mode not in ('manual', 'list_price') then
    raise exception 'Invalid amount_mode: % (expected manual|list_price)', v_amount_mode;
  end if;

  select * into v_session
  from public.billing_checkout_sessions
  where id = p_checkout_session_id
  for update;

  if not found then
    raise exception 'CHECKOUT_NOT_FOUND: checkout session % not found', p_checkout_session_id;
  end if;

  v_idempotency_key := 'saas_checkout:' || v_session.id::text;
  v_provider_payment_id := coalesce(
    nullif(trim(v_session.provider_payment_id), ''),
    nullif(trim(v_session.provider_session_id), '')
  );

  if v_idempotency_key is not null then
    select bp.id, bp.status into v_existing_id, v_existing_status
    from public.billing_payments bp
    where bp.company_id = v_session.company_id
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

  select * into v_sub
  from public.company_subscriptions
  where id = v_session.subscription_id
  for update;
  if not found then
    raise exception 'SUBSCRIPTION_MISMATCH: subscription not found';
  end if;

  select * into v_plan from public.plans where id = v_session.plan_id;
  if not found then
    raise exception 'CHECKOUT_NOT_FOUND: locked plan missing';
  end if;

  v_currency := public._assert_checkout_subscription_currency(v_session.company_id, v_session.currency);

  v_subtotal := v_session.amount;
  if v_subtotal is null or v_subtotal <= 0 then
    raise exception 'AMOUNT_MISMATCH: locked checkout amount is missing or non-positive';
  end if;

  v_tax_rate := coalesce(
    nullif(public.resolve_billing_setting_value('vat_percentage', v_session.company_id)::text, 'null')::numeric,
    0
  );
  v_tax_amount := round(v_subtotal * v_tax_rate / 100.0, 2);
  v_total := v_subtotal + v_tax_amount;

  v_period_start := coalesce(v_sub.current_period_start, v_now);
  v_period_end := coalesce(v_sub.current_period_end, v_now);

  v_method_code := 'manual';
  v_method_id := public.resolve_payment_method_type_id(v_method_code, v_session.company_id);

  select coalesce(nullif(trim(pmt.display_name), ''), pmt.code)
  into v_method_label
  from public.payment_method_types pmt
  where pmt.id = v_method_id;

  v_provider_code := coalesce(nullif(trim(v_session.provider_code), ''), 'manual');

  v_payment_terms_days := greatest(
    coalesce(public.resolve_billing_setting_integer('default_payment_terms_days', v_session.company_id), 30),
    0
  );
  v_due_at := v_now + (v_payment_terms_days || ' days')::interval;
  v_invoice_number := public.format_billing_document_number('invoice', v_session.company_id);
  v_receipt_number := public.format_billing_document_number('receipt', v_session.company_id);

  insert into public.billing_payments (
    company_id, subscription_id, payment_method_type_id, payment_method_label,
    provider, provider_payment_id, status, amount, currency, paid_at, metadata,
    idempotency_key
  )
  values (
    v_session.company_id, v_sub.id, v_method_id, v_method_label,
    v_provider_code, v_provider_payment_id, 'succeeded', v_total, v_currency, v_now,
    jsonb_build_object(
      'payment_method_code', v_method_code,
      'amount_mode', v_amount_mode,
      'source', 'saas_checkout',
      'checkout_session_id', v_session.id,
      'pre_approval', true,
      'locked_subtotal', v_subtotal
    ),
    v_idempotency_key
  )
  returning id into v_payment_id;

  insert into public.billing_invoices (
    invoice_number, company_id, subscription_id, billing_payment_id, status, currency,
    subtotal_amount, tax_amount, total_amount, period_start, period_end, line_items,
    billing_contact_snapshot, company_snapshot, issued_at, due_at, paid_at
  )
  values (
    v_invoice_number, v_session.company_id, v_sub.id, v_payment_id, 'paid', v_currency,
    v_subtotal, v_tax_amount, v_total, v_period_start, v_period_end,
    jsonb_build_array(jsonb_build_object(
      'description', coalesce(v_plan.display_name, v_plan.name, 'Subscription'),
      'quantity', 1, 'unit_amount', v_subtotal, 'total_amount', v_subtotal
    )),
    coalesce(public.build_billing_contact_snapshot(v_session.company_id), '{}'::jsonb),
    coalesce(public.build_billing_company_snapshot(v_session.company_id), '{}'::jsonb),
    v_now, v_due_at, v_now
  )
  returning id into v_invoice_id;

  insert into public.billing_receipts (
    receipt_number, company_id, subscription_id, billing_invoice_id, billing_payment_id,
    amount, currency, payment_method_label, company_snapshot, billing_contact_snapshot, issued_at
  )
  values (
    v_receipt_number, v_session.company_id, v_sub.id, v_invoice_id, v_payment_id,
    v_total, v_currency, v_method_label,
    coalesce(public.build_billing_company_snapshot(v_session.company_id), '{}'::jsonb),
    coalesce(public.build_billing_contact_snapshot(v_session.company_id), '{}'::jsonb),
    v_now
  )
  returning id into v_receipt_id;

  update public.billing_payments
  set receipt_id = v_receipt_id,
      billing_invoice_id = v_invoice_id
  where id = v_payment_id;

  perform public.write_billing_audit_log(
    'pre_approval_payment_recorded',
    v_session.company_id,
    null,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'checkout_session_id', v_session.id,
      'amount', v_total,
      'currency', v_currency,
      'locked_subtotal', v_subtotal,
      'amount_mode', v_amount_mode
    ),
    'system',
    jsonb_build_object('source', 'record_saas_checkout_payment_documents_v1')
  );

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'invoice_id', v_invoice_id,
    'receipt_id', v_receipt_id,
    'invoice_number', v_invoice_number,
    'receipt_number', v_receipt_number,
    'subscription_id', v_sub.id,
    'period_end', v_period_end,
    'amount_mode', v_amount_mode,
    'amount', v_total,
    'currency', v_currency,
    'pre_approval', true,
    'advance_period', false
  );
end;
$$;

revoke all on function public.record_saas_checkout_payment_documents_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.record_saas_checkout_payment_documents_v1(uuid, text) to service_role;

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
  v_company public.companies%rowtype;
  v_locked numeric;
  v_currency text;
  v_prior_status text;
  v_convert jsonb;
  v_renew jsonb;
  v_idem text;
  v_provider_payment text;
  v_payment_id uuid;
  v_amount_mode text;
  v_approval text;
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

  select * into v_company
  from public.companies
  where id = v_session.company_id
  for update;
  if not found then
    raise exception 'COMPANY_MISMATCH: company not found';
  end if;

  if v_company.status = 'Suspended' then
    raise exception 'INVALID_SUBSCRIPTION_STATE: cannot settle payment for a suspended company';
  end if;

  v_approval := coalesce(v_company.approval_status, 'approved');
  if v_approval = 'rejected' then
    raise exception 'INVALID_SUBSCRIPTION_STATE: cannot settle payment for a rejected company';
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

  if v_sub.status <> 'trialing' and v_sub.plan_id is distinct from v_session.plan_id then
    raise exception 'ONLINE_PACKAGE_CHANGE_NOT_SUPPORTED: checkout plan differs from subscription plan';
  end if;

  if v_session.billing_cycle <> v_sub.billing_cycle and v_sub.status <> 'trialing' then
    raise exception 'SUBSCRIPTION_MISMATCH: billing cycle mismatch';
  end if;

  v_locked := (v_session.metadata->>'payable_amount')::numeric;
  if v_locked is null then
    v_locked := v_session.amount;
  end if;
  if v_locked is null or v_locked <= 0 then
    raise exception 'AMOUNT_MISMATCH: locked checkout amount is missing or non-positive';
  end if;
  if abs(v_session.amount - v_locked) > 0.009 then
    raise exception 'AMOUNT_MISMATCH: checkout amount % != locked payable %', v_session.amount, v_locked;
  end if;

  v_amount_mode := lower(trim(coalesce(nullif(trim(v_session.metadata->>'amount_mode'), ''), 'list_price')));
  if v_amount_mode not in ('manual', 'list_price') then
    v_amount_mode := 'list_price';
  end if;

  -- Catalog custom without negotiated checkout lock cannot settle online.
  if v_plan.pricing_mode = 'custom' and v_amount_mode = 'list_price' then
    raise exception 'CUSTOM_PRICING_REQUIRES_MANUAL_BILLING: custom packages cannot settle online';
  end if;

  v_currency := public._assert_checkout_subscription_currency(v_session.company_id, v_session.currency);

  v_prior_status := v_sub.status;
  v_provider_payment := coalesce(
    nullif(trim(v_session.provider_payment_id), ''),
    nullif(trim(v_session.provider_session_id), '')
  );
  v_idem := 'saas_checkout:' || v_session.id::text;

  -- Pending: persist payment for approval workflow. Do not approve, convert trial, or activate.
  if v_approval = 'pending' then
    v_renew := public.record_saas_checkout_payment_documents_v1(v_session.id, v_amount_mode);
    v_payment_id := (v_renew->>'payment_id')::uuid;
    if v_payment_id is null then
      raise exception 'SETTLEMENT_FAILED: pre-approval payment did not return payment_id';
    end if;

    update public.companies
    set pre_approval_paid_at = coalesce(pre_approval_paid_at, now()),
        pre_approval_billing_payment_id = coalesce(pre_approval_billing_payment_id, v_payment_id),
        updated_at = now()
    where id = v_session.company_id
      and approval_status = 'pending';

    update public.billing_checkout_sessions
    set settled_at = now(),
        billing_payment_id = v_payment_id,
        settlement_code = 'PRE_APPROVAL_PAID',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'settlement', v_renew,
          'prior_status', v_prior_status,
          'approval_status', 'pending'
        ),
        updated_at = now()
    where id = v_session.id
    returning * into v_session;

    return jsonb_build_object(
      'ok', true,
      'code', 'SETTLEMENT_SUCCEEDED',
      'idempotent_replay', false,
      'settlement_code', v_session.settlement_code,
      'checkout_session_id', v_session.id,
      'company_id', v_session.company_id,
      'subscription_id', v_session.subscription_id,
      'billing_payment_id', v_payment_id,
      'prior_status', v_prior_status,
      'trial_conversion', null,
      'approval_status', 'pending',
      'payment', v_renew
    );
  end if;

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
        'trial_conversion', true,
        'amount_mode', v_amount_mode
      ),
      'manual',
      v_idem,
      v_amount_mode,
      v_session.subscription_id,
      false
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
        'prior_status', v_prior_status,
        'amount_mode', v_amount_mode
      ),
      'manual',
      v_idem,
      v_amount_mode,
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

revoke all on function public.settle_saas_verified_payment_v1(uuid) from public, anon, authenticated;
grant execute on function public.settle_saas_verified_payment_v1(uuid) to service_role;

create or replace function internal.get_workspace_billing_summary_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = internal, public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_result jsonb;
  v_currency text;
  v_payable jsonb;
  v_operational text;
  v_portal text;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_access_workspace() then raise exception 'Insufficient permissions'; end if;
  if v_company_id is null then raise exception 'No company context'; end if;

  v_payable := public.resolve_company_payable_amount(v_company_id);
  v_currency := coalesce(
    nullif(trim(v_payable->>'currency'), ''),
    public.resolve_subscription_billing_currency(v_company_id)
  );
  v_operational := public.resolve_company_operational_currency(v_company_id);

  select jsonb_build_object(
    'schema_version', 1,
    'company_id', v_company_id,
    'subscription', to_jsonb(cs.*),
    'plan', to_jsonb(p.*),
    'company', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'logo_url', c.logo_url,
      'status', c.status,
      'approval_status', c.approval_status
    ),
    'billing_contact', (
      select to_jsonb(bc.*) from public.company_billing_contacts bc
      where bc.company_id = v_company_id and bc.is_active = true limit 1
    ),
    'next_invoice_amount', (v_payable->>'payable_amount')::numeric,
    'list_price_amount', (v_payable->>'list_amount')::numeric,
    'payable_source', v_payable->>'source',
    'discount_percent', (v_payable->>'discount_percent')::numeric,
    'online_checkout_allowed', coalesce((v_payable->>'online_checkout_allowed')::boolean, false),
    'approval_status', c.approval_status,
    'pre_approval_paid', (c.pre_approval_paid_at is not null),
    'pre_approval_paid_at', c.pre_approval_paid_at,
    'currency', v_currency,
    'subscription_billing_currency', v_currency,
    'operational_currency', v_operational,
    'workspace_health', case
      when cs.status in ('active', 'trialing') then 'healthy'
      when cs.status in ('past_due', 'grace_period') then 'at_risk'
      else 'critical'
    end
  ) into v_result
  from public.company_subscriptions cs
  join public.companies c on c.id = cs.company_id
  left join public.plans p on p.id = cs.plan_id
  where cs.company_id = v_company_id;

  if v_result is null then
    return jsonb_build_object('schema_version', 1, 'company_id', v_company_id, 'subscription', null);
  end if;

  v_portal := case
    when coalesce(v_result->>'approval_status', 'approved') = 'pending'
         and coalesce((v_result->>'pre_approval_paid')::boolean, false) then 'awaiting_approval'
    when coalesce(v_result->>'approval_status', 'approved') = 'pending'
         and (
           v_result->'subscription'->>'plan_id' is null
           or (v_result->>'next_invoice_amount') is null
           or coalesce((v_result->>'next_invoice_amount')::numeric, 0) <= 0
           or coalesce(v_result->>'payable_source', 'none') in ('none', 'free')
         ) then 'not_configured'
    when coalesce(v_result->>'approval_status', 'approved') = 'pending' then 'payment_required'
    else 'standard'
  end;

  return v_result || jsonb_build_object('payment_portal_state', v_portal);
end;
$$;
