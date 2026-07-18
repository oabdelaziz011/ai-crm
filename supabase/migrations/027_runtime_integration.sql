-- ============================================================
-- Vault OS – Phase 3 Sprint 3.5: Enterprise AI Runtime Integration
-- Runtime coordination and observability only.
-- No new AI capabilities, provider SDKs, or duplicated engine logic.
-- ============================================================

-- ── execution_policies (tenant runtime policies) ────────────────

create table if not exists public.execution_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  policy_name text not null,
  knowledge_retrieval_enabled boolean not null default true,
  max_pipeline_duration_ms integer not null default 120000 check (max_pipeline_duration_ms > 0),
  metadata jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, policy_name)
);

drop trigger if exists execution_policies_updated_at on public.execution_policies;
create trigger execution_policies_updated_at
  before update on public.execution_policies
  for each row execute procedure public.set_updated_at();

create index if not exists idx_execution_policies_company
  on public.execution_policies(company_id, policy_name);

create unique index if not exists idx_execution_policies_one_default
  on public.execution_policies(company_id)
  where is_default = true;

-- ── runtime_sessions (coordinated session records) ──────────────

create table if not exists public.runtime_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  session_status text not null default 'active'
    check (session_status in ('active', 'completed', 'failed', 'cancelled')),
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists runtime_sessions_updated_at on public.runtime_sessions;
create trigger runtime_sessions_updated_at
  before update on public.runtime_sessions
  for each row execute procedure public.set_updated_at();

create index if not exists idx_runtime_sessions_company
  on public.runtime_sessions(company_id, created_at desc);

create index if not exists idx_runtime_sessions_conversation
  on public.runtime_sessions(conversation_id, created_at desc);

-- ── runtime_executions (pipeline execution records) ─────────────

create table if not exists public.runtime_executions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid not null references public.runtime_sessions(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  policy_id uuid references public.execution_policies(id) on delete set null,
  execution_status text not null default 'queued'
    check (execution_status in ('queued', 'running', 'completed', 'failed')),
  intent_key text,
  provider_key text,
  prompt_build_id uuid,
  ai_execution_id uuid,
  retrieval_execution_id uuid,
  vector_query_execution_id uuid,
  execution_time_ms integer check (execution_time_ms is null or execution_time_ms >= 0),
  correlation_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists runtime_executions_updated_at on public.runtime_executions;
create trigger runtime_executions_updated_at
  before update on public.runtime_executions
  for each row execute procedure public.set_updated_at();

create index if not exists idx_runtime_executions_company
  on public.runtime_executions(company_id, created_at desc);

create index if not exists idx_runtime_executions_session
  on public.runtime_executions(session_id, created_at desc);

create index if not exists idx_runtime_executions_conversation
  on public.runtime_executions(conversation_id, created_at desc);

-- ── runtime_execution_steps (pipeline stage records) ────────────

create table if not exists public.runtime_execution_steps (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.runtime_executions(id) on delete cascade,
  stage text not null
    check (stage in (
      'conversation',
      'state',
      'intent',
      'retrieval',
      'prompt',
      'execution',
      'provider',
      'response',
      'persistence',
      'observability'
    )),
  step_status text not null default 'running'
    check (step_status in ('running', 'completed', 'failed', 'skipped')),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists runtime_execution_steps_updated_at on public.runtime_execution_steps;
create trigger runtime_execution_steps_updated_at
  before update on public.runtime_execution_steps
  for each row execute procedure public.set_updated_at();

create index if not exists idx_runtime_execution_steps_execution
  on public.runtime_execution_steps(execution_id, created_at);

-- ── runtime_execution_errors (structured runtime errors) ────────

create table if not exists public.runtime_execution_errors (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.runtime_executions(id) on delete cascade,
  step_id uuid references public.runtime_execution_steps(id) on delete set null,
  error_code text not null,
  error_category text not null,
  human_message text not null,
  developer_message text not null,
  correlation_id text,
  recoverable boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_runtime_execution_errors_execution
  on public.runtime_execution_errors(execution_id, created_at desc);

-- ── Row Level Security ────────────────────────────────────────

alter table public.execution_policies enable row level security;
alter table public.runtime_sessions enable row level security;
alter table public.runtime_executions enable row level security;
alter table public.runtime_execution_steps enable row level security;
alter table public.runtime_execution_errors enable row level security;

drop policy if exists execution_policies_select on public.execution_policies;
create policy execution_policies_select
  on public.execution_policies for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists execution_policies_insert on public.execution_policies;
create policy execution_policies_insert
  on public.execution_policies for insert
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists execution_policies_update on public.execution_policies;
create policy execution_policies_update
  on public.execution_policies for update
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists runtime_sessions_select on public.runtime_sessions;
create policy runtime_sessions_select
  on public.runtime_sessions for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists runtime_sessions_insert on public.runtime_sessions;
create policy runtime_sessions_insert
  on public.runtime_sessions for insert
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists runtime_sessions_update on public.runtime_sessions;
create policy runtime_sessions_update
  on public.runtime_sessions for update
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists runtime_executions_select on public.runtime_executions;
create policy runtime_executions_select
  on public.runtime_executions for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists runtime_executions_insert on public.runtime_executions;
create policy runtime_executions_insert
  on public.runtime_executions for insert
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists runtime_executions_update on public.runtime_executions;
create policy runtime_executions_update
  on public.runtime_executions for update
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists runtime_execution_steps_select on public.runtime_execution_steps;
create policy runtime_execution_steps_select
  on public.runtime_execution_steps for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.runtime_executions e
      where e.id = runtime_execution_steps.execution_id
        and (public.is_super_admin() or e.company_id = public.current_company_id())
    )
  );

drop policy if exists runtime_execution_steps_insert on public.runtime_execution_steps;
create policy runtime_execution_steps_insert
  on public.runtime_execution_steps for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.runtime_executions e
      where e.id = runtime_execution_steps.execution_id
        and (public.is_super_admin() or e.company_id = public.current_company_id())
    )
  );

