-- ============================================================
-- Vault OS – Phase 2 Sprint 2.8: Enterprise AI Execution Engine
-- ============================================================

-- ── ai_executions (tenant-scoped execution history) ───────────

create table if not exists public.ai_executions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  prompt_build_id uuid references public.prompt_builds(id) on delete set null,
  provider_connection_id uuid references public.ai_provider_connections(id) on delete set null,
  fallback_connection_id uuid references public.ai_provider_connections(id) on delete set null,
  provider_key text not null,
  model text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'timeout', 'cancelled', 'fallback')),
  runtime_policy jsonb not null default '{}'::jsonb,
  finish_reason text,
  raw_response jsonb,
  normalized_response jsonb,
  token_usage jsonb not null default '{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}'::jsonb,
  error_code text,
  error_message text,
  retry_count integer not null default 0 check (retry_count >= 0),
  used_fallback_provider boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_ai_executions_company_started
  on public.ai_executions(company_id, started_at desc);

create index if not exists idx_ai_executions_conversation_started
  on public.ai_executions(conversation_id, started_at desc)
  where conversation_id is not null;

create index if not exists idx_ai_executions_prompt_build
  on public.ai_executions(prompt_build_id)
  where prompt_build_id is not null;

create index if not exists idx_ai_executions_provider_key
  on public.ai_executions(company_id, provider_key, started_at desc);

create index if not exists idx_ai_executions_status
  on public.ai_executions(company_id, status, started_at desc)
  where status in ('pending', 'running', 'failed', 'timeout');

-- ── ai_execution_metrics (telemetry snapshots) ────────────────

create table if not exists public.ai_execution_metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  execution_id uuid not null references public.ai_executions(id) on delete cascade,
  provider_key text not null,
  model text not null,
  status text not null,
  latency_ms integer not null check (latency_ms >= 0),
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  used_fallback_provider boolean not null default false,
  recorded_at timestamptz not null default now()
);

create unique index if not exists idx_ai_execution_metrics_execution_id
  on public.ai_execution_metrics(execution_id);

create index if not exists idx_ai_execution_metrics_company_recorded
  on public.ai_execution_metrics(company_id, recorded_at desc);

create index if not exists idx_ai_execution_metrics_provider_recorded
  on public.ai_execution_metrics(company_id, provider_key, recorded_at desc);

-- ── Row Level Security ────────────────────────────────────────

alter table public.ai_executions enable row level security;
alter table public.ai_execution_metrics enable row level security;

drop policy if exists ai_executions_select on public.ai_executions;
create policy ai_executions_select
  on public.ai_executions for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_executions_insert on public.ai_executions;
create policy ai_executions_insert
  on public.ai_executions for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_executions_update on public.ai_executions;
create policy ai_executions_update
  on public.ai_executions for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_execution_metrics_select on public.ai_execution_metrics;
create policy ai_execution_metrics_select
  on public.ai_execution_metrics for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_execution_metrics_insert on public.ai_execution_metrics;
create policy ai_execution_metrics_insert
  on public.ai_execution_metrics for insert
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
  ('ai.execution.view', 'AI', 'Execution', 'View', 'View AI execution history and metrics'),
  ('ai.execution.manage', 'AI', 'Execution', 'Manage', 'Manage AI execution policies and run executions')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.ai_execution_audit_events(
  p_old public.ai_executions,
  p_new public.ai_executions,
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
    return jsonb_build_array('ai_execution_started');
  end if;

  if p_old.status is distinct from p_new.status then
    if p_new.status = 'running' and p_old.status = 'pending' then
      v_events := v_events || jsonb_build_array('ai_execution_started');
    elsif p_new.status = 'succeeded' then
      v_events := v_events || jsonb_build_array('ai_execution_completed');
    elsif p_new.status in ('failed', 'cancelled') then
      v_events := v_events || jsonb_build_array('ai_execution_failed');
    elsif p_new.status = 'timeout' then
      v_events := v_events || jsonb_build_array('provider_timeout');
    elsif p_new.status = 'fallback' then
      v_events := v_events || jsonb_build_array('fallback_provider_used');
    end if;
  end if;

  if p_new.retry_count > coalesce(p_old.retry_count, 0) then
    v_events := v_events || jsonb_build_array('provider_retry');
  end if;

  return v_events;
end;
$$;

create or replace function public.write_ai_execution_audit_log()
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

  if TG_TABLE_NAME = 'ai_executions' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'events', public.ai_execution_audit_events(old, new, TG_OP),
        'provider_key', new.provider_key,
        'model', new.model,
        'conversation_id', new.conversation_id,
        'prompt_build_id', new.prompt_build_id,
        'status', new.status
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'events', public.ai_execution_audit_events(old, new, TG_OP),
        'provider_key', new.provider_key,
        'model', new.model,
        'conversation_id', new.conversation_id,
        'prompt_build_id', new.prompt_build_id,
        'old', jsonb_build_object('status', old.status, 'retry_count', old.retry_count),
        'new', jsonb_build_object(
          'status', new.status,
          'retry_count', new.retry_count,
          'duration_ms', new.duration_ms,
          'used_fallback_provider', new.used_fallback_provider
        )
      );
    else
      v_metadata := jsonb_build_object(
        'provider_key', old.provider_key,
        'events', jsonb_build_array('ai_execution_failed')
      );
    end if;
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

drop trigger if exists trg_audit_ai_executions on public.ai_executions;
create trigger trg_audit_ai_executions
  after insert or update or delete on public.ai_executions
  for each row execute procedure public.write_ai_execution_audit_log();
