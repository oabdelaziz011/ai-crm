-- ============================================================
-- Vault OS – Phase 3 Sprint 3.2: Enterprise Vector Store Platform
-- Infrastructure-only vector storage. No search or retrieval.
-- ============================================================

-- ── vector_store_definitions (global catalog) ─────────────────

create table if not exists public.vector_store_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  description text not null default '',
  icon text,
  supported_capabilities jsonb not null default '[]'::jsonb,
  configuration_schema jsonb not null default '{}'::jsonb,
  default_configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists vector_store_definitions_updated_at on public.vector_store_definitions;
create trigger vector_store_definitions_updated_at
  before update on public.vector_store_definitions
  for each row execute procedure public.set_updated_at();

create index if not exists idx_vector_store_definitions_key
  on public.vector_store_definitions(key);

create index if not exists idx_vector_store_definitions_is_active
  on public.vector_store_definitions(is_active)
  where is_active = true;

-- ── vector_store_connections (tenant connections) ─────────────

create table if not exists public.vector_store_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_id uuid not null references public.vector_store_definitions(id) on delete restrict,
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

drop trigger if exists vector_store_connections_updated_at on public.vector_store_connections;
create trigger vector_store_connections_updated_at
  before update on public.vector_store_connections
  for each row execute procedure public.set_updated_at();

create index if not exists idx_vector_store_connections_company_id
  on public.vector_store_connections(company_id)
  where deleted_at is null;

create index if not exists idx_vector_store_connections_provider_id
  on public.vector_store_connections(provider_id)
  where deleted_at is null;

create index if not exists idx_vector_store_connections_company_enabled
  on public.vector_store_connections(company_id, is_enabled)
  where deleted_at is null;

create unique index if not exists idx_vector_store_connections_one_default
  on public.vector_store_connections(company_id)
  where is_default = true and deleted_at is null;

-- ── vector_collections (tenant-scoped collections) ────────────

create table if not exists public.vector_collections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connection_id uuid not null references public.vector_store_connections(id) on delete restrict,
  name text not null,
  provider text not null,
  embedding_version integer not null default 1 check (embedding_version > 0),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'archived')),
  is_active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, connection_id, name)
);

drop trigger if exists vector_collections_updated_at on public.vector_collections;
create trigger vector_collections_updated_at
  before update on public.vector_collections
  for each row execute procedure public.set_updated_at();

create index if not exists idx_vector_collections_company
  on public.vector_collections(company_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_vector_collections_connection
  on public.vector_collections(connection_id, name)
  where deleted_at is null;

create unique index if not exists idx_vector_collections_active_name
  on public.vector_collections(company_id, name)
  where is_active = true and deleted_at is null;

-- ── indexed_vectors (knowledge embedding index registry) ────────

create table if not exists public.indexed_vectors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  knowledge_embedding_id uuid not null references public.knowledge_embeddings(id) on delete cascade,
  collection_id uuid not null references public.vector_collections(id) on delete cascade,
  provider text not null,
  external_reference text not null,
  status text not null default 'pending'
    check (status in ('pending', 'indexed', 'failed', 'removed')),
  metadata jsonb not null default '{}'::jsonb,
  indexed_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (knowledge_embedding_id, collection_id)
);

drop trigger if exists indexed_vectors_updated_at on public.indexed_vectors;
create trigger indexed_vectors_updated_at
  before update on public.indexed_vectors
  for each row execute procedure public.set_updated_at();

create index if not exists idx_indexed_vectors_company
  on public.indexed_vectors(company_id, created_at desc);

create index if not exists idx_indexed_vectors_collection
  on public.indexed_vectors(collection_id, status);

create index if not exists idx_indexed_vectors_embedding
  on public.indexed_vectors(knowledge_embedding_id);

-- ── Row Level Security ────────────────────────────────────────

alter table public.vector_store_definitions enable row level security;
alter table public.vector_store_connections enable row level security;
alter table public.vector_collections enable row level security;
alter table public.indexed_vectors enable row level security;

