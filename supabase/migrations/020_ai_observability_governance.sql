-- ============================================================
-- Vault OS – Phase 2 Sprint 2.9: AI Observability & Governance
-- ============================================================

-- ── ai_traces (end-to-end AI request tracing) ─────────────────

create table if not exists public.ai_traces (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null unique default gen_random_uuid(),
  correlation_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_ai_traces_company_started
  on public.ai_traces(company_id, started_at desc);

create index if not exists idx_ai_traces_correlation_id
  on public.ai_traces(correlation_id);

create index if not exists idx_ai_traces_conversation_started
  on public.ai_traces(conversation_id, started_at desc)
  where conversation_id is not null;

create index if not exists idx_ai_traces_status
  on public.ai_traces(company_id, status, started_at desc)
  where status in ('pending', 'running', 'failed');

-- ── ai_trace_spans (pipeline stage spans) ─────────────────────

create table if not exists public.ai_trace_spans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  trace_id uuid not null references public.ai_traces(id) on delete cascade,
  correlation_id uuid not null,
  stage text not null
    check (stage in ('conversation', 'intent', 'tool_router', 'prompt_build', 'ai_execution', 'provider', 'response')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0)
);

create index if not exists idx_ai_trace_spans_trace_stage
  on public.ai_trace_spans(trace_id, stage, started_at);

create index if not exists idx_ai_trace_spans_correlation
  on public.ai_trace_spans(correlation_id, started_at desc);

create index if not exists idx_ai_trace_spans_company_started
  on public.ai_trace_spans(company_id, started_at desc);

-- ── ai_execution_analytics (operational analytics snapshots) ──

