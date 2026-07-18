-- ============================================================
-- Vault OS – Phase 3 Sprint 3.4: Enterprise Retrieval Engine
-- Provider-independent retrieval context assembly only.
-- No prompt, LLM, AI execution, RAG orchestration, or UI.
-- ============================================================

-- ── retrieval_policies (tenant retrieval policies) ──────────────

create table if not exists public.retrieval_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  policy_name text not null,
  max_context_tokens integer not null default 4096 check (max_context_tokens > 0),
  max_chunks integer not null default 20 check (max_chunks > 0),
  window_expansion integer not null default 1 check (window_expansion >= 0),
  min_source_diversity integer not null default 1 check (min_source_diversity > 0),
  overlap_removal_threshold numeric(5, 4) not null default 0.8500
    check (overlap_removal_threshold >= 0 and overlap_removal_threshold <= 1),
  default_language text,
  source_priority jsonb not null default '{}'::jsonb,
  department_priority jsonb not null default '{}'::jsonb,
  chunk_selection_strategy text not null default 'score_first'
    check (chunk_selection_strategy in ('score_first', 'diversity_first', 'balanced')),
  metadata jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, policy_name)
);

drop trigger if exists retrieval_policies_updated_at on public.retrieval_policies;
create trigger retrieval_policies_updated_at
  before update on public.retrieval_policies
  for each row execute procedure public.set_updated_at();

create index if not exists idx_retrieval_policies_company
  on public.retrieval_policies(company_id, policy_name);

create unique index if not exists idx_retrieval_policies_one_default
  on public.retrieval_policies(company_id)
  where is_default = true;

-- ── retrieval_executions (retrieval execution records) ──────────

create table if not exists public.retrieval_executions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vector_query_execution_id uuid not null references public.vector_query_executions(id) on delete restrict,
  policy_id uuid references public.retrieval_policies(id) on delete set null,
  execution_status text not null default 'queued'
    check (execution_status in ('queued', 'running', 'completed', 'failed')),
  execution_time_ms integer check (execution_time_ms is null or execution_time_ms >= 0),
  correlation_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists retrieval_executions_updated_at on public.retrieval_executions;
create trigger retrieval_executions_updated_at
  before update on public.retrieval_executions
  for each row execute procedure public.set_updated_at();

create index if not exists idx_retrieval_executions_company
  on public.retrieval_executions(company_id, created_at desc);

create index if not exists idx_retrieval_executions_vector_query
  on public.retrieval_executions(vector_query_execution_id);

create index if not exists idx_retrieval_executions_correlation
  on public.retrieval_executions(correlation_id)
  where correlation_id is not null;

-- ── retrieval_contexts (assembled retrieval contexts) ───────────

create table if not exists public.retrieval_contexts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  execution_id uuid not null references public.retrieval_executions(id) on delete cascade,
  context_checksum text not null,
  chunk_count integer not null default 0 check (chunk_count >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists retrieval_contexts_updated_at on public.retrieval_contexts;
create trigger retrieval_contexts_updated_at
  before update on public.retrieval_contexts
  for each row execute procedure public.set_updated_at();

create index if not exists idx_retrieval_contexts_execution
  on public.retrieval_contexts(execution_id);

create index if not exists idx_retrieval_contexts_company
  on public.retrieval_contexts(company_id, created_at desc)
  where deleted_at is null;

-- ── retrieval_context_chunks (context chunk snapshots) ──────────

create table if not exists public.retrieval_context_chunks (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.retrieval_contexts(id) on delete cascade,
  knowledge_chunk_id uuid not null references public.knowledge_chunks(id) on delete restrict,
  indexed_vector_id uuid references public.indexed_vectors(id) on delete set null,
  selection_rank integer not null check (selection_rank > 0),
  normalized_score numeric(5, 4) check (normalized_score is null or (normalized_score >= 0 and normalized_score <= 1)),
  token_count integer not null default 0 check (token_count >= 0),
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (context_id, knowledge_chunk_id)
);

create index if not exists idx_retrieval_context_chunks_context
  on public.retrieval_context_chunks(context_id, selection_rank);

-- ── retrieval_metrics (execution metrics) ───────────────────────

create table if not exists public.retrieval_metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  execution_id uuid not null references public.retrieval_executions(id) on delete cascade,
  policy_id uuid references public.retrieval_policies(id) on delete set null,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  chunks_selected integer not null default 0 check (chunks_selected >= 0),
  chunks_rejected integer not null default 0 check (chunks_rejected >= 0),
  chunks_discarded_budget integer not null default 0 check (chunks_discarded_budget >= 0),
  budget_tokens integer not null default 0 check (budget_tokens >= 0),
  budget_used_tokens integer not null default 0 check (budget_used_tokens >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (execution_id)
);

create index if not exists idx_retrieval_metrics_company
  on public.retrieval_metrics(company_id, created_at desc);

-- ── Row Level Security ────────────────────────────────────────

alter table public.retrieval_policies enable row level security;
alter table public.retrieval_executions enable row level security;
alter table public.retrieval_contexts enable row level security;
alter table public.retrieval_context_chunks enable row level security;
alter table public.retrieval_metrics enable row level security;

drop policy if exists retrieval_policies_select on public.retrieval_policies;
create policy retrieval_policies_select
  on public.retrieval_policies for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists retrieval_policies_insert on public.retrieval_policies;
create policy retrieval_policies_insert
  on public.retrieval_policies for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists retrieval_policies_update on public.retrieval_policies;
create policy retrieval_policies_update
  on public.retrieval_policies for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists retrieval_executions_select on public.retrieval_executions;
create policy retrieval_executions_select
  on public.retrieval_executions for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists retrieval_executions_insert on public.retrieval_executions;
create policy retrieval_executions_insert
  on public.retrieval_executions for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists retrieval_executions_update on public.retrieval_executions;
create policy retrieval_executions_update
  on public.retrieval_executions for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists retrieval_contexts_select on public.retrieval_contexts;
create policy retrieval_contexts_select
  on public.retrieval_contexts for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists retrieval_contexts_insert on public.retrieval_contexts;
create policy retrieval_contexts_insert
  on public.retrieval_contexts for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists retrieval_contexts_update on public.retrieval_contexts;
create policy retrieval_contexts_update
  on public.retrieval_contexts for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists retrieval_context_chunks_select on public.retrieval_context_chunks;
create policy retrieval_context_chunks_select
  on public.retrieval_context_chunks for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.retrieval_contexts c
      where c.id = retrieval_context_chunks.context_id
        and (
          public.is_super_admin()
          or c.company_id = public.current_company_id()
        )
    )
  );

