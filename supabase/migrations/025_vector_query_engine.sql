-- ============================================================
-- Vault OS – Phase 3 Sprint 3.3: Enterprise Vector Query Engine
-- Provider-independent similarity query infrastructure only.
-- No retrieval, RAG, prompt, or AI execution.
-- ============================================================

-- ── vector_search_policies (tenant query policies) ──────────────

create table if not exists public.vector_search_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  policy_name text not null,
  default_top_k integer not null default 10 check (default_top_k > 0),
  minimum_similarity_score numeric(5, 4) not null default 0.0000
    check (minimum_similarity_score >= 0 and minimum_similarity_score <= 1),
  maximum_results integer not null default 50 check (maximum_results > 0),
  metadata jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, policy_name)
);

drop trigger if exists vector_search_policies_updated_at on public.vector_search_policies;
create trigger vector_search_policies_updated_at
  before update on public.vector_search_policies
  for each row execute procedure public.set_updated_at();

create index if not exists idx_vector_search_policies_company
  on public.vector_search_policies(company_id, policy_name);

create unique index if not exists idx_vector_search_policies_one_default
  on public.vector_search_policies(company_id)
  where is_default = true;

-- ── vector_query_executions (query execution records) ───────────

create table if not exists public.vector_query_executions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vector_store_connection_id uuid not null references public.vector_store_connections(id) on delete restrict,
  collection_id uuid not null references public.vector_collections(id) on delete restrict,
  embedding_id uuid references public.knowledge_embeddings(id) on delete set null,
  policy_id uuid references public.vector_search_policies(id) on delete set null,
  query_checksum text not null,
  execution_status text not null default 'queued'
    check (execution_status in ('queued', 'running', 'completed', 'failed')),
  execution_time_ms integer check (execution_time_ms is null or execution_time_ms >= 0),
  provider text not null,
  result_count integer not null default 0 check (result_count >= 0),
  correlation_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists vector_query_executions_updated_at on public.vector_query_executions;
create trigger vector_query_executions_updated_at
  before update on public.vector_query_executions
  for each row execute procedure public.set_updated_at();

create index if not exists idx_vector_query_executions_company
  on public.vector_query_executions(company_id, created_at desc);

create index if not exists idx_vector_query_executions_collection
  on public.vector_query_executions(collection_id, created_at desc);

create index if not exists idx_vector_query_executions_correlation
  on public.vector_query_executions(correlation_id)
  where correlation_id is not null;

-- ── vector_query_results (normalized ranked results) ────────────

create table if not exists public.vector_query_results (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.vector_query_executions(id) on delete cascade,
  indexed_vector_id uuid not null references public.indexed_vectors(id) on delete restrict,
  normalized_score numeric(5, 4) not null
    check (normalized_score >= 0 and normalized_score <= 1),
  provider_score numeric,
  ranking integer not null check (ranking > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (execution_id, indexed_vector_id)
);

create index if not exists idx_vector_query_results_execution
  on public.vector_query_results(execution_id, ranking);

-- ── Row Level Security ────────────────────────────────────────

alter table public.vector_search_policies enable row level security;
alter table public.vector_query_executions enable row level security;
alter table public.vector_query_results enable row level security;

drop policy if exists vector_search_policies_select on public.vector_search_policies;
create policy vector_search_policies_select
  on public.vector_search_policies for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists vector_search_policies_insert on public.vector_search_policies;
create policy vector_search_policies_insert
  on public.vector_search_policies for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists vector_search_policies_update on public.vector_search_policies;
create policy vector_search_policies_update
  on public.vector_search_policies for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists vector_query_executions_select on public.vector_query_executions;
create policy vector_query_executions_select
  on public.vector_query_executions for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists vector_query_executions_insert on public.vector_query_executions;
create policy vector_query_executions_insert
  on public.vector_query_executions for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists vector_query_executions_update on public.vector_query_executions;
create policy vector_query_executions_update
  on public.vector_query_executions for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists vector_query_results_select on public.vector_query_results;
create policy vector_query_results_select
  on public.vector_query_results for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.vector_query_executions e
      where e.id = vector_query_results.execution_id
        and (
          public.is_super_admin()
          or e.company_id = public.current_company_id()
        )
    )
  );

drop policy if exists vector_query_results_insert on public.vector_query_results;
create policy vector_query_results_insert
  on public.vector_query_results for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.vector_query_executions e
      where e.id = vector_query_results.execution_id
        and (
          public.is_super_admin()
          or e.company_id = public.current_company_id()
        )
    )
  );

-- ── RBAC permissions ──────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('vectorquery.view', 'Vector Query', 'Vector Query', 'View', 'View vector query policies, executions, and results'),
  ('vectorquery.execute', 'Vector Query', 'Vector Query', 'Execute', 'Execute vector similarity queries'),
  ('vectorquery.manage', 'Vector Query', 'Vector Query', 'Manage', 'Manage vector search policies and query configuration')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.vector_search_policy_audit_events(
  p_old public.vector_search_policies,
  p_new public.vector_search_policies,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('search_policy_updated');
  end if;

  if p_op = 'UPDATE' then
    if p_old.policy_name is distinct from p_new.policy_name
       or p_old.default_top_k is distinct from p_new.default_top_k
       or p_old.minimum_similarity_score is distinct from p_new.minimum_similarity_score
       or p_old.maximum_results is distinct from p_new.maximum_results
       or p_old.metadata is distinct from p_new.metadata then
      return jsonb_build_array('search_policy_updated');
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.vector_query_execution_audit_events(
  p_old public.vector_query_executions,
  p_new public.vector_query_executions,
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
    return jsonb_build_array('vector_query_started');
  end if;

  if p_op = 'UPDATE' then
    if p_old.execution_status is distinct from p_new.execution_status and p_new.execution_status = 'completed' then
      v_events := v_events || jsonb_build_array('vector_query_completed', 'vector_results_ranked');
    elsif p_old.execution_status is distinct from p_new.execution_status and p_new.execution_status = 'failed' then
      v_events := v_events || jsonb_build_array('vector_query_failed');
    end if;
  end if;

  return v_events;
end;
$$;

create or replace function public.write_vector_query_audit_log()
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

  if TG_TABLE_NAME = 'vector_search_policies' then
    v_events := public.vector_search_policy_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'policy_name', coalesce(new.policy_name, old.policy_name),
      'default_top_k', coalesce(new.default_top_k, old.default_top_k),
      'minimum_similarity_score', coalesce(new.minimum_similarity_score, old.minimum_similarity_score)
    );
  elsif TG_TABLE_NAME = 'vector_query_executions' then
    v_events := public.vector_query_execution_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'provider', coalesce(new.provider, old.provider),
      'collection_id', coalesce(new.collection_id, old.collection_id),
      'result_count', coalesce(new.result_count, old.result_count),
      'execution_status', coalesce(new.execution_status, old.execution_status),
      'correlation_id', coalesce(new.correlation_id, old.correlation_id)
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

drop trigger if exists trg_audit_vector_search_policies on public.vector_search_policies;
create trigger trg_audit_vector_search_policies
  after insert or update or delete on public.vector_search_policies
  for each row execute procedure public.write_vector_query_audit_log();

drop trigger if exists trg_audit_vector_query_executions on public.vector_query_executions;
create trigger trg_audit_vector_query_executions
  after insert or update or delete on public.vector_query_executions
  for each row execute procedure public.write_vector_query_audit_log();
