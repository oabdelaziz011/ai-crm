-- ============================================================
-- 303 — Company-specific commercial terms + usage limit overrides
--
-- Extends approval/onboarding commercial configuration.
-- Does NOT replace feature_definitions / company_feature_overrides /
-- plans / plan_features / company_subscriptions / checkout Parts 1–4.
--
-- Company-specific price is stored here, never on public.plans.
-- Online checkout still settles against package list price (Parts 1–4).
-- Portal display uses resolve_company_payable_amount.
-- Overage rules are configuration only — charging is not executed here.
-- ============================================================

create table if not exists public.company_commercial_terms (
  company_id uuid primary key references public.companies(id) on delete cascade,
  pricing_source text not null default 'list'
    check (pricing_source in ('list', 'discount', 'custom')),
  discount_percent numeric(8, 4) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  custom_price_monthly numeric(12, 2)
    check (custom_price_monthly is null or custom_price_monthly >= 0),
  custom_price_yearly numeric(12, 2)
    check (custom_price_yearly is null or custom_price_yearly >= 0),
  notes text,
  configured_at timestamptz not null default now(),
  configured_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.company_commercial_terms is
  'Per-company commercial price overlay. Does not mutate plans list prices. Online checkout still uses catalog list_price until Parts 1–4 are extended.';

create table if not exists public.company_usage_limit_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  metric_code text not null references public.usage_metric_definitions(code) on delete restrict,
  included_quantity numeric,
  is_unlimited boolean not null default false,
  overage_allowed boolean not null default false,
  overage_unit_size numeric,
  overage_unit_price numeric(12, 4),
  is_active boolean not null default true,
  notes text,
  configured_at timestamptz not null default now(),
  configured_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, metric_code)
);

comment on table public.company_usage_limit_overrides is
  'Per-company included usage + overage *configuration*. Does not invoice or settle overage charges.';

alter table public.companies
  add column if not exists approval_change_request text;

create index if not exists idx_company_usage_limit_overrides_company
  on public.company_usage_limit_overrides (company_id)
  where is_active = true;

alter table public.company_commercial_terms enable row level security;
alter table public.company_usage_limit_overrides enable row level security;

drop policy if exists company_commercial_terms_select on public.company_commercial_terms;
create policy company_commercial_terms_select
  on public.company_commercial_terms for select
  using (
    public.is_super_admin()
    or company_id = public.current_company_id()
  );

drop policy if exists company_commercial_terms_write on public.company_commercial_terms;
create policy company_commercial_terms_write
  on public.company_commercial_terms for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists company_usage_limit_overrides_select on public.company_usage_limit_overrides;
create policy company_usage_limit_overrides_select
  on public.company_usage_limit_overrides for select
  using (
    public.is_super_admin()
    or company_id = public.current_company_id()
  );

drop policy if exists company_usage_limit_overrides_write on public.company_usage_limit_overrides;
create policy company_usage_limit_overrides_write
  on public.company_usage_limit_overrides for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke all on public.company_commercial_terms from anon, public;
revoke all on public.company_usage_limit_overrides from anon, public;
grant select, insert, update, delete on public.company_commercial_terms to authenticated, service_role;
grant select, insert, update, delete on public.company_usage_limit_overrides to authenticated, service_role;

insert into public.billing_audit_event_types (code, label, description)
values
  ('company_commercial_terms_updated', 'Company commercial terms updated', 'Platform admin saved per-company price overlay'),
  ('company_usage_limits_updated', 'Company usage limits updated', 'Platform admin saved per-company usage/overage configuration'),
  ('company_changes_requested', 'Company changes requested', 'Platform admin requested onboarding changes before approval')
on conflict (code) do update
set label = excluded.label, description = excluded.description, is_active = true;