create table if not exists public.ai_execution_analytics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  trace_id uuid references public.ai_traces(id) on delete set null,
  correlation_id uuid not null,
  execution_id uuid references public.ai_executions(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  provider_key text not null,
  model text not null,
  prompt_build_id uuid references public.prompt_builds(id) on delete set null,
  template_key text,
  template_version_id uuid references public.prompt_template_versions(id) on delete set null,
  latency_ms integer not null check (latency_ms >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  used_fallback boolean not null default false,
  had_timeout boolean not null default false,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost numeric(14, 6) not null default 0 check (estimated_cost >= 0),
  currency text not null default 'USD',
  execution_status text not null,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_ai_execution_analytics_company_recorded
  on public.ai_execution_analytics(company_id, recorded_at desc);

create index if not exists idx_ai_execution_analytics_correlation
  on public.ai_execution_analytics(correlation_id, recorded_at desc);

create index if not exists idx_ai_execution_analytics_provider_recorded
  on public.ai_execution_analytics(company_id, provider_key, recorded_at desc);

create index if not exists idx_ai_execution_analytics_execution
  on public.ai_execution_analytics(execution_id)
  where execution_id is not null;

-- ── ai_token_cost_records (token accounting) ──────────────────

create table if not exists public.ai_token_cost_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  trace_id uuid references public.ai_traces(id) on delete set null,
  execution_id uuid references public.ai_executions(id) on delete set null,
  billing_period text not null,
  provider_key text not null,
  model text not null,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost numeric(14, 6) not null default 0 check (estimated_cost >= 0),
  currency text not null default 'USD',
  recorded_at timestamptz not null default now()
);

create index if not exists idx_ai_token_cost_records_company_period
  on public.ai_token_cost_records(company_id, billing_period, recorded_at desc);

create index if not exists idx_ai_token_cost_records_trace
  on public.ai_token_cost_records(trace_id)
  where trace_id is not null;

-- ── Row Level Security ────────────────────────────────────────

alter table public.ai_traces enable row level security;
alter table public.ai_trace_spans enable row level security;
alter table public.ai_execution_analytics enable row level security;
alter table public.ai_token_cost_records enable row level security;

drop policy if exists ai_traces_select on public.ai_traces;
create policy ai_traces_select
  on public.ai_traces for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_traces_insert on public.ai_traces;
create policy ai_traces_insert
  on public.ai_traces for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_traces_update on public.ai_traces;
create policy ai_traces_update
  on public.ai_traces for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_trace_spans_select on public.ai_trace_spans;
create policy ai_trace_spans_select
  on public.ai_trace_spans for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_trace_spans_insert on public.ai_trace_spans;
create policy ai_trace_spans_insert
  on public.ai_trace_spans for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_trace_spans_update on public.ai_trace_spans;
create policy ai_trace_spans_update
  on public.ai_trace_spans for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_execution_analytics_select on public.ai_execution_analytics;
create policy ai_execution_analytics_select
  on public.ai_execution_analytics for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_execution_analytics_insert on public.ai_execution_analytics;
create policy ai_execution_analytics_insert
  on public.ai_execution_analytics for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_token_cost_records_select on public.ai_token_cost_records;
create policy ai_token_cost_records_select
  on public.ai_token_cost_records for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_token_cost_records_insert on public.ai_token_cost_records;
create policy ai_token_cost_records_insert
  on public.ai_token_cost_records for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

-- ── RBAC permissions ──────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('ai.analytics.view', 'AI', 'Analytics', 'View', 'View AI analytics and trace history'),
  ('ai.analytics.manage', 'AI', 'Analytics', 'Manage', 'Manage AI observability configuration'),
  ('ai.costs.view', 'AI', 'Costs', 'View', 'View AI token usage and cost accounting')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.ai_trace_audit_events(
  p_old public.ai_traces,
  p_new public.ai_traces,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_events jsonb := '[]'::jsonb;
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('trace_started');
  end if;

  if p_old.status is distinct from p_new.status then
    if p_new.status = 'running' and p_old.status = 'pending' then
      v_events := v_events || jsonb_build_array('trace_started');
    elsif p_new.status = 'completed' then
      v_events := v_events || jsonb_build_array('trace_completed');
    elsif p_new.status = 'failed' then
      v_events := v_events || jsonb_build_array('trace_failed');
    end if;
  end if;

  if p_new.error_code = 'policy_violation'
     and coalesce(p_old.error_code, '') is distinct from 'policy_violation' then
    v_events := v_events || jsonb_build_array('policy_violated');
  end if;

  return v_events;
end;
$$;

create or replace function public.write_ai_trace_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity_id text;
  v_company_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  v_entity_id := coalesce(new.id, old.id)::text;
  v_company_id := coalesce(new.company_id, old.company_id);

  if TG_OP = 'INSERT' then
    v_metadata := jsonb_build_object(
      'events', public.ai_trace_audit_events(old, new, TG_OP),
      'trace_id', new.trace_id,
      'correlation_id', new.correlation_id,
      'conversation_id', new.conversation_id,
      'status', new.status
    );
  elsif TG_OP = 'UPDATE' then
    v_metadata := jsonb_build_object(
      'events', public.ai_trace_audit_events(old, new, TG_OP),
      'trace_id', new.trace_id,
      'correlation_id', new.correlation_id,
      'conversation_id', new.conversation_id,
      'old', jsonb_build_object('status', old.status, 'error_code', old.error_code),
      'new', jsonb_build_object('status', new.status, 'error_code', new.error_code, 'duration_ms', new.duration_ms)
    );
  else
    v_metadata := jsonb_build_object(
      'events', jsonb_build_array('trace_failed'),
      'trace_id', old.trace_id,
      'correlation_id', old.correlation_id
    );
  end if;

  insert into public.audit_logs (
    user_id,
    company_id,
    action,
    entity,
    entity_id,
    ip_address,
    metadata,
    created_at
  )
  values (
    auth.uid(),
    v_company_id,
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    public.request_ip_address(),
    v_metadata,
    now()
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_ai_traces on public.ai_traces;
create trigger trg_audit_ai_traces
  after insert or update or delete on public.ai_traces
  for each row execute procedure public.write_ai_trace_audit_log();

create or replace function public.write_ai_token_cost_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (
    user_id,
    company_id,
    action,
    entity,
    entity_id,
    ip_address,
    metadata,
    created_at
  )
  values (
    auth.uid(),
    new.company_id,
    'CREATE',
    TG_TABLE_NAME,
    new.id::text,
    public.request_ip_address(),
    jsonb_build_object(
      'events', jsonb_build_array('cost_recorded'),
      'trace_id', new.trace_id,
      'execution_id', new.execution_id,
      'provider_key', new.provider_key,
      'model', new.model,
      'billing_period', new.billing_period,
      'estimated_cost', new.estimated_cost,
      'currency', new.currency,
      'total_tokens', new.total_tokens
    ),
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_ai_token_cost_records on public.ai_token_cost_records;
create trigger trg_audit_ai_token_cost_records
  after insert on public.ai_token_cost_records
  for each row execute procedure public.write_ai_token_cost_audit_log();