drop policy if exists retrieval_context_chunks_insert on public.retrieval_context_chunks;
create policy retrieval_context_chunks_insert
  on public.retrieval_context_chunks for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.retrieval_contexts c
      where c.id = retrieval_context_chunks.context_id
        and (
          public.is_super_admin()
          or c.company_id = public.current_company_id()
        )
    )
  );

drop policy if exists retrieval_metrics_select on public.retrieval_metrics;
create policy retrieval_metrics_select
  on public.retrieval_metrics for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists retrieval_metrics_insert on public.retrieval_metrics;
create policy retrieval_metrics_insert
  on public.retrieval_metrics for insert
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
  ('retrieval.view', 'Retrieval', 'Retrieval', 'View', 'View retrieval policies, executions, and contexts'),
  ('retrieval.execute', 'Retrieval', 'Retrieval', 'Execute', 'Execute retrieval context assembly'),
  ('retrieval.manage', 'Retrieval', 'Retrieval', 'Manage', 'Manage retrieval policies and configuration')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.retrieval_policy_audit_events(
  p_old public.retrieval_policies,
  p_new public.retrieval_policies,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('retrieval_policy_updated');
  end if;

  if p_op = 'UPDATE' then
    if p_old.policy_name is distinct from p_new.policy_name
       or p_old.max_context_tokens is distinct from p_new.max_context_tokens
       or p_old.max_chunks is distinct from p_new.max_chunks
       or p_old.window_expansion is distinct from p_new.window_expansion
       or p_old.min_source_diversity is distinct from p_new.min_source_diversity
       or p_old.overlap_removal_threshold is distinct from p_new.overlap_removal_threshold
       or p_old.default_language is distinct from p_new.default_language
       or p_old.source_priority is distinct from p_new.source_priority
       or p_old.department_priority is distinct from p_new.department_priority
       or p_old.chunk_selection_strategy is distinct from p_new.chunk_selection_strategy
       or p_old.metadata is distinct from p_new.metadata then
      return jsonb_build_array('retrieval_policy_updated');
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.retrieval_execution_audit_events(
  p_old public.retrieval_executions,
  p_new public.retrieval_executions,
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
    return jsonb_build_array('retrieval_started');
  end if;

  if p_op = 'UPDATE' then
    if p_old.execution_status is distinct from p_new.execution_status and p_new.execution_status = 'completed' then
      v_events := v_events || jsonb_build_array('retrieval_completed');
    elsif p_old.execution_status is distinct from p_new.execution_status and p_new.execution_status = 'failed' then
      v_events := v_events || jsonb_build_array('retrieval_failed');
    end if;
  end if;

  return v_events;
end;
$$;

create or replace function public.retrieval_context_audit_events(
  p_old public.retrieval_contexts,
  p_new public.retrieval_contexts,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('retrieval_context_created');
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.write_retrieval_audit_log()
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
  v_company_id := coalesce(new.company_id, old.company_id);

  if TG_TABLE_NAME = 'retrieval_policies' then
    v_events := public.retrieval_policy_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'policy_name', coalesce(new.policy_name, old.policy_name),
      'max_context_tokens', coalesce(new.max_context_tokens, old.max_context_tokens),
      'max_chunks', coalesce(new.max_chunks, old.max_chunks)
    );
  elsif TG_TABLE_NAME = 'retrieval_executions' then
    v_events := public.retrieval_execution_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'vector_query_execution_id', coalesce(new.vector_query_execution_id, old.vector_query_execution_id),
      'execution_status', coalesce(new.execution_status, old.execution_status),
      'correlation_id', coalesce(new.correlation_id, old.correlation_id)
    );
  elsif TG_TABLE_NAME = 'retrieval_contexts' then
    v_events := public.retrieval_context_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'execution_id', coalesce(new.execution_id, old.execution_id),
      'chunk_count', coalesce(new.chunk_count, old.chunk_count),
      'total_tokens', coalesce(new.total_tokens, old.total_tokens)
    );
  else
    if TG_OP = 'DELETE' then return old; end if;
    return new;
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

drop trigger if exists trg_audit_retrieval_policies on public.retrieval_policies;
create trigger trg_audit_retrieval_policies
  after insert or update or delete on public.retrieval_policies
  for each row execute procedure public.write_retrieval_audit_log();

drop trigger if exists trg_audit_retrieval_executions on public.retrieval_executions;
create trigger trg_audit_retrieval_executions
  after insert or update or delete on public.retrieval_executions
  for each row execute procedure public.write_retrieval_audit_log();

drop trigger if exists trg_audit_retrieval_contexts on public.retrieval_contexts;
create trigger trg_audit_retrieval_contexts
  after insert or update or delete on public.retrieval_contexts
  for each row execute procedure public.write_retrieval_audit_log();
