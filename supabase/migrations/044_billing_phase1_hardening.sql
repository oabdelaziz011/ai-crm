-- ============================================================
-- Vault OS – Billing Phase 1 Hardening
-- Resolves verification Critical/Major: RBAC, RLS, RPC auth, settings unique
-- ============================================================

-- ── Authorization helpers ─────────────────────────────────────

create or replace function public.is_platform_billing_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.user_has_permission('billing.view');
$$;

create or replace function public.can_view_own_billing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.user_has_permission('billing.view')
    or public.user_has_permission('billing.view_own')
    or public.user_has_permission('subscriptions.view');
$$;

create or replace function public.can_view_billing_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.user_has_permission('billing.view')
    or (
      p_company_id is not null
      and p_company_id = public.current_company_id()
      and (
        public.user_has_permission('billing.view_own')
        or public.user_has_permission('subscriptions.view')
        or public.is_company_admin()
      )
    );
$$;

create or replace function public.can_view_billing_settings(
  p_scope_type text,
  p_company_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_scope_type = 'platform' then
      public.is_super_admin() or public.user_has_permission('billing.settings.view')
    when p_scope_type = 'company' then
      public.is_super_admin()
      or public.user_has_permission('billing.settings.view')
      or (
        p_company_id = public.current_company_id()
        and public.is_company_admin()
        and public.user_has_permission('billing.settings.view')
      )
    else false
  end;
$$;

create or replace function public.can_edit_billing_settings(
  p_scope_type text,
  p_company_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_scope_type = 'platform' then
      public.is_super_admin() or public.user_has_permission('billing.settings.edit')
    when p_scope_type = 'company' then
      public.is_super_admin()
      or (
        public.user_has_permission('billing.settings.edit')
        and p_company_id = public.current_company_id()
        and public.is_company_admin()
      )
    else false
  end;
$$;

create or replace function public.can_record_billing_payment()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.user_has_permission('billing.record_payment');
$$;

create or replace function public.can_view_billing_audit(p_company_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.user_has_permission('billing.audit.view')
    or (
      p_company_id is not null
      and p_company_id = public.current_company_id()
      and public.is_company_admin()
      and public.user_has_permission('billing.audit.view')
    );
$$;

-- ── billing_settings uniqueness (platform NULL scope_id) ────

alter table public.billing_settings
  drop constraint if exists billing_settings_definition_code_scope_type_scope_id_key;

drop index if exists idx_billing_settings_platform_unique;
create unique index idx_billing_settings_platform_unique
  on public.billing_settings(definition_code, scope_type)
  where scope_type = 'platform' and scope_id is null;

drop index if exists idx_billing_settings_company_unique;
create unique index idx_billing_settings_company_unique
  on public.billing_settings(definition_code, scope_type, scope_id)
  where scope_type = 'company' and scope_id is not null;

-- ── Settings validation ─────────────────────────────────────

create or replace function public.validate_billing_setting_value(
  p_definition_code text,
  p_value jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_def public.billing_setting_definitions%rowtype;
  v_text text;
  v_num numeric;
  v_min numeric;
  v_max numeric;
begin
  select * into v_def
  from public.billing_setting_definitions d
  where d.code = p_definition_code
    and d.is_active = true;

  if not found then
    raise exception 'Unknown billing setting: %', p_definition_code;
  end if;

  if p_value is null or p_value = 'null'::jsonb then
    if v_def.default_value is null or v_def.default_value = 'null'::jsonb then
      return;
    end if;
    raise exception 'Value required for setting %', p_definition_code;
  end if;

  case v_def.value_type
    when 'boolean' then
      if jsonb_typeof(p_value) not in ('boolean') then
        raise exception 'Setting % expects boolean', p_definition_code;
      end if;
    when 'integer' then
      if jsonb_typeof(p_value) <> 'number' and not (jsonb_typeof(p_value) = 'string' and p_value::text ~ '^-?[0-9]+$') then
        raise exception 'Setting % expects integer', p_definition_code;
      end if;
      v_num := (p_value #>> '{}')::numeric;
      v_min := nullif(v_def.validation_schema->>'min', '')::numeric;
      v_max := nullif(v_def.validation_schema->>'max', '')::numeric;
      if v_min is not null and v_num < v_min then
        raise exception 'Setting % below minimum %', p_definition_code, v_min;
      end if;
      if v_max is not null and v_num > v_max then
        raise exception 'Setting % above maximum %', p_definition_code, v_max;
      end if;
    when 'decimal' then
      begin
        v_num := (p_value #>> '{}')::numeric;
      exception when others then
        raise exception 'Setting % expects decimal', p_definition_code;
      end;
      v_min := nullif(v_def.validation_schema->>'min', '')::numeric;
      v_max := nullif(v_def.validation_schema->>'max', '')::numeric;
      if v_min is not null and v_num < v_min then
        raise exception 'Setting % below minimum %', p_definition_code, v_min;
      end if;
      if v_max is not null and v_num > v_max then
        raise exception 'Setting % above maximum %', p_definition_code, v_max;
      end if;
    when 'string', 'template_ref' then
      v_text := p_value #>> '{}';
      if v_text is null or length(trim(v_text)) = 0 then
        if coalesce((v_def.validation_schema->>'allow_empty')::boolean, false) then
          return;
        end if;
        raise exception 'Setting % expects non-empty string', p_definition_code;
      end if;
    when 'json' then
      if jsonb_typeof(p_value) not in ('array', 'object', 'string', 'number', 'boolean') then
        raise exception 'Setting % expects json value', p_definition_code;
      end if;
    else
      null;
  end case;
end;
$$;

-- ── Internal helpers (not granted to clients) ───────────────

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
  if not exists (
    select 1 from public.billing_audit_event_types t
    where t.code = p_event_type and t.is_active = true
  ) then
    raise exception 'Invalid billing audit event type: %', p_event_type;
  end if;

  insert into public.billing_audit_logs (
    event_type, company_id, user_id, source,
    previous_value, new_value, metadata, ip_address, occurred_at
  )
  values (
    p_event_type, p_company_id, auth.uid(), coalesce(p_source, 'system'),
    p_previous_value, p_new_value, coalesce(p_metadata, '{}'::jsonb),
    public.request_ip_address(), now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

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
    company_id, subscription_id, event_type, title, description, metadata, occurred_at
  )
  values (
    p_company_id, p_subscription_id, p_event_type, p_title, p_description,
    coalesce(p_metadata, '{}'::jsonb), coalesce(p_occurred_at, now())
  )
  returning id into v_id;
  return v_id;
end;
$$;

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
  select * into v_sub from public.company_subscriptions where company_id = p_company_id;
  if not found then return; end if;

  select p.name into v_plan_name from public.plans p where p.id = v_sub.plan_id;

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
    v_format := public.resolve_billing_setting_value('invoice_number_format', p_company_id)#>>'{}';
  elsif p_document_type = 'receipt' then
    v_format := public.resolve_billing_setting_value('receipt_number_format', p_company_id)#>>'{}';
  else
    raise exception 'Unsupported document type: %', p_document_type;
  end if;

  if v_format is null or length(trim(v_format)) = 0 then
    raise exception 'Document number format not configured for %', p_document_type;
  end if;

  v_key := p_document_type || ':' || to_char(now(), 'YYYYMM');
  insert into public.billing_document_sequences (sequence_key, last_value)
  values (v_key, 1)
  on conflict (sequence_key)
  do update set last_value = public.billing_document_sequences.last_value + 1, updated_at = now()
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

create or replace function public.resolve_billing_setting_value(
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
    select s.value into v_value
    from public.billing_settings s
    where s.definition_code = p_code and s.scope_type = 'company' and s.scope_id = p_company_id
    limit 1;
    if v_value is not null then return v_value; end if;
  end if;

  select s.value into v_value
  from public.billing_settings s
  where s.definition_code = p_code and s.scope_type = 'platform' and s.scope_id is null
  limit 1;
  if v_value is not null then return v_value; end if;

  select d.default_value into v_default
  from public.billing_setting_definitions d
  where d.code = p_code and d.is_active = true
  limit 1;

  return coalesce(v_default, 'null'::jsonb);
end;
$$;

-- ── Public RPCs (authorized) ──────────────────────────────────

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
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  if not public.can_view_billing_settings(
    case when p_company_id is null then 'platform' else 'company' end,
    p_company_id
  ) and not public.is_platform_billing_operator() then
    raise exception 'Insufficient permissions to read billing settings';
  end if;

  if p_company_id is not null then
    select s.value into v_value
    from public.billing_settings s
    where s.definition_code = p_code and s.scope_type = 'company' and s.scope_id = p_company_id
    limit 1;
    if v_value is not null then return v_value; end if;
  end if;

  select s.value into v_value
  from public.billing_settings s
  where s.definition_code = p_code and s.scope_type = 'platform' and s.scope_id is null
  limit 1;
  if v_value is not null then return v_value; end if;

  select d.default_value into v_default
  from public.billing_setting_definitions d
  where d.code = p_code and d.is_active = true
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
  code text, category text, label text, description text,
  value_type text, scope_type text, value jsonb, default_value jsonb, version integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  if not public.can_view_billing_settings(p_scope_type, p_company_id) then
    raise exception 'Insufficient permissions to read billing settings';
  end if;

  return query
  select
    d.code, d.category, d.label, d.description, d.value_type, p_scope_type,
    coalesce(s.value, case when p_scope_type = 'platform' then ps.value else cs.value end, d.default_value),
    d.default_value,
    coalesce(s.version, case when p_scope_type = 'platform' then ps.version else cs.version end, 0)
  from public.billing_setting_definitions d
  left join public.billing_settings s
    on s.definition_code = d.code and s.scope_type = p_scope_type
   and ((p_scope_type = 'platform' and s.scope_id is null) or (p_scope_type = 'company' and s.scope_id = p_company_id))
  left join public.billing_settings ps
    on ps.definition_code = d.code and ps.scope_type = 'platform' and ps.scope_id is null
  left join public.billing_settings cs
    on cs.definition_code = d.code and cs.scope_type = 'company' and cs.scope_id = p_company_id
  where d.category = p_category and d.is_active = true
    and (d.scope_type = p_scope_type or d.scope_type = 'both')
  order by d.sort_order, d.code;
end;
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
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  if not public.can_edit_billing_settings(p_scope_type, p_company_id) then
    raise exception 'Insufficient permissions to update billing settings';
  end if;

  for v_key, v_value in select key, value from jsonb_each(coalesce(p_changes, '{}'::jsonb))
  loop
    if not exists (
      select 1 from public.billing_setting_definitions d
      where d.code = v_key and d.is_active = true
        and (d.scope_type = p_scope_type or d.scope_type = 'both')
    ) then
      raise exception 'Unknown or invalid billing setting: %', v_key;
    end if;

    perform public.validate_billing_setting_value(v_key, v_value);

    select coalesce(s.value, public.get_billing_setting(v_key, p_company_id)) into v_previous
    from public.billing_settings s
    where s.definition_code = v_key
      and s.scope_type = p_scope_type
      and ((p_scope_type = 'platform' and s.scope_id is null) or (p_scope_type = 'company' and s.scope_id = p_company_id))
    limit 1;

    if v_previous is null then
      v_previous := public.get_billing_setting(v_key, p_company_id);
    end if;

    insert into public.billing_settings (definition_code, scope_type, scope_id, value, version, updated_by, updated_at)
    select
      v_key, p_scope_type,
      case when p_scope_type = 'company' then p_company_id else null end,
      v_value, 1, auth.uid(), now()
    where not exists (
      select 1 from public.billing_settings s
      where s.definition_code = v_key
        and s.scope_type = p_scope_type
        and (
          (p_scope_type = 'platform' and s.scope_id is null)
          or (p_scope_type = 'company' and s.scope_id = p_company_id)
        )
    );

    update public.billing_settings
    set value = v_value, version = version + 1, updated_by = auth.uid(), updated_at = now()
    where definition_code = v_key
      and scope_type = p_scope_type
      and (
        (p_scope_type = 'platform' and scope_id is null)
        or (p_scope_type = 'company' and scope_id = p_company_id)
      );

    v_results := v_results || jsonb_build_object(v_key, v_value);

    perform public.write_billing_audit_log(
      'billing_settings_modified', p_company_id,
      jsonb_build_object(v_key, v_previous), jsonb_build_object(v_key, v_value),
      'manual', jsonb_build_object('scope_type', p_scope_type, 'setting_code', v_key)
    );
  end loop;

  return v_results;
end;
$$;

-- Fix upsert: use explicit insert/update since partial unique indexes don't match ON CONFLICT on old constraint
-- (handled above with insert on conflict do nothing + update)

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

  return jsonb_build_object(
    'payment_id', v_payment_id, 'invoice_id', v_invoice_id, 'receipt_id', v_receipt_id,
    'invoice_number', v_invoice_number, 'receipt_number', v_receipt_number,
    'subscription_id', v_sub.id, 'period_end', v_period_end
  );
end;
$$;

create or replace function public.get_company_entitlements(p_company_id uuid)
returns table (
  feature_code text,
  label text,
  enabled boolean,
  source text,
  limit_value jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  if not public.can_view_billing_company(p_company_id) then
    raise exception 'Insufficient permissions to view company entitlements';
  end if;

  return query
  select
    fd.code,
    fd.label,
    public.is_feature_enabled(p_company_id, fd.code) as enabled,
    case
      when o.id is not null and o.is_active and (o.expires_at is null or o.expires_at > now()) then 'override'
      when pf.id is not null then 'plan'
      else 'default'
    end as source,
    coalesce(pf.limit_value, '{}'::jsonb) as limit_value
  from public.feature_definitions fd
  left join public.company_feature_overrides o
    on o.company_id = p_company_id
   and o.feature_code = fd.code
   and o.is_active = true
   and (o.expires_at is null or o.expires_at > now())
  left join public.company_subscriptions cs
    on cs.company_id = p_company_id
  left join public.plan_features pf
    on pf.plan_id = cs.plan_id
   and pf.feature_code = fd.code
  where fd.is_active = true
  order by fd.sort_order, fd.code;
end;
$$;

create or replace function public.ingest_usage_event(
  p_company_id uuid,
  p_metric_code text,
  p_quantity numeric,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_recorded_at timestamptz default now(),
  p_source text default 'system',
  p_reference_type text default null,
  p_reference_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_period text;
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to ingest usage events';
  end if;

  if p_company_id is null or p_metric_code is null then
    raise exception 'company_id and metric_code are required';
  end if;

  if not exists (select 1 from public.usage_metric_definitions d where d.code = p_metric_code and d.is_active = true) then
    raise exception 'Unknown usage metric: %', p_metric_code;
  end if;

  v_period := to_char(coalesce(p_recorded_at, now()), 'YYYY-MM');

  insert into public.usage_records (
    company_id, metric_code, quantity, recorded_at, billing_period,
    source, reference_type, reference_id, metadata, idempotency_key
  )
  values (
    p_company_id, p_metric_code, coalesce(p_quantity, 0), coalesce(p_recorded_at, now()), v_period,
    coalesce(p_source, 'system'), p_reference_type, p_reference_id,
    coalesce(p_metadata, '{}'::jsonb), p_idempotency_key
  )
  on conflict (company_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select ur.id into v_id from public.usage_records ur
    where ur.company_id = p_company_id and ur.idempotency_key = p_idempotency_key limit 1;
  end if;

  return v_id;
end;
$$;

create or replace function public.rollup_usage_aggregates(
  p_granularity text default 'day',
  p_from timestamptz default now() - interval '1 day',
  p_to timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer := 0;
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to rollup usage aggregates';
  end if;

  insert into public.usage_aggregates (
    company_id, metric_code, granularity, period_start, period_end, total_quantity, record_count, computed_at
  )
  select ur.company_id, ur.metric_code, p_granularity,
    date_trunc(case p_granularity when 'hour' then 'hour' when 'month' then 'month' else 'day' end, ur.recorded_at),
    date_trunc(case p_granularity when 'hour' then 'hour' when 'month' then 'month' else 'day' end, ur.recorded_at)
      + case p_granularity when 'hour' then interval '1 hour' when 'month' then interval '1 month' else interval '1 day' end,
    sum(ur.quantity), count(*)::integer, now()
  from public.usage_records ur
  where ur.recorded_at >= p_from and ur.recorded_at < p_to
  group by ur.company_id, ur.metric_code, 3, 4
  on conflict (company_id, metric_code, granularity, period_start)
  do update set total_quantity = excluded.total_quantity, record_count = excluded.record_count, computed_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.refresh_company_usage_snapshot(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_metrics jsonb; v_period_start timestamptz := date_trunc('month', now());
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to refresh usage snapshots';
  end if;

  select coalesce(jsonb_object_agg(metric_code, total_quantity), '{}'::jsonb) into v_metrics
  from public.usage_aggregates
  where company_id = p_company_id and granularity = 'month' and period_start = v_period_start;

  insert into public.company_usage_snapshots (company_id, snapshot_date, metrics, source)
  values (p_company_id, current_date, coalesce(v_metrics, '{}'::jsonb), 'on_demand')
  on conflict (company_id, snapshot_date)
  do update set metrics = excluded.metrics, source = excluded.source, created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_company_feature_override(
  p_company_id uuid, p_feature_code text, p_override_state text,
  p_reason text, p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_previous jsonb;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.is_super_admin() and not public.user_has_permission('billing.features.edit') then
    raise exception 'Insufficient permissions to manage feature overrides';
  end if;

  select jsonb_build_object('override_state', o.override_state, 'reason', o.reason, 'expires_at', o.expires_at)
  into v_previous from public.company_feature_overrides o
  where o.company_id = p_company_id and o.feature_code = p_feature_code and o.is_active = true limit 1;

  update public.company_feature_overrides set is_active = false, updated_by = auth.uid(), updated_at = now()
  where company_id = p_company_id and feature_code = p_feature_code and is_active = true;

  insert into public.company_feature_overrides (
    company_id, feature_code, override_state, reason, expires_at, created_by, updated_by
  ) values (p_company_id, p_feature_code, p_override_state, p_reason, p_expires_at, auth.uid(), auth.uid())
  returning id into v_id;

  perform public.write_billing_audit_log('feature_override_created', p_company_id, v_previous,
    jsonb_build_object('override_state', p_override_state, 'reason', p_reason, 'expires_at', p_expires_at),
    'manual', jsonb_build_object('feature_code', p_feature_code, 'override_id', v_id));

  return v_id;
end;
$$;

-- Paginated list RPCs
create or replace function public.list_company_subscriptions_paged(
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_status text default null
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
  v_stats jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_view_own_billing() then raise exception 'Insufficient permissions'; end if;

  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where cs.status = 'active'),
    'trialing', count(*) filter (where cs.status = 'trialing'),
    'at_risk', count(*) filter (where cs.status in ('past_due', 'grace_period'))
  ) into v_stats
  from public.company_subscriptions cs
  where public.is_platform_billing_operator() or cs.company_id = public.current_company_id();

  select count(*) into v_total
  from public.company_subscriptions cs
  join public.companies c on c.id = cs.company_id
  left join public.plans p on p.id = cs.plan_id
  where (public.is_platform_billing_operator() or cs.company_id = public.current_company_id())
    and (p_status is null or p_status = 'all' or cs.status = p_status)
    and (
      p_search is null or trim(p_search) = ''
      or c.name ilike '%' || trim(p_search) || '%'
      or coalesce(p.display_name, p.name, '') ilike '%' || trim(p_search) || '%'
    );

  select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) into v_rows
  from (
    select cs.*,
      jsonb_build_object('id', c.id, 'name', c.name, 'logo_url', c.logo_url, 'company_type', c.company_type) as company,
      to_jsonb(p.*) as plan
    from public.company_subscriptions cs
    join public.companies c on c.id = cs.company_id
    left join public.plans p on p.id = cs.plan_id
    where (public.is_platform_billing_operator() or cs.company_id = public.current_company_id())
      and (p_status is null or p_status = 'all' or cs.status = p_status)
      and (
        p_search is null or trim(p_search) = ''
        or c.name ilike '%' || trim(p_search) || '%'
        or coalesce(p.display_name, p.name, '') ilike '%' || trim(p_search) || '%'
      )
    order by cs.updated_at desc
    limit v_limit offset v_offset
  ) row_data;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows, 'stats', v_stats);
end;
$$;

create or replace function public.list_billing_audit_logs_paged(
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_event_type text default null
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
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_view_billing_audit(null) and not public.is_platform_billing_operator() then
    raise exception 'Insufficient permissions to view billing audit log';
  end if;

  select count(*) into v_total
  from public.billing_audit_logs bal
  left join public.companies c on c.id = bal.company_id
  where (
    public.is_super_admin()
    or public.user_has_permission('billing.audit.view')
    or (bal.company_id = public.current_company_id() and public.user_has_permission('billing.audit.view'))
  )
  and (p_event_type is null or p_event_type = 'all' or bal.event_type = p_event_type)
  and (
    p_search is null or trim(p_search) = ''
    or bal.event_type ilike '%' || trim(p_search) || '%'
    or coalesce(c.name, '') ilike '%' || trim(p_search) || '%'
    or bal.source ilike '%' || trim(p_search) || '%'
  );

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
  from (
    select bal.*, jsonb_build_object('id', c.id, 'name', c.name, 'logo_url', c.logo_url) as company
    from public.billing_audit_logs bal
    left join public.companies c on c.id = bal.company_id
    where (
      public.is_super_admin()
      or public.user_has_permission('billing.audit.view')
      or (bal.company_id = public.current_company_id() and public.user_has_permission('billing.audit.view'))
    )
    and (p_event_type is null or p_event_type = 'all' or bal.event_type = p_event_type)
    and (
      p_search is null or trim(p_search) = ''
      or bal.event_type ilike '%' || trim(p_search) || '%'
      or coalesce(c.name, '') ilike '%' || trim(p_search) || '%'
      or bal.source ilike '%' || trim(p_search) || '%'
    )
    order by bal.occurred_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$$;

-- ── RLS policy updates ──────────────────────────────────────

drop policy if exists company_subscriptions_select on public.company_subscriptions;
create policy company_subscriptions_select on public.company_subscriptions for select
using (auth.role() = 'authenticated' and public.can_view_billing_company(company_id));

drop policy if exists billing_invoices_select on public.billing_invoices;
create policy billing_invoices_select on public.billing_invoices for select
using (auth.role() = 'authenticated' and public.can_view_billing_company(company_id));

drop policy if exists billing_receipts_select on public.billing_receipts;
create policy billing_receipts_select on public.billing_receipts for select
using (auth.role() = 'authenticated' and public.can_view_billing_company(company_id));

drop policy if exists billing_payments_select on public.billing_payments;
create policy billing_payments_select on public.billing_payments for select
using (auth.role() = 'authenticated' and public.can_view_billing_company(company_id));

drop policy if exists subscription_events_select on public.subscription_events;
create policy subscription_events_select on public.subscription_events for select
using (auth.role() = 'authenticated' and public.can_view_billing_company(company_id));

drop policy if exists billing_audit_logs_select on public.billing_audit_logs;
create policy billing_audit_logs_select on public.billing_audit_logs for select
using (
  auth.role() = 'authenticated'
  and (
    (company_id is null and (public.is_super_admin() or public.user_has_permission('billing.audit.view')))
    or public.can_view_billing_audit(company_id)
  )
);

drop policy if exists billing_settings_select on public.billing_settings;
create policy billing_settings_select on public.billing_settings for select
using (
  auth.role() = 'authenticated'
  and public.can_view_billing_settings(scope_type, scope_id)
);

drop policy if exists usage_records_select on public.usage_records;
create policy usage_records_select on public.usage_records for select
using (
  auth.role() = 'authenticated'
  and (public.is_platform_billing_operator() or company_id = public.current_company_id())
);

drop policy if exists usage_aggregates_select on public.usage_aggregates;
create policy usage_aggregates_select on public.usage_aggregates for select
using (
  auth.role() = 'authenticated'
  and (public.is_platform_billing_operator() or company_id = public.current_company_id())
);

drop policy if exists company_usage_snapshots_select on public.company_usage_snapshots;
create policy company_usage_snapshots_select on public.company_usage_snapshots for select
using (
  auth.role() = 'authenticated'
  and (public.is_platform_billing_operator() or company_id = public.current_company_id())
);

-- ── REVOKE / GRANT ────────────────────────────────────────────

revoke all on function public.write_billing_audit_log(text, uuid, jsonb, jsonb, text, jsonb) from public;
revoke all on function public.emit_subscription_event(uuid, uuid, text, text, text, jsonb, timestamptz) from public;
revoke all on function public.sync_company_subscription_denormalized(uuid) from public;
revoke all on function public.format_billing_document_number(text, uuid) from public;
revoke all on function public.resolve_billing_setting_value(text, uuid) from public;
revoke all on function public.validate_billing_setting_value(text, jsonb) from public;
revoke all on function public.build_billing_company_snapshot(uuid) from public;
revoke all on function public.build_billing_contact_snapshot(uuid) from public;

revoke all on function public.get_billing_setting(text, uuid) from public;
grant execute on function public.get_billing_setting(text, uuid) to authenticated;

revoke all on function public.get_billing_settings_by_category(text, text, uuid) from public;
grant execute on function public.get_billing_settings_by_category(text, text, uuid) to authenticated;

revoke all on function public.update_billing_settings(text, uuid, jsonb) from public;
grant execute on function public.update_billing_settings(text, uuid, jsonb) to authenticated;

revoke all on function public.renew_subscription_from_payment(uuid, numeric, text, text, text, text, jsonb) from public;
grant execute on function public.renew_subscription_from_payment(uuid, numeric, text, text, text, text, jsonb) to authenticated;

revoke all on function public.list_company_subscriptions_paged(integer, integer, text, text) from public;
grant execute on function public.list_company_subscriptions_paged(integer, integer, text, text) to authenticated;

revoke all on function public.list_billing_audit_logs_paged(integer, integer, text, text) from public;
grant execute on function public.list_billing_audit_logs_paged(integer, integer, text, text) to authenticated;

revoke all on function public.is_platform_billing_operator() from public;
grant execute on function public.is_platform_billing_operator() to authenticated;

revoke all on function public.can_view_billing_company(uuid) from public;
grant execute on function public.can_view_billing_company(uuid) to authenticated;

revoke all on function public.ingest_usage_event(uuid, text, numeric, jsonb, text, timestamptz, text, text, text) from public;
revoke all on function public.ingest_usage_event(uuid, text, numeric, jsonb, text, timestamptz, text, text, text) from authenticated;
grant execute on function public.ingest_usage_event(uuid, text, numeric, jsonb, text, timestamptz, text, text, text) to service_role;

revoke all on function public.rollup_usage_aggregates(text, timestamptz, timestamptz) from public;
revoke all on function public.rollup_usage_aggregates(text, timestamptz, timestamptz) from authenticated;
grant execute on function public.rollup_usage_aggregates(text, timestamptz, timestamptz) to service_role;

revoke all on function public.refresh_company_usage_snapshot(uuid) from public;
revoke all on function public.refresh_company_usage_snapshot(uuid) from authenticated;
grant execute on function public.refresh_company_usage_snapshot(uuid) to service_role;

revoke all on function public.set_company_feature_override(uuid, text, text, text, timestamptz) from public;
grant execute on function public.set_company_feature_override(uuid, text, text, text, timestamptz) to authenticated;

revoke all on function public.is_feature_enabled(uuid, text) from public;
grant execute on function public.is_feature_enabled(uuid, text) to authenticated;

revoke all on function public.get_company_entitlements(uuid) from public;
grant execute on function public.get_company_entitlements(uuid) to authenticated;

revoke all on function public.can_view_billing_settings(text, uuid) from public;
grant execute on function public.can_view_billing_settings(text, uuid) to authenticated;

revoke all on function public.can_edit_billing_settings(text, uuid) from public;
grant execute on function public.can_edit_billing_settings(text, uuid) to authenticated;

revoke all on function public.can_record_billing_payment() from public;
grant execute on function public.can_record_billing_payment() to authenticated;

revoke all on function public.can_view_billing_audit(uuid) from public;
grant execute on function public.can_view_billing_audit(uuid) to authenticated;

revoke all on function public.can_view_own_billing() from public;
grant execute on function public.can_view_own_billing() to authenticated;

revoke all on function public.resolve_billing_setting_value(text, uuid) from authenticated;

-- ── Repair circular FKs (035 silent-failure guard) ────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'billing_invoices_billing_payment_id_fkey'
  ) then
    alter table public.billing_invoices
      add constraint billing_invoices_billing_payment_id_fkey
      foreign key (billing_payment_id)
      references public.billing_payments(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'billing_receipts_billing_payment_id_fkey'
  ) then
    alter table public.billing_receipts
      add constraint billing_receipts_billing_payment_id_fkey
      foreign key (billing_payment_id)
      references public.billing_payments(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'billing_payments_receipt_id_fkey'
  ) then
    alter table public.billing_payments
      add constraint billing_payments_receipt_id_fkey
      foreign key (receipt_id)
      references public.billing_receipts(id)
      on delete set null;
  end if;
end $$;
