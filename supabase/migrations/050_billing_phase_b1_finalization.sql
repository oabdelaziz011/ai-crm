-- ============================================================
-- Vault OS – Billing Phase B.1 finalization
-- 1. Internal notification bus emit helper
-- 2. Publisher wiring on billing/financial mutation RPCs
-- 3. role_permissions for migration 047 workspace permissions
-- Architecture: enterprise-billing-platform-v2.1 §4, §16–17
-- Additive only; idempotent.
-- ============================================================

-- ── 1. Internal emit (callable from SECURITY DEFINER RPCs) ───

create or replace function public.notification_bus_emit_v1(
  p_event_code text,
  p_company_id uuid default null,
  p_user_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_channels text[] default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_channels text[];
  v_company_id uuid;
begin
  if not exists (
    select 1 from public.billing_event_catalog c
    where c.code = p_event_code and c.is_active = true
  ) then
    raise exception 'Unregistered billing event: %', p_event_code;
  end if;

  v_company_id := p_company_id;

  select coalesce(p_channels, c.default_channels) into v_channels
  from public.billing_event_catalog c
  where c.code = p_event_code;

  insert into public.billing_notification_events (
    event_code, company_id, user_id, payload, channels, idempotency_key, schema_version
  )
  values (
    p_event_code,
    v_company_id,
    p_user_id,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(v_channels, array[]::text[]),
    p_idempotency_key,
    1
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select e.id into v_id
    from public.billing_notification_events e
    where e.idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end;
$$;

revoke all on function public.notification_bus_emit_v1(text, uuid, uuid, jsonb, text[], text) from public;

create or replace function public.notification_bus_publish_v1(
  p_event_code text,
  p_company_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_channels text[] default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  return public.notification_bus_emit_v1(
    p_event_code,
    coalesce(p_company_id, public.current_company_id()),
    auth.uid(),
    p_payload,
    p_channels,
    p_idempotency_key
  );
end;
$$;

-- ── 2. Mutation RPC publisher wiring ─────────────────────────

create or replace function public.renew_subscription_from_payment(
  p_company_id uuid,
  p_amount numeric,
  p_currency text default null,
  p_payment_method_label text default null,
  p_provider text default null,
  p_provider_payment_id text default null,
  p_metadata jsonb default '{}'::jsonb
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
  v_manual_method_id uuid;
  v_now timestamptz := now();
  v_previous_status text;
  v_method_label text;
  v_provider_code text;
  v_bus_detail text;
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

  select id into v_manual_method_id from public.payment_method_types where code = 'manual' limit 1;

  select coalesce(
    nullif(trim(p_payment_method_label), ''),
    nullif(trim(pmt.display_name), ''),
    pmt.code
  )
  into v_method_label
  from public.payment_method_types pmt
  where pmt.id = v_manual_method_id;

  v_provider_code := coalesce(nullif(trim(p_provider), ''), 'manual');

  v_invoice_number := public.format_billing_document_number('invoice', p_company_id);
  v_receipt_number := public.format_billing_document_number('receipt', p_company_id);

  insert into public.billing_payments (
    company_id, subscription_id, payment_method_type_id, payment_method_label,
    provider, provider_payment_id, status, amount, currency, paid_at, metadata
  )
  values (
    p_company_id, v_sub.id, v_manual_method_id, v_method_label,
    v_provider_code, p_provider_payment_id, 'succeeded', v_total, v_currency, v_now,
    coalesce(p_metadata, '{}'::jsonb)
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
    v_now, v_now, v_now
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
      next_renewal_at = v_period_end,
      trial_ends_at = case when v_sub.status = 'trialing' then v_period_end else trial_ends_at end,
      grace_period_ends_at = null,
      payment_method_label = coalesce(v_method_label, payment_method_label),
      updated_at = v_now
  where id = v_sub.id;

  perform public.sync_company_subscription_denormalized(p_company_id);
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'invoice_generated', 'Invoice Generated', v_invoice_number,
    jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number));
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'payment_received', 'Payment Received',
    v_total::text || ' ' || v_currency, jsonb_build_object('payment_id', v_payment_id, 'amount', v_total, 'currency', v_currency));
  perform public.emit_subscription_event(p_company_id, v_sub.id, 'receipt_generated', 'Receipt Generated', v_receipt_number,
    jsonb_build_object('receipt_id', v_receipt_id, 'receipt_number', v_receipt_number));
  perform public.emit_subscription_event(p_company_id, v_sub.id,
    case when v_previous_status in ('trialing', 'expired', 'grace_period', 'past_due') then 'subscription_activated' else 'renewed' end,
    case when v_previous_status in ('trialing', 'expired', 'grace_period', 'past_due') then 'Subscription Activated' else 'Subscription Renewed' end,
    null, jsonb_build_object('period_end', v_period_end, 'previous_status', v_previous_status));

  perform public.write_billing_audit_log('manual_payment_recorded', p_company_id, null,
    jsonb_build_object('payment_id', v_payment_id, 'invoice_id', v_invoice_id, 'receipt_id', v_receipt_id,
      'amount', v_total, 'currency', v_currency), 'manual', jsonb_build_object('provider', v_provider_code));
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
    'subscription_id', v_sub.id, 'period_end', v_period_end
  );
end;
$$;

create or replace function public.assign_subscription_plan(
  p_company_id uuid,
  p_plan_id uuid,
  p_billing_cycle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_previous jsonb;
  v_cycle text;
  v_previous_cycle text;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_edit_billing() then raise exception 'Insufficient permissions to assign subscription plan'; end if;
  if not public.can_view_billing_company(p_company_id) then raise exception 'Cannot assign plan for this company'; end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active = true;
  if not found then raise exception 'Plan not found or inactive'; end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then raise exception 'Subscription not found for company %', p_company_id; end if;

  v_cycle := coalesce(nullif(trim(p_billing_cycle), ''), v_sub.billing_cycle);
  if v_cycle not in ('monthly', 'yearly') then raise exception 'Invalid billing cycle: %', v_cycle; end if;

  v_previous_cycle := v_sub.billing_cycle;
  v_previous := jsonb_build_object(
    'plan_id', v_sub.plan_id,
    'billing_cycle', v_sub.billing_cycle,
    'status', v_sub.status
  );

  update public.company_subscriptions
  set plan_id = p_plan_id, billing_cycle = v_cycle, updated_at = now()
  where id = v_sub.id;

  perform public.sync_company_subscription_denormalized(p_company_id);

  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'plan_changed', 'Plan Changed',
    coalesce(v_plan.display_name, v_plan.name),
    jsonb_build_object('plan_id', p_plan_id, 'billing_cycle', v_cycle, 'previous_plan_id', v_sub.plan_id)
  );

  perform public.write_billing_audit_log(
    'plan_changed', p_company_id, v_previous,
    jsonb_build_object('plan_id', p_plan_id, 'billing_cycle', v_cycle),
    'manual', jsonb_build_object('plan_code', v_plan.code)
  );

  perform public.notification_bus_emit_v1(
    'billing.plan.changed', p_company_id, auth.uid(),
    jsonb_build_object(
      'plan_id', p_plan_id,
      'plan_code', v_plan.code,
      'plan_name', coalesce(v_plan.display_name, v_plan.name),
      'detail', coalesce(v_plan.display_name, v_plan.name)
    ),
    null, 'billing.plan.changed:' || p_company_id::text || ':' || p_plan_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
  );

  if v_previous_cycle is distinct from v_cycle then
    perform public.notification_bus_emit_v1(
      'billing.cycle.changed', p_company_id, auth.uid(),
      jsonb_build_object('billing_cycle', v_cycle, 'previous_cycle', v_previous_cycle, 'detail', v_cycle),
      null, 'billing.cycle.changed:' || p_company_id::text || ':' || v_cycle
    );
  end if;

  return jsonb_build_object(
    'company_id', p_company_id,
    'plan_id', p_plan_id,
    'billing_cycle', v_cycle
  );
end;
$$;

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
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_edit_billing() then raise exception 'Insufficient permissions to suspend subscription'; end if;
  if not public.can_view_billing_company(p_company_id) then raise exception 'Cannot suspend subscription for this company'; end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then raise exception 'Subscription not found for company %', p_company_id; end if;

  select jsonb_build_object('company_status', c.status, 'subscription_status', v_sub.status)
  into v_previous
  from public.companies c where c.id = p_company_id;

  update public.companies set status = 'Suspended', updated_at = now() where id = p_company_id;

  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'suspended', 'Subscription Suspended', v_reason,
    jsonb_build_object('reason', p_reason)
  );

  perform public.write_billing_audit_log(
    'subscription_suspended', p_company_id, v_previous,
    jsonb_build_object('company_status', 'Suspended', 'reason', p_reason),
    'manual', jsonb_build_object('subscription_id', v_sub.id)
  );

  perform public.notification_bus_emit_v1(
    'billing.subscription.suspended', p_company_id, auth.uid(),
    jsonb_build_object('subscription_id', v_sub.id, 'reason', v_reason, 'detail', v_reason),
    null, 'billing.subscription.suspended:' || p_company_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
  );

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
  v_was_suspended boolean := false;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_edit_billing() then raise exception 'Insufficient permissions to restore subscription'; end if;
  if not public.can_view_billing_company(p_company_id) then raise exception 'Cannot restore subscription for this company'; end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then raise exception 'Subscription not found for company %', p_company_id; end if;

  select jsonb_build_object('company_status', c.status, 'subscription_status', v_sub.status)
  into v_previous
  from public.companies c where c.id = p_company_id;

  v_was_suspended := coalesce(v_previous->>'company_status', '') = 'Suspended';

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

  perform public.notification_bus_emit_v1(
    'billing.subscription.restored', p_company_id, auth.uid(),
    jsonb_build_object('subscription_id', v_sub.id, 'company_status', v_new_status, 'detail', v_reason),
    null, 'billing.subscription.restored:' || p_company_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
  );

  if v_was_suspended then
    perform public.notification_bus_emit_v1(
      'workspace.company.reactivated', p_company_id, auth.uid(),
      jsonb_build_object('company_id', p_company_id, 'detail', 'Company access restored'),
      null, 'workspace.company.reactivated:' || p_company_id::text || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
    );
  end if;

  return jsonb_build_object('company_id', p_company_id, 'company_status', v_new_status);
