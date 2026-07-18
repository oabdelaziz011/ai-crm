-- ============================================================
-- Vault OS – Billing: Usage Metering (Phase 1)
-- Architecture: billing-subscriptions.md v4 §3
-- ============================================================

create table if not exists public.usage_metric_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  description text,
  unit text not null default 'count'
    check (unit in ('count', 'token', 'byte', 'message', 'call')),
  aggregation_type text not null default 'counter'
    check (aggregation_type in ('counter', 'gauge')),
  billable boolean not null default true,
  default_period text not null default 'monthly'
    check (default_period in ('hourly', 'daily', 'monthly')),
  retention_days integer not null default 90,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.usage_metric_definitions (code, label, unit, aggregation_type, billable)
values
  ('ai_tokens', 'AI Tokens', 'token', 'counter', true),
  ('storage_bytes', 'Storage', 'byte', 'gauge', true),
  ('api_calls', 'API Calls', 'call', 'counter', true),
  ('users', 'Active Users', 'count', 'gauge', false),
  ('emails_sent', 'Emails Sent', 'message', 'counter', true),
  ('sms_sent', 'SMS Sent', 'message', 'counter', true),
  ('whatsapp_messages', 'WhatsApp Messages', 'message', 'counter', true)
on conflict (code) do nothing;

alter table public.usage_metric_definitions
  add column if not exists sort_order integer not null default 0;

update public.usage_metric_definitions u
set sort_order = v.sort_order
from (values
  ('ai_tokens', 1),
  ('storage_bytes', 2),
  ('api_calls', 3),
  ('users', 4),
  ('emails_sent', 5),
  ('sms_sent', 6),
  ('whatsapp_messages', 7)
) as v(code, sort_order)
where u.code = v.code;

create table if not exists public.usage_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  metric_code text not null references public.usage_metric_definitions(code) on delete restrict,
  quantity numeric not null check (quantity >= 0),
  recorded_at timestamptz not null default now(),
  billing_period text not null,
  source text not null default 'system',
  reference_type text,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_records_company_metric_recorded
  on public.usage_records(company_id, metric_code, recorded_at desc);
create index if not exists idx_usage_records_company_period_metric
  on public.usage_records(company_id, billing_period, metric_code);
create unique index if not exists idx_usage_records_idempotency
  on public.usage_records(company_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.usage_aggregates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  metric_code text not null references public.usage_metric_definitions(code) on delete restrict,
  granularity text not null check (granularity in ('hour', 'day', 'month')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_quantity numeric not null default 0,
  record_count integer not null default 0,
  computed_at timestamptz not null default now(),
  unique (company_id, metric_code, granularity, period_start)
);

create index if not exists idx_usage_aggregates_company_metric
  on public.usage_aggregates(company_id, metric_code, period_start desc);

create table if not exists public.company_usage_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_date date not null,
  metrics jsonb not null default '{}'::jsonb,
  source text not null default 'daily_rollup'
    check (source in ('daily_rollup', 'on_demand')),
  created_at timestamptz not null default now(),
  unique (company_id, snapshot_date)
);

create index if not exists idx_company_usage_snapshots_company_date
  on public.company_usage_snapshots(company_id, snapshot_date desc);

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
  if p_company_id is null or p_metric_code is null then
    raise exception 'company_id and metric_code are required';
  end if;

  if not exists (
    select 1 from public.usage_metric_definitions d
    where d.code = p_metric_code and d.is_active = true
  ) then
    raise exception 'Unknown usage metric: %', p_metric_code;
  end if;

  v_period := to_char(coalesce(p_recorded_at, now()), 'YYYY-MM');

  insert into public.usage_records (
    company_id,
    metric_code,
    quantity,
    recorded_at,
    billing_period,
    source,
    reference_type,
    reference_id,
    metadata,
    idempotency_key
  )
  values (
    p_company_id,
    p_metric_code,
    coalesce(p_quantity, 0),
    coalesce(p_recorded_at, now()),
    v_period,
    coalesce(p_source, 'system'),
    p_reference_type,
    p_reference_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_idempotency_key
  )
  on conflict (company_id, idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select ur.id into v_id
    from public.usage_records ur
    where ur.company_id = p_company_id
      and ur.idempotency_key = p_idempotency_key
    limit 1;
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
declare
  v_count integer := 0;
begin
  insert into public.usage_aggregates (
    company_id,
    metric_code,
    granularity,
    period_start,
    period_end,
    total_quantity,
    record_count,
    computed_at
  )
  select
    ur.company_id,
    ur.metric_code,
    p_granularity,
    date_trunc(case p_granularity when 'hour' then 'hour' when 'month' then 'month' else 'day' end, ur.recorded_at) as period_start,
    date_trunc(case p_granularity when 'hour' then 'hour' when 'month' then 'month' else 'day' end, ur.recorded_at)
      + case p_granularity
          when 'hour' then interval '1 hour'
          when 'month' then interval '1 month'
          else interval '1 day'
        end as period_end,
    sum(ur.quantity) as total_quantity,
    count(*)::integer as record_count,
    now()
  from public.usage_records ur
  where ur.recorded_at >= p_from
    and ur.recorded_at < p_to
  group by ur.company_id, ur.metric_code, period_start, period_end
  on conflict (company_id, metric_code, granularity, period_start)
  do update set
    total_quantity = excluded.total_quantity,
    record_count = excluded.record_count,
    computed_at = now();

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
declare
  v_id uuid;
  v_metrics jsonb;
  v_period_start timestamptz := date_trunc('month', now());
begin
  select coalesce(jsonb_object_agg(metric_code, total_quantity), '{}'::jsonb)
  into v_metrics
  from public.usage_aggregates
  where company_id = p_company_id
    and granularity = 'month'
    and period_start = v_period_start;

  insert into public.company_usage_snapshots (company_id, snapshot_date, metrics, source)
  values (p_company_id, current_date, coalesce(v_metrics, '{}'::jsonb), 'on_demand')
  on conflict (company_id, snapshot_date)
  do update set
    metrics = excluded.metrics,
    source = excluded.source,
    created_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

alter table public.usage_metric_definitions enable row level security;
alter table public.usage_records enable row level security;
alter table public.usage_aggregates enable row level security;
alter table public.company_usage_snapshots enable row level security;

drop policy if exists usage_metric_definitions_select on public.usage_metric_definitions;
create policy usage_metric_definitions_select
  on public.usage_metric_definitions for select
  using (auth.role() = 'authenticated');

drop policy if exists usage_records_select on public.usage_records;
create policy usage_records_select
  on public.usage_records for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or public.user_has_permission('billing.view')
      or company_id = public.current_company_id()
    )
  );

drop policy if exists usage_records_insert on public.usage_records;
create policy usage_records_insert on public.usage_records for insert with check (false);

drop policy if exists usage_aggregates_select on public.usage_aggregates;
create policy usage_aggregates_select
  on public.usage_aggregates for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or public.user_has_permission('billing.view')
      or company_id = public.current_company_id()
    )
  );

drop policy if exists company_usage_snapshots_select on public.company_usage_snapshots;
create policy company_usage_snapshots_select
  on public.company_usage_snapshots for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or public.user_has_permission('billing.view')
      or company_id = public.current_company_id()
    )
  );

grant execute on function public.ingest_usage_event(uuid, text, numeric, jsonb, text, timestamptz, text, text, text) to authenticated;
grant execute on function public.rollup_usage_aggregates(text, timestamptz, timestamptz) to authenticated;
grant execute on function public.refresh_company_usage_snapshot(uuid) to authenticated;