drop policy if exists vector_store_definitions_select on public.vector_store_definitions;
create policy vector_store_definitions_select
  on public.vector_store_definitions for select
  using (auth.role() = 'authenticated');

drop policy if exists vector_store_definitions_write on public.vector_store_definitions;
create policy vector_store_definitions_write
  on public.vector_store_definitions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists vector_store_connections_select on public.vector_store_connections;
create policy vector_store_connections_select
  on public.vector_store_connections for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists vector_store_connections_insert on public.vector_store_connections;
create policy vector_store_connections_insert
  on public.vector_store_connections for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists vector_store_connections_update on public.vector_store_connections;
create policy vector_store_connections_update
  on public.vector_store_connections for update
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

drop policy if exists vector_collections_select on public.vector_collections;
create policy vector_collections_select
  on public.vector_collections for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists vector_collections_insert on public.vector_collections;
create policy vector_collections_insert
  on public.vector_collections for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists vector_collections_update on public.vector_collections;
create policy vector_collections_update
  on public.vector_collections for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists indexed_vectors_select on public.indexed_vectors;
create policy indexed_vectors_select
  on public.indexed_vectors for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists indexed_vectors_insert on public.indexed_vectors;
create policy indexed_vectors_insert
  on public.indexed_vectors for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists indexed_vectors_update on public.indexed_vectors;
create policy indexed_vectors_update
  on public.indexed_vectors for update
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
  ('vectorstores.view', 'Vector Stores', 'Vector Stores', 'View', 'View vector store providers, connections, and collections'),
  ('vectorstores.manage', 'Vector Stores', 'Vector Stores', 'Manage', 'Manage vector store provider connections'),
  ('collections.manage', 'Vector Stores', 'Collections', 'Manage', 'Manage vector collections and indexed vectors')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── seed vector store definitions ─────────────────────────────