drop policy if exists runtime_execution_steps_update on public.runtime_execution_steps;
create policy runtime_execution_steps_update
  on public.runtime_execution_steps for update
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.runtime_executions e
      where e.id = runtime_execution_steps.execution_id
        and (public.is_super_admin() or e.company_id = public.current_company_id())
    )
  );

drop policy if exists runtime_execution_errors_select on public.runtime_execution_errors;
create policy runtime_execution_errors_select
  on public.runtime_execution_errors for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.runtime_executions e
      where e.id = runtime_execution_errors.execution_id
        and (public.is_super_admin() or e.company_id = public.current_company_id())
    )
  );

drop policy if exists runtime_execution_errors_insert on public.runtime_execution_errors;
create policy runtime_execution_errors_insert
  on public.runtime_execution_errors for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.runtime_executions e
      where e.id = runtime_execution_errors.execution_id
        and (public.is_super_admin() or e.company_id = public.current_company_id())
    )
  );

-- ── RBAC permissions ──────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('runtime.view', 'Runtime', 'Runtime', 'View', 'View runtime sessions, executions, and pipeline steps'),
  ('runtime.execute', 'Runtime', 'Runtime', 'Execute', 'Execute the AI runtime pipeline'),
  ('runtime.manage', 'Runtime', 'Runtime', 'Manage', 'Manage runtime execution policies and configuration')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.execution_policy_audit_events(
  p_old public.execution_policies,
  p_new public.execution_policies,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('runtime_policy_updated');
  end if;

  if p_op = 'UPDATE' then
    if p_old.policy_name is distinct from p_new.policy_name
       or p_old.knowledge_retrieval_enabled is distinct from p_new.knowledge_retrieval_enabled
       or p_old.max_pipeline_duration_ms is distinct from p_new.max_pipeline_duration_ms
       or p_old.metadata is distinct from p_new.metadata then
      return jsonb_build_array('runtime_policy_updated');
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.runtime_execution_audit_events(
  p_old public.runtime_executions,
  p_new public.runtime_executions,
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
    return jsonb_build_array('runtime_started');
  end if;

  if p_op = 'UPDATE' then
    if p_old.execution_status is distinct from p_new.execution_status and p_new.execution_status = 'completed' then
      v_events := v_events || jsonb_build_array('runtime_completed');
    elsif p_old.execution_status is distinct from p_new.execution_status and p_new.execution_status = 'failed' then
      v_events := v_events || jsonb_build_array('runtime_failed');
    end if;
  end if;

  return v_events;
end;
$$;

create or replace function public.runtime_execution_step_audit_events(
  p_old public.runtime_execution_steps,
  p_new public.runtime_execution_steps,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return '[]'::jsonb;
  end if;

  if p_op = 'UPDATE' and p_old.step_status is distinct from p_new.step_status and p_new.step_status = 'completed' then
    return jsonb_build_array('runtime_step_completed');
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.write_runtime_audit_log()
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
  v_events jsonb := '[]'::jsonb;
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  v_entity_id := coalesce(new.id, old.id)::text;

  if TG_TABLE_NAME = 'execution_policies' then
    v_company_id := coalesce(new.company_id, old.company_id);
    v_events := public.execution_policy_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'policy_name', coalesce(new.policy_name, old.policy_name),
      'knowledge_retrieval_enabled', coalesce(new.knowledge_retrieval_enabled, old.knowledge_retrieval_enabled)
    );
  elsif TG_TABLE_NAME = 'runtime_executions' then
    v_company_id := coalesce(new.company_id, old.company_id);
    v_events := public.runtime_execution_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'conversation_id', coalesce(new.conversation_id, old.conversation_id),
      'execution_status', coalesce(new.execution_status, old.execution_status),
      'intent_key', coalesce(new.intent_key, old.intent_key),
      'provider_key', coalesce(new.provider_key, old.provider_key),
      'correlation_id', coalesce(new.correlation_id, old.correlation_id)
    );
  elsif TG_TABLE_NAME = 'runtime_execution_steps' then
    select e.company_id into v_company_id
    from public.runtime_executions e
    where e.id = coalesce(new.execution_id, old.execution_id);

    v_events := public.runtime_execution_step_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'stage', coalesce(new.stage, old.stage),
      'step_status', coalesce(new.step_status, old.step_status)
    );
  else
    if TG_OP = 'DELETE' then return old; end if;
    return new;
  end if;

  insert into public.audit_logs (
    user_id, company_id, action, entity, entity_id, ip_address, metadata, created_at
  )
  values (
    auth.uid(), v_company_id, v_action, TG_TABLE_NAME, v_entity_id,
    public.request_ip_address(), v_metadata, now()
  );

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_execution_policies on public.execution_policies;
create trigger trg_audit_execution_policies
  after insert or update or delete on public.execution_policies
  for each row execute procedure public.write_runtime_audit_log();

drop trigger if exists trg_audit_runtime_executions on public.runtime_executions;
create trigger trg_audit_runtime_executions
  after insert or update or delete on public.runtime_executions
  for each row execute procedure public.write_runtime_audit_log();

drop trigger if exists trg_audit_runtime_execution_steps on public.runtime_execution_steps;
create trigger trg_audit_runtime_execution_steps
  after insert or update or delete on public.runtime_execution_steps
  for each row execute procedure public.write_runtime_audit_log();
