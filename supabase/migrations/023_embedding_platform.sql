-- ============================================================
-- Vault OS – Phase 3 Sprint 3.1: Enterprise Embedding Platform
-- Spec references 022_embedding_platform.sql; 022 is the knowledge
-- domain migration — this additive migration keeps zero breaking changes.
-- ============================================================

-- ── embedding_provider_definitions (global catalog) ───────────

create table if not exists public.embedding_provider_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  description text not null default '',
  icon text,
  default_model text not null,
  default_dimensions integer not null default 1536 check (default_dimensions > 0),
  configuration_schema jsonb not null default '{}'::jsonb,
  default_configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists embedding_provider_definitions_updated_at on public.embedding_provider_definitions;
create trigger embedding_provider_definitions_updated_at
  before update on public.embedding_provider_definitions
  for each row execute procedure public.set_updated_at();

create index if not exists idx_embedding_provider_definitions_key
  on public.embedding_provider_definitions(key);

create index if not exists idx_embedding_provider_definitions_is_active
  on public.embedding_provider_definitions(is_active)
  where is_active = true;

-- ── embedding_provider_connections (tenant connections) ─────────

create table if not exists public.embedding_provider_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_id uuid not null references public.embedding_provider_definitions(id) on delete restrict,
  display_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'disabled', 'error')),
  configuration jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  is_enabled boolean not null default false,
  health_status text not null default 'unknown'
    check (health_status in ('connected', 'disconnected', 'warning', 'error', 'unknown')),
  last_health_check timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

drop trigger if exists embedding_provider_connections_updated_at on public.embedding_provider_connections;
create trigger embedding_provider_connections_updated_at
  before update on public.embedding_provider_connections
  for each row execute procedure public.set_updated_at();

create index if not exists idx_embedding_provider_connections_company_id
  on public.embedding_provider_connections(company_id)
  where deleted_at is null;

create index if not exists idx_embedding_provider_connections_provider_id
  on public.embedding_provider_connections(provider_id)
  where deleted_at is null;

create index if not exists idx_embedding_provider_connections_company_enabled
  on public.embedding_provider_connections(company_id, is_enabled)
  where deleted_at is null;

create unique index if not exists idx_embedding_provider_connections_one_default
  on public.embedding_provider_connections(company_id)
  where is_default = true and deleted_at is null;

-- ── knowledge_embeddings (provider-agnostic vector storage) ───

create table if not exists public.knowledge_embeddings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  knowledge_chunk_id uuid not null references public.knowledge_chunks(id) on delete cascade,
  connection_id uuid not null references public.embedding_provider_connections(id) on delete restrict,
  provider text not null,
  model text not null,
  dimensions integer not null check (dimensions > 0),
  embedding_version integer not null default 1 check (embedding_version > 0),
  vector jsonb not null,
  checksum text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'superseded', 'failed', 'archived')),
  is_active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (knowledge_chunk_id, provider, model, embedding_version)
);

create index if not exists idx_knowledge_embeddings_company
  on public.knowledge_embeddings(company_id, created_at desc);

create index if not exists idx_knowledge_embeddings_chunk
  on public.knowledge_embeddings(knowledge_chunk_id, embedding_version desc);

create unique index if not exists idx_knowledge_embeddings_active
  on public.knowledge_embeddings(knowledge_chunk_id, provider, model)
  where is_active = true and status = 'active';

-- ── embedding_jobs (async generation queue) ─────────────────────

