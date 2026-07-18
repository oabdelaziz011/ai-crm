-- ============================================================
-- Vault OS – Billing: Core RPCs (Phase 1)
-- Architecture: billing-subscriptions.md v4 §2.6, §3.4, §8
-- ============================================================

-- ── Document number sequences ───────────────────────────────

create table if not exists public.billing_document_sequences (
  id uuid primary key default gen_random_uuid(),
  sequence_key text not null unique,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.billing_document_sequences enable row level security;
drop policy if exists billing_document_sequences_all on public.billing_document_sequences;
create policy billing_document_sequences_all on public.billing_document_sequences for all using (false);

-- ── Audit log writer ────────────────────────────────────────

create or replace function public.write_billing_audit_log(
  p_event_type text,
  p_company_id uuid default null,
  p_previous_value jsonb default null,
  p_new_value jsonb default null,
  p_source text default 'system',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.billing_audit_logs (
    event_type,
    company_id,
    user_id,
    source,
    previous_value,
    new_value,
    metadata,
    ip_address,
    occurred_at
  )
  values (
    p_event_type,
    p_company_id,
    auth.uid(),
    coalesce(p_source, 'system'),
    p_previous_value,
    p_new_value,
    coalesce(p_metadata, '{}'::jsonb),
    public.request_ip_address(),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ── Billing settings resolver ───────────────────────────────

create or replace function public.get_billing_setting(
  p_code text,
  p_company_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value jsonb;
  v_default jsonb;
begin
  if p_company_id is not null then
    select s.value
    into v_value
    from public.billing_settings s
    where s.definition_code = p_code
      and s.scope_type = 'company'
      and s.scope_id = p_company_id
    limit 1;

    if v_value is not null then
      return v_value;
    end if;
  end if;

  select s.value
  into v_value
  from public.billing_settings s
  where s.definition_code = p_code
    and s.scope_type = 'platform'
    and s.scope_id is null
  limit 1;

  if v_value is not null then
    return v_value;
  end if;

  select d.default_value into v_default
  from public.billing_setting_definitions d
  where d.code = p_code
    and d.is_active = true
  limit 1;

  return coalesce(v_default, 'null'::jsonb);
end;
$$;

create or replace function public.get_billing_settings_by_category(
  p_category text,
  p_scope_type text default 'platform',
  p_company_id uuid default null
)
returns table (
  code text,
  category text,
  label text,
  description text,
  value_type text,
  scope_type text,
  value jsonb,
  default_value jsonb,
  version integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.code,
    d.category,
    d.label,
    d.description,
    d.value_type,
    p_scope_type as scope_type,
    coalesce(
      s.value,
      case when p_scope_type = 'platform' then ps.value else cs.value end,
      d.default_value
    ) as value,
    d.default_value,
    coalesce(s.version, case when p_scope_type = 'platform' then ps.version else cs.version end, 0) as version
  from public.billing_setting_definitions d
  left join public.billing_settings s
    on s.definition_code = d.code
   and s.scope_type = p_scope_type
   and (
     (p_scope_type = 'platform' and s.scope_id is null)
     or (p_scope_type = 'company' and s.scope_id = p_company_id)
   )
  left join public.billing_settings ps
    on ps.definition_code = d.code
   and ps.scope_type = 'platform'
   and ps.scope_id is null
  left join public.billing_settings cs
    on cs.definition_code = d.code
   and cs.scope_type = 'company'
   and cs.scope_id = p_company_id
  where d.category = p_category
    and d.is_active = true
    and (
      d.scope_type = p_scope_type
      or d.scope_type = 'both'
    )
  order by d.sort_order, d.code;
$$;

create or replace function public.update_billing_settings(
  p_scope_type text,
  p_company_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_value jsonb;
  v_previous jsonb;
  v_results jsonb := '{}'::jsonb;
begin
  if not public.is_super_admin()
     and not (
       p_scope_type = 'company'
       and p_company_id = public.current_company_id()
       and public.is_company_admin()
     ) then
    raise exception 'Insufficient permissions to update billing settings';
  end if;

  for v_key, v_value in
    select key, value
    from jsonb_each(coalesce(p_changes, '{}'::jsonb))
  loop
    if not exists (
      select 1
      from public.billing_setting_definitions d
      where d.code = v_key
        and d.is_active = true
        and (
          d.scope_type = p_scope_type
          or d.scope_type = 'both'
        )
    ) then
      raise exception 'Unknown or invalid billing setting: %', v_key;
    end if;

    select coalesce(s.value, public.get_billing_setting(v_key, p_company_id))
    into v_previous;

    insert into public.billing_settings (
      definition_code,
      scope_type,
      scope_id,
      value,
      version,
      updated_by,
      updated_at
    )
    values (
      v_key,
      p_scope_type,
      case when p_scope_type = 'company' then p_company_id else null end,
      v_value,
      1,
      auth.uid(),
      now()
    )
    on conflict (definition_code, scope_type, scope_id)
    do update set
      value = excluded.value,
      version = public.billing_settings.version + 1,
      updated_by = auth.uid(),
      updated_at = now();

    v_results := v_results || jsonb_build_object(v_key, v_value);

    perform public.write_billing_audit_log(
      'billing_settings_modified',
      p_company_id,
      jsonb_build_object(v_key, v_previous),
      jsonb_build_object(v_key, v_value),
      'manual',
      jsonb_build_object('scope_type', p_scope_type, 'setting_code', v_key)
    );
  end loop;

  return v_results;
end;
$$;

-- ── Document numbering ──────────────────────────────────────

create or replace function public.format_billing_document_number(
  p_document_type text,
  p_company_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_format text;
  v_seq bigint;
  v_key text;
  v_company_short text;
  v_result text;
begin
  if p_document_type = 'invoice' then
    v_format := public.get_billing_setting('invoice_number_format', p_company_id)#>>'{}';
  elsif p_document_type = 'receipt' then
    v_format := public.get_billing_setting('receipt_number_format', p_company_id)#>>'{}';
  else
    raise exception 'Unsupported document type: %', p_document_type;
  end if;

  v_key := p_document_type || ':' || to_char(now(), 'YYYYMM');
  insert into public.billing_document_sequences (sequence_key, last_value)
  values (v_key, 1)
  on conflict (sequence_key)
  do update set
    last_value = public.billing_document_sequences.last_value + 1,
    updated_at = now()
  returning last_value into v_seq;

  v_company_short := case
    when p_company_id is null then 'PLAT'
    else upper(substr(replace(p_company_id::text, '-', ''), 1, 6))
  end;

  v_result := v_format;
  v_result := replace(v_result, '{YYYY}', to_char(now(), 'YYYY'));
  v_result := replace(v_result, '{MM}', to_char(now(), 'MM'));
  v_result := replace(v_result, '{COMPANY_ID_SHORT}', v_company_short);
  v_result := replace(v_result, '{SEQ}', lpad(v_seq::text, 6, '0'));

  return v_result;
end;
$$;

-- ── Denormalized company sync ───────────────────────────────

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
begin
  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id;

  if not found then
    return;
  end if;

  select p.name into v_plan_name
  from public.plans p
  where p.id = v_sub.plan_id;

  v_company_status := case
    when v_sub.status in ('expired') then 'Suspended'
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

-- ── Subscription events helper ──────────────────────────────

create or replace function public.emit_subscription_event(
  p_company_id uuid,
  p_subscription_id uuid,
  p_event_type text,
  p_title text,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.subscription_events (
    company_id,
    subscription_id,
    event_type,
    title,
    description,
    metadata,
    occurred_at
  )
  values (
    p_company_id,
    p_subscription_id,
    p_event_type,
    p_title,
    p_description,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_occurred_at, now())
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ── Company snapshots for documents ─────────────────────────

create or replace function public.build_billing_company_snapshot(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'company_id', c.id,
    'name', c.name,
    'company_type', c.company_type,
    'logo_url', c.logo_url
  )
  from public.companies c
  where c.id = p_company_id;
$$;

create or replace function public.build_billing_contact_snapshot(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', bc.name,
    'email', bc.email,
    'phone', bc.phone
  )
  from public.company_billing_contacts bc
  where bc.company_id = p_company_id
    and bc.is_active = true
  limit 1;
$$;

-- ── Manual / recorded payment → renew flow ──────────────────

create or replace function public.renew_subscription_from_payment(
  p_company_id uuid,
  p_amount numeric,
  p_currency text default null,
  p_payment_method_label text default 'Manual',
  p_provider text default 'manual',
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
begin
  if not public.is_super_admin() then
    raise exception 'Insufficient permissions to record subscription payment';
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  for update;

  if not found then
    raise exception 'Subscription not found for company %', p_company_id;
  end if;

  v_previous_status := v_sub.status;

  select * into v_plan from public.plans where id = v_sub.plan_id;

  v_currency := coalesce(
    p_currency,
    public.get_billing_setting('default_currency', p_company_id)#>>'{}',
    'USD'
  );

  v_tax_rate := coalesce(
    nullif(public.get_billing_setting('vat_percentage', p_company_id)::text, 'null')::numeric,
    0
  );

  v_subtotal := coalesce(p_amount, 0);
  v_tax_amount := round(v_subtotal * v_tax_rate / 100.0, 2);
  v_total := v_subtotal + v_tax_amount;

  v_period_start := coalesce(v_sub.current_period_end, v_now);
  v_period_end := case
    when v_sub.billing_cycle = 'yearly' then v_period_start + interval '1 year'
    else v_period_start + interval '1 month'
  end;

  select id into v_manual_method_id
  from public.payment_method_types
  where code = 'manual'
  limit 1;

  v_invoice_number := public.format_billing_document_number('invoice', p_company_id);
  v_receipt_number := public.format_billing_document_number('receipt', p_company_id);

  insert into public.billing_payments (
    company_id,
    subscription_id,
    payment_method_type_id,
    payment_method_label,
    provider,
    provider_payment_id,
    status,
    amount,
    currency,
    paid_at,
    metadata
  )
  values (
    p_company_id,
    v_sub.id,
    v_manual_method_id,
    coalesce(p_payment_method_label, 'Manual'),
    coalesce(p_provider, 'manual'),
    p_provider_payment_id,
    'succeeded',
    v_total,
    v_currency,
    v_now,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_payment_id;

  insert into public.billing_invoices (
    invoice_number,
    company_id,
    subscription_id,
    billing_payment_id,
    status,
    currency,
    subtotal_amount,
    tax_amount,
    total_amount,
    period_start,
    period_end,
    line_items,
    billing_contact_snapshot,
    company_snapshot,
    issued_at,
    due_at,
    paid_at
  )
  values (
    v_invoice_number,
    p_company_id,
    v_sub.id,
    v_payment_id,
    'paid',
    v_currency,
    v_subtotal,
    v_tax_amount,
    v_total,
    v_period_start,
    v_period_end,
    jsonb_build_array(
      jsonb_build_object(
        'description', coalesce(v_plan.display_name, v_plan.name, 'Subscription'),
        'quantity', 1,
        'unit_amount', v_subtotal,
        'total_amount', v_subtotal
      )
    ),
    coalesce(public.build_billing_contact_snapshot(p_company_id), '{}'::jsonb),
    coalesce(public.build_billing_company_snapshot(p_company_id), '{}'::jsonb),
    v_now,
    v_now,
    v_now
  )
  returning id into v_invoice_id;

  insert into public.billing_receipts (
    receipt_number,
    company_id,
    subscription_id,
    billing_invoice_id,
    billing_payment_id,
    amount,
    currency,
    payment_method_label,
    company_snapshot,
    billing_contact_snapshot,
    issued_at
  )
  values (
    v_receipt_number,
    p_company_id,
    v_sub.id,
    v_invoice_id,
    v_payment_id,
    v_total,
    v_currency,
    coalesce(p_payment_method_label, 'Manual'),
    coalesce(public.build_billing_company_snapshot(p_company_id), '{}'::jsonb),
    coalesce(public.build_billing_contact_snapshot(p_company_id), '{}'::jsonb),
    v_now
  )
  returning id into v_receipt_id;

  update public.billing_payments
  set receipt_id = v_receipt_id
  where id = v_payment_id;

  update public.company_subscriptions
  set
    status = 'active',
    current_period_start = v_period_start,
    current_period_end = v_period_end,
    next_renewal_at = v_period_end,
    trial_ends_at = case when status = 'trialing' then v_period_end else trial_ends_at end,
    grace_period_ends_at = null,
    payment_method_label = coalesce(p_payment_method_label, payment_method_label),
    updated_at = v_now
  where id = v_sub.id
  returning * into v_sub;

  perform public.sync_company_subscription_denormalized(p_company_id);

  perform public.emit_subscription_event(
    p_company_id,
    v_sub.id,
    'invoice_generated',
    'Invoice Generated',
    v_invoice_number,
    jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number)
  );

  perform public.emit_subscription_event(
    p_company_id,
    v_sub.id,
    'payment_received',
    'Payment Received',
    v_total::text || ' ' || v_currency,
    jsonb_build_object('payment_id', v_payment_id, 'amount', v_total, 'currency', v_currency)
  );

  perform public.emit_subscription_event(
    p_company_id,
    v_sub.id,
    'receipt_generated',
    'Receipt Generated',
    v_receipt_number,
    jsonb_build_object('receipt_id', v_receipt_id, 'receipt_number', v_receipt_number)
  );

  perform public.emit_subscription_event(
    p_company_id,
    v_sub.id,
    case
      when v_previous_status in ('trialing', 'expired', 'grace_period', 'past_due') then 'subscription_activated'
      else 'renewed'
    end,
    case
      when v_previous_status in ('trialing', 'expired', 'grace_period', 'past_due') then 'Subscription Activated'
      else 'Subscription Renewed'
    end,
    null,
    jsonb_build_object('period_end', v_period_end, 'previous_status', v_previous_status)
  );

  perform public.write_billing_audit_log(
    'manual_payment_recorded',
    p_company_id,
    null,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'invoice_id', v_invoice_id,
      'receipt_id', v_receipt_id,
      'amount', v_total,
      'currency', v_currency
    ),
    'manual',
    jsonb_build_object('provider', p_provider)
  );

  perform public.write_billing_audit_log(
    'receipt_generated',
    p_company_id,
    null,
    jsonb_build_object('receipt_id', v_receipt_id, 'receipt_number', v_receipt_number),
    'system',
    jsonb_build_object('payment_id', v_payment_id)
  );

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'invoice_id', v_invoice_id,
    'receipt_id', v_receipt_id,
    'invoice_number', v_invoice_number,
    'receipt_number', v_receipt_number,
    'subscription_id', v_sub.id,
    'period_end', v_period_end
  );
end;
$$;

grant execute on function public.get_billing_setting(text, uuid) to authenticated;
grant execute on function public.get_billing_settings_by_category(text, text, uuid) to authenticated;
grant execute on function public.update_billing_settings(text, uuid, jsonb) to authenticated;
grant execute on function public.renew_subscription_from_payment(uuid, numeric, text, text, text, text, jsonb) to authenticated;
