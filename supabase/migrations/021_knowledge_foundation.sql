-- ============================================================
-- Vault OS – Phase 2 Sprint 2.9: Enterprise Knowledge Foundation
-- ============================================================

-- ── knowledge_sources (tenant-scoped source registry) ─────────

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  display_name text not null,
  description text not null default '',
  source_type text not null
    check (source_type in (
      'manual', 'faq', 'pdf', 'website', 'database', 'crm',
      'notion', 'confluence', 'google_drive', 'sharepoint', 'api', 'custom'
    )),
  configuration jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, key)
);

drop trigger if exists knowledge_sources_updated_at on public.knowledge_sources;
create trigger knowledge_sources_updated_at
  before update on public.knowledge_sources
  for each row execute procedure public.set_updated_at();

create index if not exists idx_knowledge_sources_company_key
  on public.knowledge_sources(company_id, key)
  where deleted_at is null;

create index if not exists idx_knowledge_sources_company_type
  on public.knowledge_sources(company_id, source_type)
  where deleted_at is null;

create index if not exists idx_knowledge_sources_enabled
  on public.knowledge_sources(company_id, is_enabled)
  where deleted_at is null and is_enabled = true;

-- ── knowledge_documents (source-owned documents) ──────────────

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete restrict,
  title text not null,
  description text not null default '',
  language text not null default 'en',
  version integer not null default 1 check (version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  checksum text not null,
  mime_type text not null default 'text/plain',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null
);

drop trigger if exists knowledge_documents_updated_at on public.knowledge_documents;
create trigger knowledge_documents_updated_at
  before update on public.knowledge_documents
  for each row execute procedure public.set_updated_at();

create index if not exists idx_knowledge_documents_company_source
  on public.knowledge_documents(company_id, source_id, updated_at desc)
  where deleted_at is null;

create index if not exists idx_knowledge_documents_status
  on public.knowledge_documents(company_id, status, updated_at desc)
  where deleted_at is null;

create index if not exists idx_knowledge_documents_checksum
  on public.knowledge_documents(company_id, checksum)
  where deleted_at is null;

-- ── knowledge_chunks (logical text units) ─────────────────────

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  token_count integer not null default 0 check (token_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  checksum text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (document_id, chunk_index)
);

create index if not exists idx_knowledge_chunks_document_index
  on public.knowledge_chunks(document_id, chunk_index)
  where deleted_at is null;

create index if not exists idx_knowledge_chunks_company_document
  on public.knowledge_chunks(company_id, document_id)
  where deleted_at is null;

-- ── Row Level Security ────────────────────────────────────────

alter table public.knowledge_sources enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;

drop policy if exists knowledge_sources_select on public.knowledge_sources;
create policy knowledge_sources_select
  on public.knowledge_sources for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_sources_insert on public.knowledge_sources;
create policy knowledge_sources_insert
  on public.knowledge_sources for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_sources_update on public.knowledge_sources;
create policy knowledge_sources_update
  on public.knowledge_sources for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_documents_select on public.knowledge_documents;
create policy knowledge_documents_select
  on public.knowledge_documents for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_documents_insert on public.knowledge_documents;
create policy knowledge_documents_insert
  on public.knowledge_documents for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_documents_update on public.knowledge_documents;
create policy knowledge_documents_update
  on public.knowledge_documents for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_chunks_select on public.knowledge_chunks;
create policy knowledge_chunks_select
  on public.knowledge_chunks for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_chunks_insert on public.knowledge_chunks;
create policy knowledge_chunks_insert
  on public.knowledge_chunks for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_chunks_update on public.knowledge_chunks;
create policy knowledge_chunks_update
  on public.knowledge_chunks for update
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
  ('knowledge.view', 'Knowledge', 'Knowledge', 'View', 'View knowledge sources, documents, and chunks'),
  ('knowledge.manage', 'Knowledge', 'Knowledge', 'Manage', 'Manage knowledge sources and documents'),
  ('knowledge.import', 'Knowledge', 'Knowledge', 'Import', 'Import knowledge documents and generate chunks')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.knowledge_source_audit_events(
  p_old public.knowledge_sources,
  p_new public.knowledge_sources,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('knowledge_source_created');
  end if;
  if p_op = 'UPDATE' and p_old.deleted_at is null and p_new.deleted_at is not null then
    return jsonb_build_array('knowledge_source_archived');
  end if;
  return '[]'::jsonb;
end;
$$;

create or replace function public.knowledge_document_audit_events(
  p_old public.knowledge_documents,
  p_new public.knowledge_documents,
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
    return jsonb_build_array('document_imported');
  end if;

  if p_op = 'UPDATE' then
    if p_old.status is distinct from p_new.status and p_new.status = 'archived' then
      v_events := v_events || jsonb_build_array('document_archived');
    elsif p_old.title is distinct from p_new.title
       or p_old.description is distinct from p_new.description
       or p_old.version is distinct from p_new.version
       or p_old.checksum is distinct from p_new.checksum then
      v_events := v_events || jsonb_build_array('document_updated');
    end if;
  end if;

  return v_events;
end;
$$;

create or replace function public.write_knowledge_audit_log()
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

  if TG_TABLE_NAME = 'knowledge_sources' then
    v_events := public.knowledge_source_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'key', coalesce(new.key, old.key),
      'display_name', coalesce(new.display_name, old.display_name),
      'source_type', coalesce(new.source_type, old.source_type)
    );
  elsif TG_TABLE_NAME = 'knowledge_documents' then
    v_events := public.knowledge_document_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'title', coalesce(new.title, old.title),
      'source_id', coalesce(new.source_id, old.source_id),
      'version', coalesce(new.version, old.version),
      'status', coalesce(new.status, old.status),
      'checksum', coalesce(new.checksum, old.checksum)
    );
  elsif TG_TABLE_NAME = 'knowledge_chunks' then
    if TG_OP <> 'INSERT' then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', jsonb_build_array('chunk_generated'),
      'document_id', new.document_id,
      'chunk_index', new.chunk_index,
      'token_count', new.token_count
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

drop trigger if exists trg_audit_knowledge_sources on public.knowledge_sources;
create trigger trg_audit_knowledge_sources
  after insert or update or delete on public.knowledge_sources
  for each row execute procedure public.write_knowledge_audit_log();

drop trigger if exists trg_audit_knowledge_documents on public.knowledge_documents;
create trigger trg_audit_knowledge_documents
  after insert or update or delete on public.knowledge_documents
  for each row execute procedure public.write_knowledge_audit_log();

drop trigger if exists trg_audit_knowledge_chunks on public.knowledge_chunks;
create trigger trg_audit_knowledge_chunks
  after insert on public.knowledge_chunks
  for each row execute procedure public.write_knowledge_audit_log();