end;
$$;

revoke all on function public.renew_subscription_from_payment(uuid, numeric, text, text, text, text, jsonb) from public;
grant execute on function public.renew_subscription_from_payment(uuid, numeric, text, text, text, text, jsonb) to authenticated;

-- ── 3. role_permissions for migration 047 permissions ────────

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where lower(trim(r.name)) in ('admin', 'company admin', 'company_admin', 'owner')
  and p.code in (
    'workspace.view',
    'billing.view_own',
    'billing.manage_own',
    'billing.contact.edit_own',
    'billing.payment_method.manage_own',
    'billing.documents.download_own'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where lower(trim(r.name)) in ('finance manager', 'finance_manager')
  and p.code in (
    'workspace.view',
    'billing.view_own',
    'billing.manage_own',
    'billing.contact.edit_own',
    'billing.payment_method.manage_own',
    'billing.documents.download_own'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where lower(trim(r.name)) in ('employee', 'viewer', 'standard user')
  and p.code in (
    'workspace.view',
    'billing.view_own',
    'billing.documents.download_own'
  )
on conflict do nothing;

-- Platform billing operator roles (if present)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where lower(trim(r.name)) in ('platform billing operator', 'billing operator', 'finance')
  and p.code = 'workspace.view'
on conflict do nothing;