-- ── Payable amount resolver (display SoT; not checkout settlement) ─

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

  if v_plan.id is not null and coalesce(v_plan.pricing_mode, 'fixed') = 'free' then
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

  v_currency := coalesce(
    nullif(trim(public.resolve_billing_setting_value('default_currency', p_company_id)#>>'{}'), ''),
    nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), '')
  );

  v_online := (
    v_source = 'list'
    and coalesce(v_plan.pricing_mode, 'fixed') = 'fixed'
    and v_payable is not null
    and v_payable > 0
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

revoke all on function public.resolve_company_payable_amount(uuid) from public, anon;
grant execute on function public.resolve_company_payable_amount(uuid) to authenticated, service_role;

create or replace function public.upsert_company_commercial_terms_v1(
  p_company_id uuid,
  p_pricing_source text,
  p_discount_percent numeric default 0,
  p_custom_price_monthly numeric default null,
  p_custom_price_yearly numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := lower(trim(coalesce(p_pricing_source, 'list')));
  v_row public.company_commercial_terms%rowtype;
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

  insert into public.company_commercial_terms (
    company_id, pricing_source, discount_percent,
    custom_price_monthly, custom_price_yearly, notes,
    configured_at, configured_by, updated_at
  )
  values (
    p_company_id, v_source, coalesce(p_discount_percent, 0),
    p_custom_price_monthly, p_custom_price_yearly, nullif(trim(coalesce(p_notes, '')), ''),
    now(), auth.uid(), now()
  )
  on conflict (company_id) do update
  set
    pricing_source = excluded.pricing_source,
    discount_percent = excluded.discount_percent,
    custom_price_monthly = excluded.custom_price_monthly,
    custom_price_yearly = excluded.custom_price_yearly,
    notes = excluded.notes,
    configured_at = now(),
    configured_by = auth.uid(),
    updated_at = now()
  returning * into v_row;

  perform public.write_billing_audit_log(
    'company_commercial_terms_updated',
    p_company_id,
    null,
    to_jsonb(v_row),
    'manual',
    jsonb_build_object('source', 'upsert_company_commercial_terms_v1')
  );

  return jsonb_build_object(
    'ok', true,
    'terms', to_jsonb(v_row),
    'payable', public.resolve_company_payable_amount(p_company_id)
  );
end;
$$;

revoke all on function public.upsert_company_commercial_terms_v1(uuid, text, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.upsert_company_commercial_terms_v1(uuid, text, numeric, numeric, numeric, text) to authenticated, service_role;

create or replace function public.upsert_company_usage_limit_overrides_v1(
  p_company_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_code text;
  v_count integer := 0;
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to configure company usage limits';
  end if;
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_required';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_code := nullif(trim(coalesce(v_item->>'metric_code', '')), '');
    if v_code is null then
      continue;
    end if;
    if not exists (
      select 1 from public.usage_metric_definitions d
      where d.code = v_code and d.is_active = true
    ) then
      raise exception 'unknown_metric_code: %', v_code;
    end if;

    insert into public.company_usage_limit_overrides (
      company_id, metric_code, included_quantity, is_unlimited,
      overage_allowed, overage_unit_size, overage_unit_price,
      is_active, notes, configured_at, configured_by, updated_at
    )
    values (
      p_company_id,
      v_code,
      nullif(v_item->>'included_quantity', '')::numeric,
      coalesce((v_item->>'is_unlimited')::boolean, false),
      coalesce((v_item->>'overage_allowed')::boolean, false),
      nullif(v_item->>'overage_unit_size', '')::numeric,
      nullif(v_item->>'overage_unit_price', '')::numeric,
      true,
      nullif(trim(coalesce(v_item->>'notes', '')), ''),
      now(),
      auth.uid(),
      now()
    )
    on conflict (company_id, metric_code) do update
    set
      included_quantity = excluded.included_quantity,
      is_unlimited = excluded.is_unlimited,
      overage_allowed = excluded.overage_allowed,
      overage_unit_size = excluded.overage_unit_size,
      overage_unit_price = excluded.overage_unit_price,
      is_active = true,
      notes = excluded.notes,
      configured_at = now(),
      configured_by = auth.uid(),
      updated_at = now();
    v_count := v_count + 1;
  end loop;

  perform public.write_billing_audit_log(
    'company_usage_limits_updated',
    p_company_id,
    null,
    jsonb_build_object('count', v_count),
    'manual',
    jsonb_build_object('source', 'upsert_company_usage_limit_overrides_v1')
  );

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

revoke all on function public.upsert_company_usage_limit_overrides_v1(uuid, jsonb) from public, anon;
grant execute on function public.upsert_company_usage_limit_overrides_v1(uuid, jsonb) to authenticated, service_role;

create or replace function public.request_company_changes_v1(
  p_company_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to request company changes';
  end if;
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;
  if v_message is null then
    raise exception 'change_request_required';
  end if;

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'company_not_found';
  end if;
  if v_company.approval_status = 'approved' then
    raise exception 'cannot_request_changes_on_approved_company';
  end if;

  update public.companies
  set
    approval_change_request = v_message,
    approval_status = 'pending',
    updated_at = now()
  where id = p_company_id
  returning * into v_company;

  perform public.write_billing_audit_log(
    'company_changes_requested',
    p_company_id,
    null,
    jsonb_build_object('message', v_message),
    'manual',
    jsonb_build_object('source', 'request_company_changes_v1')
  );

  return jsonb_build_object('ok', true, 'company', to_jsonb(v_company));
end;
$$;

revoke all on function public.request_company_changes_v1(uuid, text) from public, anon;
grant execute on function public.request_company_changes_v1(uuid, text) to authenticated, service_role;

-- Portal display: payable overlay without changing checkout settlement.
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
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_access_workspace() then raise exception 'Insufficient permissions'; end if;
  if v_company_id is null then raise exception 'No company context'; end if;

  v_payable := public.resolve_company_payable_amount(v_company_id);
  v_currency := coalesce(
    v_payable->>'currency',
    nullif(trim(public.resolve_billing_setting_value('default_currency', v_company_id)#>>'{}'), '')
  );

  select jsonb_build_object(
    'schema_version', 1,
    'company_id', v_company_id,
    'subscription', to_jsonb(cs.*),
    'plan', to_jsonb(p.*),
    'company', jsonb_build_object('id', c.id, 'name', c.name, 'logo_url', c.logo_url, 'status', c.status),
    'billing_contact', (
      select to_jsonb(bc.*) from public.company_billing_contacts bc
      where bc.company_id = v_company_id and bc.is_active = true limit 1
    ),
    'next_invoice_amount', (v_payable->>'payable_amount')::numeric,
    'list_price_amount', (v_payable->>'list_amount')::numeric,
    'payable_source', v_payable->>'source',
    'online_checkout_allowed', coalesce((v_payable->>'online_checkout_allowed')::boolean, false),
    'currency', v_currency,
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

  return v_result;
end;
$$;