create table if not exists public.embedding_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  knowledge_chunk_id uuid not null references public.knowledge_chunks(id) on delete cascade,
  connection_id uuid not null references public.embedding_provider_connections(id) on delete restrict,
  provider text not null,
  model text not null,
  embedding_version integer not null default 1 check (embedding_version > 0),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retries integer not null default 3 check (max_retries >= 0),
  error_message text,
  result_embedding_id uuid references public.knowledge_embeddings(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

drop trigger if exists embedding_jobs_updated_at on public.embedding_jobs;
create trigger embedding_jobs_updated_at
  before update on public.embedding_jobs
  for each row execute procedure public.set_updated_at();

create index if not exists idx_embedding_jobs_company_status
  on public.embedding_jobs(company_id, status, queued_at);

create index if not exists idx_embedding_jobs_chunk
  on public.embedding_jobs(knowledge_chunk_id, created_at desc);

create index if not exists idx_embedding_jobs_queued
  on public.embedding_jobs(status, queued_at)
  where status = 'queued';

-- ── Row Level Security ────────────────────────────────────────

alter table public.embedding_provider_definitions enable row level security;
alter table public.embedding_provider_connections enable row level security;
alter table public.knowledge_embeddings enable row level security;
alter table public.embedding_jobs enable row level security;

drop policy if exists embedding_provider_definitions_select on public.embedding_provider_definitions;
create policy embedding_provider_definitions_select
  on public.embedding_provider_definitions for select
  using (auth.role() = 'authenticated');

drop policy if exists embedding_provider_definitions_write on public.embedding_provider_definitions;
create policy embedding_provider_definitions_write
  on public.embedding_provider_definitions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists embedding_provider_connections_select on public.embedding_provider_connections;
create policy embedding_provider_connections_select
  on public.embedding_provider_connections for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists embedding_provider_connections_insert on public.embedding_provider_connections;
create policy embedding_provider_connections_insert
  on public.embedding_provider_connections for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists embedding_provider_connections_update on public.embedding_provider_connections;
create policy embedding_provider_connections_update
  on public.embedding_provider_connections for update
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

drop policy if exists knowledge_embeddings_select on public.knowledge_embeddings;
create policy knowledge_embeddings_select
  on public.knowledge_embeddings for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_embeddings_insert on public.knowledge_embeddings;
create policy knowledge_embeddings_insert
  on public.knowledge_embeddings for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_embeddings_update on public.knowledge_embeddings;
create policy knowledge_embeddings_update
  on public.knowledge_embeddings for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists embedding_jobs_select on public.embedding_jobs;
create policy embedding_jobs_select
  on public.embedding_jobs for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists embedding_jobs_insert on public.embedding_jobs;
create policy embedding_jobs_insert
  on public.embedding_jobs for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists embedding_jobs_update on public.embedding_jobs;
create policy embedding_jobs_update
  on public.embedding_jobs for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

-- ── RBAC permissions ──────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('embeddings.view', 'Embeddings', 'Embeddings', 'View', 'View embedding providers, jobs, and stored embeddings'),
  ('embeddings.manage', 'Embeddings', 'Embeddings', 'Manage', 'Manage embedding provider connections'),
  ('embeddings.generate', 'Embeddings', 'Embeddings', 'Generate', 'Queue and process embedding generation jobs')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── seed embedding provider definitions ───────────────────────

insert into public.embedding_provider_definitions (
  key,
  display_name,
  description,
  icon,
  default_model,
  default_dimensions,
  configuration_schema,
  default_configuration,
  is_active,
  version
)
values
  (
    'openai',
    'OpenAI Embeddings',
    'OpenAI-compatible embedding provider adapter.',
    'openai',
    'text-embedding-3-small',
    1536,
    '{"type":"object","properties":{"model":{"type":"string"},"dimensions":{"type":"number"},"baseUrl":{"type":"string"}},"required":["model"]}'::jsonb,
    '{"model":"text-embedding-3-small","dimensions":1536}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'azure_openai',
    'Azure OpenAI Embeddings',
    'Azure OpenAI embedding provider adapter.',
    'azure',
    'text-embedding-3-small',
    1536,
    '{"type":"object","properties":{"model":{"type":"string"},"deploymentName":{"type":"string"},"endpoint":{"type":"string"},"apiVersion":{"type":"string"},"dimensions":{"type":"number"}},"required":["model","deploymentName","endpoint"]}'::jsonb,
    '{"model":"text-embedding-3-small","dimensions":1536,"apiVersion":"2024-02-01"}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'gemini',
    'Gemini Embeddings',
    'Google Gemini embedding provider adapter.',
    'gemini',
    'text-embedding-004',
    768,
    '{"type":"object","properties":{"model":{"type":"string"},"projectId":{"type":"string"},"dimensions":{"type":"number"}},"required":["model"]}'::jsonb,
    '{"model":"text-embedding-004","dimensions":768}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'cohere',
    'Cohere Embeddings',
    'Cohere embedding provider adapter.',
    'cohere',
    'embed-english-v3.0',
    1024,
    '{"type":"object","properties":{"model":{"type":"string"},"dimensions":{"type":"number"}},"required":["model"]}'::jsonb,
    '{"model":"embed-english-v3.0","dimensions":1024}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'voyage',
    'Voyage AI Embeddings',
    'Voyage AI embedding provider adapter.',
    'voyage',
    'voyage-3',
    1024,
    '{"type":"object","properties":{"model":{"type":"string"},"dimensions":{"type":"number"}},"required":["model"]}'::jsonb,
    '{"model":"voyage-3","dimensions":1024}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'ollama',
    'Ollama Embeddings',
    'Local Ollama embedding provider adapter.',
    'ollama',
    'nomic-embed-text',
    768,
    '{"type":"object","properties":{"model":{"type":"string"},"baseUrl":{"type":"string"},"dimensions":{"type":"number"}},"required":["model","baseUrl"]}'::jsonb,
    '{"model":"nomic-embed-text","baseUrl":"http://localhost:11434","dimensions":768}'::jsonb,
    true,
    '1.0.0'
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  default_model = excluded.default_model,
  default_dimensions = excluded.default_dimensions,
  configuration_schema = excluded.configuration_schema,
  default_configuration = excluded.default_configuration,
  is_active = excluded.is_active,
  version = excluded.version,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.embedding_job_audit_events(
  p_old public.embedding_jobs,
  p_new public.embedding_jobs,
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
    v_events := jsonb_build_array('embedding_requested');
    if p_new.embedding_version > 1 then
      v_events := v_events || jsonb_build_array('embedding_regenerated');
    end if;
    return v_events;
  end if;

  if p_op = 'UPDATE' then
    if p_old.status is distinct from p_new.status and p_new.status = 'failed' then
      v_events := v_events || jsonb_build_array('embedding_failed');
    end if;
  end if;

  return v_events;
end;
$$;

create or replace function public.knowledge_embedding_audit_events(
  p_old public.knowledge_embeddings,
  p_new public.knowledge_embeddings,
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
    return jsonb_build_array('embedding_generated');
  end if;

  if p_op = 'UPDATE' then
    if p_old.is_active is distinct from p_new.is_active and p_new.is_active = true then
      v_events := v_events || jsonb_build_array('embedding_activated');
    end if;
  end if;

  return v_events;
end;
$$;

create or replace function public.write_embedding_audit_log()
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

  if TG_TABLE_NAME = 'embedding_jobs' then
    v_events := public.embedding_job_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'knowledge_chunk_id', coalesce(new.knowledge_chunk_id, old.knowledge_chunk_id),
      'provider', coalesce(new.provider, old.provider),
      'model', coalesce(new.model, old.model),
      'embedding_version', coalesce(new.embedding_version, old.embedding_version),
      'status', coalesce(new.status, old.status)
    );
  elsif TG_TABLE_NAME = 'knowledge_embeddings' then
    v_events := public.knowledge_embedding_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'knowledge_chunk_id', coalesce(new.knowledge_chunk_id, old.knowledge_chunk_id),
      'provider', coalesce(new.provider, old.provider),
      'model', coalesce(new.model, old.model),
      'embedding_version', coalesce(new.embedding_version, old.embedding_version),
      'dimensions', coalesce(new.dimensions, old.dimensions),
      'checksum', coalesce(new.checksum, old.checksum),
      'status', coalesce(new.status, old.status),
      'is_active', coalesce(new.is_active, old.is_active)
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

drop trigger if exists trg_audit_embedding_jobs on public.embedding_jobs;
create trigger trg_audit_embedding_jobs
  after insert or update or delete on public.embedding_jobs
  for each row execute procedure public.write_embedding_audit_log();

drop trigger if exists trg_audit_knowledge_embeddings on public.knowledge_embeddings;
create trigger trg_audit_knowledge_embeddings
  after insert or update or delete on public.knowledge_embeddings
  for each row execute procedure public.write_embedding_audit_log();
