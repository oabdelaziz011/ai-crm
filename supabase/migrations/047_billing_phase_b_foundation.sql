-- ============================================================
-- Vault OS – Billing Phase B foundation
-- Workspace, notification bus, feature flags, event catalog,
-- provider health, sandbox mode, platform financial list RPCs
-- Architecture: enterprise-billing-platform-v2.1 §16–20
-- ============================================================

-- ── 1. User account status (renewal reactivation) ────────────

do $$ begin
  create type public.profile_account_status as enum (
    'ACTIVE',
    'SUSPENDED_BY_SUBSCRIPTION',
    'SUSPENDED_BY_ADMIN',
    'LOCKED',
    'DISABLED'
  );
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists account_status public.profile_account_status not null default 'ACTIVE',
  add column if not exists suspension_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id) on delete set null;

update public.profiles
set account_status = 'DISABLED'
where coalesce(is_active, true) = false
  and account_status = 'ACTIVE';

-- ── 2. Workspace permissions ─────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('workspace.view', 'Workspace', 'Workspace', 'View', 'Access company workspace administration'),
  ('billing.manage_own', 'Billing', 'Workspace Billing', 'Manage', 'Renew and manage own company subscription'),
  ('billing.contact.edit_own', 'Billing', 'Workspace Billing', 'Edit Contact', 'Edit own company billing contact'),
  ('billing.payment_method.manage_own', 'Billing', 'Workspace Billing', 'Manage Payment', 'Manage own company payment methods'),
  ('billing.documents.download_own', 'Billing', 'Workspace Billing', 'Download', 'Download own subscription invoices and receipts')
on conflict (code) do update
set category = excluded.category, module = excluded.module, action = excluded.action,
    description = excluded.description, updated_at = now();

create or replace function public.can_access_workspace()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.user_has_permission('workspace.view')
    or public.user_has_permission('billing.view_own')
    or (
      public.current_company_id() is not null
      and public.is_company_admin()
    );
$$;

create or replace function public.can_manage_own_billing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      public.current_company_id() is not null
      and (
        public.user_has_permission('billing.manage_own')
        or (public.is_company_admin() and public.user_has_permission('billing.view_own'))
      )
    );
$$;

-- ── 3. Feature flags (Plans → Flags → Features) ──────────────