insert into public.vector_store_definitions (
  key,
  display_name,
  description,
  icon,
  supported_capabilities,
  configuration_schema,
  default_configuration,
  is_active,
  version
)
values
  (
    'pgvector',
    'PGVector',
    'PostgreSQL pgvector storage adapter.',
    'pgvector',
    '["create_collection","delete_collection","upsert_vector","delete_vector","collection_statistics"]'::jsonb,
    '{"type":"object","properties":{"schema":{"type":"string"},"tablePrefix":{"type":"string"}},"required":["schema"]}'::jsonb,
    '{"schema":"public","tablePrefix":"vs_"}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'pinecone',
    'Pinecone',
    'Pinecone vector storage adapter.',
    'pinecone',
    '["create_collection","delete_collection","upsert_vector","delete_vector","collection_statistics"]'::jsonb,
    '{"type":"object","properties":{"environment":{"type":"string"},"indexName":{"type":"string"}},"required":["environment","indexName"]}'::jsonb,
    '{"environment":"us-east-1","indexName":"vaultos-index"}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'qdrant',
    'Qdrant',
    'Qdrant vector storage adapter.',
    'qdrant',
    '["create_collection","delete_collection","upsert_vector","delete_vector","collection_statistics"]'::jsonb,
    '{"type":"object","properties":{"url":{"type":"string"},"apiKey":{"type":"string"}},"required":["url"]}'::jsonb,
    '{"url":"http://localhost:6333"}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'chroma',
    'Chroma',
    'Chroma vector storage adapter.',
    'chroma',
    '["create_collection","delete_collection","upsert_vector","delete_vector","collection_statistics"]'::jsonb,
    '{"type":"object","properties":{"host":{"type":"string"},"port":{"type":"number"}},"required":["host"]}'::jsonb,
    '{"host":"localhost","port":8000}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'azure_ai_search',
    'Azure AI Search',
    'Azure AI Search vector storage adapter.',
    'azure',
    '["create_collection","delete_collection","upsert_vector","delete_vector","collection_statistics"]'::jsonb,
    '{"type":"object","properties":{"endpoint":{"type":"string"},"indexName":{"type":"string"},"apiVersion":{"type":"string"}},"required":["endpoint","indexName"]}'::jsonb,
    '{"endpoint":"https://example.search.windows.net","indexName":"vaultos-vectors","apiVersion":"2024-07-01"}'::jsonb,
    true,
    '1.0.0'
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  supported_capabilities = excluded.supported_capabilities,
  configuration_schema = excluded.configuration_schema,
  default_configuration = excluded.default_configuration,
  is_active = excluded.is_active,
  version = excluded.version,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.vector_store_connection_audit_events(
  p_old public.vector_store_connections,
  p_new public.vector_store_connections,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('provider_connected');
  end if;

  if p_op = 'UPDATE' then
    if p_old.is_enabled = true and p_new.is_enabled = false then
      return jsonb_build_array('provider_disconnected');
    end if;
    if p_old.is_enabled = false and p_new.is_enabled = true then
      return jsonb_build_array('provider_connected');
    end if;
    if p_old.deleted_at is null and p_new.deleted_at is not null then
      return jsonb_build_array('provider_disconnected');
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.vector_collection_audit_events(
  p_old public.vector_collections,
  p_new public.vector_collections,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('vector_collection_created');
  end if;

  if p_op = 'UPDATE' then
    if p_old.deleted_at is null and p_new.deleted_at is not null then
      return jsonb_build_array('vector_collection_deleted');
    end if;
    if p_old.status is distinct from p_new.status and p_new.status = 'archived' then
      return jsonb_build_array('vector_collection_deleted');
    end if;
  end if;

  if p_op = 'DELETE' then
    return jsonb_build_array('vector_collection_deleted');
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.indexed_vector_audit_events(
  p_old public.indexed_vectors,
  p_new public.indexed_vectors,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('vector_indexed');
  end if;

  if p_op = 'UPDATE' then
    if p_old.status is distinct from p_new.status and p_new.status = 'indexed' then
      return jsonb_build_array('vector_indexed');
    end if;
    if p_old.status is distinct from p_new.status and p_new.status = 'removed' then
      return jsonb_build_array('vector_removed');
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.write_vector_store_audit_log()
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

  if TG_TABLE_NAME = 'vector_store_connections' then
    v_events := public.vector_store_connection_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'display_name', coalesce(new.display_name, old.display_name),
      'status', coalesce(new.status, old.status),
      'is_enabled', coalesce(new.is_enabled, old.is_enabled)
    );
  elsif TG_TABLE_NAME = 'vector_collections' then
    v_events := public.vector_collection_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'name', coalesce(new.name, old.name),
      'provider', coalesce(new.provider, old.provider),
      'embedding_version', coalesce(new.embedding_version, old.embedding_version),
      'status', coalesce(new.status, old.status)
    );
  elsif TG_TABLE_NAME = 'indexed_vectors' then
    v_events := public.indexed_vector_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'collection_id', coalesce(new.collection_id, old.collection_id),
      'knowledge_embedding_id', coalesce(new.knowledge_embedding_id, old.knowledge_embedding_id),
      'provider', coalesce(new.provider, old.provider),
      'status', coalesce(new.status, old.status)
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

drop trigger if exists trg_audit_vector_store_connections on public.vector_store_connections;
create trigger trg_audit_vector_store_connections
  after insert or update or delete on public.vector_store_connections
  for each row execute procedure public.write_vector_store_audit_log();

drop trigger if exists trg_audit_vector_collections on public.vector_collections;
create trigger trg_audit_vector_collections
  after insert or update or delete on public.vector_collections
  for each row execute procedure public.write_vector_store_audit_log();

drop trigger if exists trg_audit_indexed_vectors on public.indexed_vectors;
create trigger trg_audit_indexed_vectors
  after insert or update or delete on public.indexed_vectors
  for each row execute procedure public.write_vector_store_audit_log();
