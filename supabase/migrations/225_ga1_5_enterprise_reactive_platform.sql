-- GA-1.5 — Enterprise Reactive Platform (persistent event bus infrastructure)

-- ── Platform event audit ─────────────────────────────────────────────────────

create table if not exists public.platform_event_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  correlation_id text not null,
  causation_id text,
  actor_id uuid,
  actor_type text not null default 'system',
  source_module text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  envelope jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_event_audit_tenant
  on public.platform_event_audit(tenant_id, occurred_at desc);
create index if not exists idx_platform_event_audit_correlation
  on public.platform_event_audit(correlation_id);
create unique index if not exists idx_platform_event_audit_event_id
  on public.platform_event_audit(event_id);

-- ── Platform event timeline ──────────────────────────────────────────────────

create table if not exists public.platform_event_timeline (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  correlation_id text not null,
  entity_type text,
  entity_id text,
  actor_id uuid,
  title text not null,
  description text not null,
  source_module text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_event_timeline_entity
  on public.platform_event_timeline(tenant_id, entity_type, entity_id, occurred_at desc);
create index if not exists idx_platform_event_timeline_tenant
  on public.platform_event_timeline(tenant_id, occurred_at desc);

-- ── Dead letter queue ────────────────────────────────────────────────────────

create table if not exists public.platform_event_dlq (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  subscriber_id text not null,
  event_id text not null,
  event_type text not null,
  correlation_id text not null,
  envelope jsonb not null,
  error text not null,
  attempts integer not null default 1,
  replayed_at timestamptz,
  dead_lettered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_event_dlq_subscriber
  on public.platform_event_dlq(subscriber_id, dead_lettered_at desc);
create index if not exists idx_platform_event_dlq_tenant
  on public.platform_event_dlq(tenant_id, dead_lettered_at desc);

-- ── Subscriber telemetry ─────────────────────────────────────────────────────

create table if not exists public.platform_event_subscriber_telemetry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.companies(id) on delete cascade,
  subscriber_id text not null,
  event_id text not null,
  event_type text not null,
  correlation_id text not null,
  success boolean not null,
  latency_ms integer not null default 0,
  error text,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_platform_event_subscriber_telemetry_sub
  on public.platform_event_subscriber_telemetry(subscriber_id, recorded_at desc);

-- ── Correlation tracking ─────────────────────────────────────────────────────

create table if not exists public.platform_event_correlations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  correlation_id text not null,
  root_event_id text not null,
  event_id text not null,
  event_type text not null,
  parent_event_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_event_correlations_corr
  on public.platform_event_correlations(correlation_id);
create unique index if not exists idx_platform_event_correlations_event
  on public.platform_event_correlations(event_id);

-- ── Distributed idempotency ──────────────────────────────────────────────────

create table if not exists public.platform_event_idempotency (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  scope text not null,
  idempotency_key text not null,
  result_hash text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, scope, idempotency_key)
);

create index if not exists idx_platform_event_idempotency_expires
  on public.platform_event_idempotency(expires_at)
  where expires_at is not null;

-- ── Reactive signals (realtime cache invalidation) ───────────────────────────

create table if not exists public.platform_reactive_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  signal_type text not null,
  entity_type text,
  entity_id text,
  correlation_id text not null,
  source_subscriber text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_reactive_signals_tenant
  on public.platform_reactive_signals(tenant_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.platform_event_audit enable row level security;
alter table public.platform_event_timeline enable row level security;
alter table public.platform_event_dlq enable row level security;
alter table public.platform_event_subscriber_telemetry enable row level security;
alter table public.platform_event_correlations enable row level security;
alter table public.platform_event_idempotency enable row level security;
alter table public.platform_reactive_signals enable row level security;

create policy platform_event_audit_select on public.platform_event_audit
  for select using (
    tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy platform_event_timeline_select on public.platform_event_timeline
  for select using (
    tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy platform_event_dlq_select on public.platform_event_dlq
  for select using (
    tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy platform_reactive_signals_select on public.platform_reactive_signals
  for select using (
    tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

-- Service role writes (subscribers use elevated client context in adapters)
create policy platform_event_audit_insert on public.platform_event_audit
  for insert with check (auth.role() in ('authenticated', 'service_role'));

create policy platform_event_timeline_insert on public.platform_event_timeline
  for insert with check (auth.role() in ('authenticated', 'service_role'));

create policy platform_event_dlq_insert on public.platform_event_dlq
  for insert with check (auth.role() in ('authenticated', 'service_role'));

create policy platform_event_subscriber_telemetry_insert on public.platform_event_subscriber_telemetry
  for insert with check (auth.role() in ('authenticated', 'service_role'));

create policy platform_event_correlations_insert on public.platform_event_correlations
  for insert with check (auth.role() in ('authenticated', 'service_role'));

create policy platform_event_idempotency_all on public.platform_event_idempotency
  for all using (auth.role() in ('authenticated', 'service_role'));

create policy platform_reactive_signals_insert on public.platform_reactive_signals
  for insert with check (auth.role() in ('authenticated', 'service_role'));

create policy platform_event_dlq_update on public.platform_event_dlq
  for update using (auth.role() in ('authenticated', 'service_role'));

-- ── Realtime ─────────────────────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table public.platform_reactive_signals;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.platform_event_timeline;
exception when duplicate_object then null;
end $$;