create table if not exists public.feature_flags (
  feature_code text primary key references public.feature_definitions(code) on delete cascade,
  is_globally_enabled boolean not null default true,
  label text,
  description text,
  rollout_metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists feature_flags_updated_at on public.feature_flags;
create trigger feature_flags_updated_at
  before update on public.feature_flags
  for each row execute procedure public.set_updated_at();

insert into public.feature_flags (feature_code, label, is_globally_enabled)
select fd.code, fd.label, true
from public.feature_definitions fd
where fd.is_active = true
on conflict (feature_code) do nothing;

alter table public.feature_flags enable row level security;

drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags for select
  using (auth.role() = 'authenticated');

drop policy if exists feature_flags_write on public.feature_flags;
create policy feature_flags_write on public.feature_flags for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create or replace function public.is_feature_enabled(
  p_company_id uuid,
  p_feature_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_override text;
  v_plan_enabled boolean;
  v_default_enabled boolean;
  v_plan_id uuid;
  v_flag_enabled boolean;
begin
  select o.override_state into v_override
  from public.company_feature_overrides o
  where o.company_id = p_company_id and o.feature_code = p_feature_code
    and o.is_active = true and (o.expires_at is null or o.expires_at > now())
  limit 1;

  if v_override = 'enabled' then return true;
  elsif v_override = 'disabled' then return false;
  end if;

  select ff.is_globally_enabled into v_flag_enabled
  from public.feature_flags ff
  where ff.feature_code = p_feature_code;

  if v_flag_enabled is not null and v_flag_enabled = false then
    return false;
  end if;

  select cs.plan_id into v_plan_id
  from public.company_subscriptions cs
  where cs.company_id = p_company_id;

  if v_plan_id is not null then
    select pf.enabled into v_plan_enabled
    from public.plan_features pf
    where pf.plan_id = v_plan_id and pf.feature_code = p_feature_code;
    if v_plan_enabled is not null then
      return v_plan_enabled;
    end if;
  end if;

  select fd.default_enabled into v_default_enabled
  from public.feature_definitions fd
  where fd.code = p_feature_code and fd.is_active = true;

  return coalesce(v_default_enabled, false);
end;
$$;

-- ── 4. Billing event catalog ─────────────────────────────────

create table if not exists public.billing_event_catalog (
  code text primary key,
  domain text not null check (domain in ('billing', 'financial', 'payment', 'workspace', 'notification')),
  label text not null,
  description text,
  schema_version integer not null default 1,
  default_channels text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.billing_event_catalog (code, domain, label, default_channels)
values
  ('billing.subscription.created', 'billing', 'Subscription Created', array['in_app', 'webhook']),
  ('billing.subscription.renewed', 'billing', 'Subscription Renewed', array['email', 'in_app', 'webhook']),
  ('billing.subscription.expired', 'billing', 'Subscription Expired', array['email', 'in_app']),
  ('billing.subscription.suspended', 'billing', 'Subscription Suspended', array['email', 'in_app']),
  ('billing.subscription.restored', 'billing', 'Subscription Restored', array['in_app']),
  ('billing.plan.changed', 'billing', 'Plan Changed', array['email', 'in_app', 'webhook']),
  ('billing.cycle.changed', 'billing', 'Billing Cycle Changed', array['email', 'in_app']),
  ('billing.trial.ending', 'billing', 'Trial Ending', array['email', 'in_app']),
  ('financial.payment.succeeded', 'financial', 'Payment Succeeded', array['email', 'in_app', 'webhook']),
  ('financial.payment.failed', 'financial', 'Payment Failed', array['email', 'in_app', 'webhook']),
  ('financial.invoice.generated', 'financial', 'Invoice Generated', array['email', 'in_app']),
  ('financial.invoice.paid', 'financial', 'Invoice Paid', array['email', 'in_app']),
  ('financial.receipt.generated', 'financial', 'Receipt Generated', array['email', 'in_app']),
  ('financial.refund.processed', 'financial', 'Refund Processed', array['email', 'in_app', 'webhook']),
  ('payment.intent.created', 'payment', 'Payment Intent Created', array['in_app']),
  ('payment.intent.succeeded', 'payment', 'Payment Intent Succeeded', array['in_app', 'webhook']),
  ('payment.intent.failed', 'payment', 'Payment Intent Failed', array['in_app', 'webhook']),
  ('payment.provider.degraded', 'payment', 'Provider Degraded', array['in_app']),
  ('workspace.company.reactivated', 'workspace', 'Company Reactivated', array['in_app']),
  ('workspace.users.reactivated', 'workspace', 'Users Reactivated', array['in_app'])
on conflict (code) do update
set label = excluded.label, domain = excluded.domain,
    default_channels = excluded.default_channels, is_active = true;

-- ── 5. Notification bus ──────────────────────────────────────

create table if not exists public.billing_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null references public.billing_event_catalog(code),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  channels text[] not null default '{}'::text[],
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  idempotency_key text unique,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_billing_notification_events_pending
  on public.billing_notification_events(status, created_at)
  where status = 'pending';

alter table public.billing_notification_events enable row level security;

drop policy if exists billing_notification_events_select on public.billing_notification_events;
create policy billing_notification_events_select on public.billing_notification_events for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists billing_notification_events_write on public.billing_notification_events;
create policy billing_notification_events_write on public.billing_notification_events for all
  using (false) with check (false);

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
declare
  v_id uuid;
  v_channels text[];
  v_company_id uuid;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.billing_event_catalog c
    where c.code = p_event_code and c.is_active = true
  ) then
    raise exception 'Unregistered billing event: %', p_event_code;
  end if;

  v_company_id := coalesce(p_company_id, public.current_company_id());

  select coalesce(p_channels, c.default_channels) into v_channels
  from public.billing_event_catalog c
  where c.code = p_event_code;

  insert into public.billing_notification_events (
    event_code, company_id, user_id, payload, channels, idempotency_key, schema_version
  )
  values (
    p_event_code, v_company_id, auth.uid(), coalesce(p_payload, '{}'::jsonb),
    coalesce(v_channels, array[]::text[]), p_idempotency_key, 1
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

-- ── 6. Sandbox mode + provider ───────────────────────────────

insert into public.billing_setting_definitions (
  code, category, label, description, value_type, scope_type, default_value, sort_order
)
values (
  'payment_sandbox_mode', 'payments', 'Payment Sandbox Mode',
  'When enabled, checkout uses the sandbox payment provider (no real cards).',
  'boolean', 'platform', 'false'::jsonb, 50
)
on conflict (code) do nothing;

insert into public.payment_providers (code, display_name, is_active, config)
values ('sandbox', 'Sandbox (Test)', true, '{"mode":"sandbox"}'::jsonb)
on conflict (code) do update
set display_name = excluded.display_name, is_active = true;

-- ── 7. Provider health snapshots ─────────────────────────────

create table if not exists public.payment_provider_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null references public.payment_providers(code) on delete cascade,
  status text not null default 'unknown'
    check (status in ('healthy', 'degraded', 'down', 'unknown')),
  latency_ms integer,
  success_rate numeric(5,2),
  error_rate numeric(5,2),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

create index if not exists idx_payment_provider_health_checked
  on public.payment_provider_health_snapshots(provider_code, checked_at desc);

alter table public.payment_provider_health_snapshots enable row level security;

drop policy if exists payment_provider_health_select on public.payment_provider_health_snapshots;
create policy payment_provider_health_select on public.payment_provider_health_snapshots for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or public.is_platform_billing_operator())
  );

insert into public.payment_provider_health_snapshots (
  provider_code, status, latency_ms, success_rate, error_rate, checked_at
)
select pp.code,
  case when pp.code in ('manual', 'sandbox') then 'healthy' when pp.is_active then 'unknown' else 'down' end,
  case when pp.code in ('manual', 'sandbox') then 12 else null end,
  case when pp.code in ('manual', 'sandbox') then 100.00 else null end,
  case when pp.code in ('manual', 'sandbox') then 0.00 else null end,
  now()
from public.payment_providers pp
where not exists (
  select 1 from public.payment_provider_health_snapshots s
  where s.provider_code = pp.code and s.checked_at > now() - interval '1 hour'
);

-- ── 8. Workspace billing summary RPC (v1) ────────────────────

create or replace function public.get_workspace_billing_summary_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_result jsonb;
  v_currency text;
  v_next_amount numeric;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_access_workspace() then raise exception 'Insufficient permissions'; end if;
  if v_company_id is null then raise exception 'No company context'; end if;

  v_currency := nullif(trim(public.resolve_billing_setting_value('default_currency', v_company_id)#>>'{}'), '');

  select case cs.billing_cycle
    when 'yearly' then p.price_yearly else p.price_monthly end
  into v_next_amount
  from public.company_subscriptions cs
  left join public.plans p on p.id = cs.plan_id
  where cs.company_id = v_company_id;

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
    'next_invoice_amount', v_next_amount,
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

-- ── 9. Platform financial list RPCs (v1) ─────────────────────

create or replace function public.list_billing_payments_paged_v1(
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.is_platform_billing_operator() then raise exception 'Insufficient permissions'; end if;

  select count(*) into v_total
  from public.billing_payments bp
  join public.companies c on c.id = bp.company_id
  where (p_status is null or p_status = 'all' or bp.status = p_status)
    and (p_search is null or trim(p_search) = '' or c.name ilike '%' || trim(p_search) || '%'
      or coalesce(bp.provider_payment_id, '') ilike '%' || trim(p_search) || '%');

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
  from (
    select bp.*, jsonb_build_object('id', c.id, 'name', c.name) as company
    from public.billing_payments bp
    join public.companies c on c.id = bp.company_id
    where (p_status is null or p_status = 'all' or bp.status = p_status)
      and (p_search is null or trim(p_search) = '' or c.name ilike '%' || trim(p_search) || '%'
        or coalesce(bp.provider_payment_id, '') ilike '%' || trim(p_search) || '%')
    order by bp.created_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('schema_version', 1, 'total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$$;

create or replace function public.list_billing_invoices_paged_v1(
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.is_platform_billing_operator() then raise exception 'Insufficient permissions'; end if;

  select count(*) into v_total
  from public.billing_invoices bi
  join public.companies c on c.id = bi.company_id
  where (p_status is null or p_status = 'all' or bi.status = p_status)
    and (p_search is null or trim(p_search) = '' or c.name ilike '%' || trim(p_search) || '%'
      or bi.invoice_number ilike '%' || trim(p_search) || '%');

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
  from (
    select bi.*, jsonb_build_object('id', c.id, 'name', c.name) as company
    from public.billing_invoices bi
    join public.companies c on c.id = bi.company_id
    where (p_status is null or p_status = 'all' or bi.status = p_status)
      and (p_search is null or trim(p_search) = '' or c.name ilike '%' || trim(p_search) || '%'
        or bi.invoice_number ilike '%' || trim(p_search) || '%')
    order by bi.created_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('schema_version', 1, 'total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$$;

create or replace function public.list_billing_receipts_paged_v1(
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null
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
  if not public.is_platform_billing_operator() then raise exception 'Insufficient permissions'; end if;

  select count(*) into v_total
  from public.billing_receipts br
  join public.companies c on c.id = br.company_id
  where p_search is null or trim(p_search) = '' or c.name ilike '%' || trim(p_search) || '%'
    or br.receipt_number ilike '%' || trim(p_search) || '%';

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
  from (
    select br.*, jsonb_build_object('id', c.id, 'name', c.name) as company
    from public.billing_receipts br
    join public.companies c on c.id = br.company_id
    where p_search is null or trim(p_search) = '' or c.name ilike '%' || trim(p_search) || '%'
      or br.receipt_number ilike '%' || trim(p_search) || '%'
    order by br.created_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('schema_version', 1, 'total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$$;

create or replace function public.list_billing_payment_failures_paged_v1(
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null
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
  if not public.is_platform_billing_operator() then raise exception 'Insufficient permissions'; end if;

  select count(*) into v_total
  from public.billing_payments bp
  join public.companies c on c.id = bp.company_id
  where bp.status = 'failed'
    and (p_search is null or trim(p_search) = '' or c.name ilike '%' || trim(p_search) || '%');

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
  from (
    select bp.*, jsonb_build_object('id', c.id, 'name', c.name) as company
    from public.billing_payments bp
    join public.companies c on c.id = bp.company_id
    where bp.status = 'failed'
      and (p_search is null or trim(p_search) = '' or c.name ilike '%' || trim(p_search) || '%')
    order by bp.created_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('schema_version', 1, 'total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$$;

create or replace function public.list_upcoming_renewals_paged_v1(
  p_limit integer default 20,
  p_offset integer default 0,
  p_days integer default 30
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
  v_days integer := greatest(coalesce(p_days, 30), 1);
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.is_platform_billing_operator() then raise exception 'Insufficient permissions'; end if;

  select count(*) into v_total
  from public.company_subscriptions cs
  where cs.status in ('active', 'trialing')
    and coalesce(cs.next_renewal_at, cs.current_period_end) <= now() + (v_days || ' days')::interval;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
  from (
    select cs.*, jsonb_build_object('id', c.id, 'name', c.name) as company,
      coalesce(p.display_name, p.name) as plan_name
    from public.company_subscriptions cs
    join public.companies c on c.id = cs.company_id
    left join public.plans p on p.id = cs.plan_id
    where cs.status in ('active', 'trialing')
      and coalesce(cs.next_renewal_at, cs.current_period_end) <= now() + (v_days || ' days')::interval
    order by coalesce(cs.next_renewal_at, cs.current_period_end) asc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('schema_version', 1, 'total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$$;

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
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.is_platform_billing_operator() then raise exception 'Insufficient permissions'; end if;

  select count(*) into v_total
  from public.company_subscriptions cs
  where cs.status in ('expired', 'grace_period', 'past_due')
     or (cs.status = 'trialing' and cs.trial_ends_at is not null and cs.trial_ends_at <= now() + interval '14 days');

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
  from (
    select cs.*, jsonb_build_object('id', c.id, 'name', c.name) as company
    from public.company_subscriptions cs
    join public.companies c on c.id = cs.company_id
    where cs.status in ('expired', 'grace_period', 'past_due')
       or (cs.status = 'trialing' and cs.trial_ends_at is not null and cs.trial_ends_at <= now() + interval '14 days')
    order by coalesce(cs.next_renewal_at, cs.current_period_end, cs.trial_ends_at) asc nulls last
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('schema_version', 1, 'total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$$;

-- ── 10. Revenue metrics + provider health RPCs (v1) ──────────

create or replace function public.get_billing_revenue_metrics_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mrr numeric := 0;
  v_active bigint := 0;
  v_trialing bigint := 0;
  v_failed bigint := 0;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.is_platform_billing_operator() then raise exception 'Insufficient permissions'; end if;

  select
    coalesce(sum(case cs.billing_cycle
      when 'yearly' then coalesce(p.price_yearly, 0) / 12.0
      else coalesce(p.price_monthly, 0) end), 0),
    count(*) filter (where cs.status = 'active'),
    count(*) filter (where cs.status = 'trialing')
  into v_mrr, v_active, v_trialing
  from public.company_subscriptions cs
  left join public.plans p on p.id = cs.plan_id
  where cs.status in ('active', 'trialing', 'past_due', 'grace_period');

  select count(*) into v_failed
  from public.billing_payments bp
  where bp.status = 'failed'
    and bp.created_at > now() - interval '30 days';

  return jsonb_build_object(
    'schema_version', 1,
    'mrr', round(v_mrr, 2),
    'arr', round(v_mrr * 12, 2),
    'active_subscriptions', v_active,
    'trialing_subscriptions', v_trialing,
    'failed_payments_30d', v_failed,
    'failed_payment_rate', case when v_active + v_trialing > 0
      then round(v_failed::numeric / (v_active + v_trialing) * 100, 2) else 0 end
  );
end;
$$;

create or replace function public.get_payment_provider_health_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.is_platform_billing_operator() then raise exception 'Insufficient permissions'; end if;

  select coalesce(jsonb_agg(to_jsonb(latest)), '[]'::jsonb) into v_rows
  from (
    select distinct on (s.provider_code)
      s.provider_code, pp.display_name, s.status, s.latency_ms,
      s.success_rate, s.error_rate, s.checked_at
    from public.payment_provider_health_snapshots s
    join public.payment_providers pp on pp.code = s.provider_code
    order by s.provider_code, s.checked_at desc
  ) latest;

  return jsonb_build_object('schema_version', 1, 'providers', v_rows);
end;
$$;

-- ── Grants ───────────────────────────────────────────────────

revoke all on function public.can_access_workspace() from public;
grant execute on function public.can_access_workspace() to authenticated;

revoke all on function public.can_manage_own_billing() from public;
grant execute on function public.can_manage_own_billing() to authenticated;

revoke all on function public.notification_bus_publish_v1(text, uuid, jsonb, text[], text) from public;
grant execute on function public.notification_bus_publish_v1(text, uuid, jsonb, text[], text) to authenticated;

revoke all on function public.get_workspace_billing_summary_v1() from public;
grant execute on function public.get_workspace_billing_summary_v1() to authenticated;

revoke all on function public.list_billing_payments_paged_v1(integer, integer, text, text) from public;
grant execute on function public.list_billing_payments_paged_v1(integer, integer, text, text) to authenticated;

revoke all on function public.list_billing_invoices_paged_v1(integer, integer, text, text) from public;
grant execute on function public.list_billing_invoices_paged_v1(integer, integer, text, text) to authenticated;

revoke all on function public.list_billing_receipts_paged_v1(integer, integer, text) from public;
grant execute on function public.list_billing_receipts_paged_v1(integer, integer, text) to authenticated;

revoke all on function public.list_billing_payment_failures_paged_v1(integer, integer, text) from public;
grant execute on function public.list_billing_payment_failures_paged_v1(integer, integer, text) to authenticated;

revoke all on function public.list_upcoming_renewals_paged_v1(integer, integer, integer) from public;
grant execute on function public.list_upcoming_renewals_paged_v1(integer, integer, integer) to authenticated;

revoke all on function public.list_expiring_subscriptions_paged_v1(integer, integer) from public;
grant execute on function public.list_expiring_subscriptions_paged_v1(integer, integer) to authenticated;

revoke all on function public.get_billing_revenue_metrics_v1() from public;
grant execute on function public.get_billing_revenue_metrics_v1() to authenticated;

revoke all on function public.get_payment_provider_health_v1() from public;
grant execute on function public.get_payment_provider_health_v1() to authenticated;
