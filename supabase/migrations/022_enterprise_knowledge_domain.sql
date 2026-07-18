-- ============================================================
-- Vault OS – Phase 3 Sprint 3.0: Enterprise Knowledge Domain
-- Extends 021_knowledge_foundation.sql without breaking changes.
-- ============================================================

-- ── extend source types ───────────────────────────────────────

alter table public.knowledge_sources drop constraint if exists knowledge_sources_source_type_check;
alter table public.knowledge_sources add constraint knowledge_sources_source_type_check
  check (source_type in (
    'manual', 'faq', 'policy', 'pdf', 'website', 'database', 'crm', 'api',
    'notion', 'confluence', 'google_drive', 'sharepoint', 'custom'
  ));

-- ── extend documents with governance fields ───────────────────

alter table public.knowledge_documents
  add column if not exists effective_date date,
  add column if not exists expiration_date date,
  add column if not exists author text,
  add column if not exists classification text not null default 'internal',
  add column if not exists visibility text not null default 'company',
  add column if not exists retention_policy text,
  add column if not exists current_version_number integer not null default 1 check (current_version_number > 0),
  add column if not exists published_version_id uuid;

update public.knowledge_documents
set status = 'published'
where status = 'active';

alter table public.knowledge_documents drop constraint if exists knowledge_documents_status_check;
alter table public.knowledge_documents add constraint knowledge_documents_status_check
  check (status in ('draft', 'published', 'archived'));

-- ── knowledge_document_versions (immutable published snapshots) ─

create table if not exists public.knowledge_document_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  checksum text not null,
  mime_type text not null default 'text/plain',
  metadata jsonb not null default '{}'::jsonb,
  is_immutable boolean not null default false,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (document_id, version_number)
);

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_published_version_id_fkey;
alter table public.knowledge_documents
  add constraint knowledge_documents_published_version_id_fkey
  foreign key (published_version_id) references public.knowledge_document_versions(id) on delete set null;

create index if not exists idx_knowledge_document_versions_document
  on public.knowledge_document_versions(document_id, version_number desc);

create index if not exists idx_knowledge_document_versions_status
  on public.knowledge_document_versions(company_id, status, created_at desc);

-- backfill version 1 for existing documents
insert into public.knowledge_document_versions (
  company_id,
  document_id,
  version_number,
  status,
  checksum,
  mime_type,
  metadata,
  is_immutable,
  published_at,
  created_by
)
select
  d.company_id,
  d.id,
  coalesce(d.version, 1),
  case when d.status = 'published' then 'published' else 'draft' end,
  d.checksum,
  d.mime_type,
  d.metadata,
  d.status = 'published',
  case when d.status = 'published' then d.updated_at else null end,
  d.created_by
from public.knowledge_documents d
where not exists (
  select 1
  from public.knowledge_document_versions v
  where v.document_id = d.id and v.version_number = coalesce(d.version, 1)
);

update public.knowledge_documents d
set
  published_version_id = v.id,
  current_version_number = v.version_number
from public.knowledge_document_versions v
where v.document_id = d.id
  and v.version_number = coalesce(d.version, 1)
  and d.status = 'published'
  and d.published_version_id is null;

-- ── knowledge_sections (hierarchical document structure) ──────

create table if not exists public.knowledge_sections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  version_id uuid not null references public.knowledge_document_versions(id) on delete cascade,
  parent_section_id uuid references public.knowledge_sections(id) on delete cascade,
  title text not null,
  content text not null default '',
  section_order integer not null default 0 check (section_order >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_knowledge_sections_document_version_order
  on public.knowledge_sections(document_id, version_id, section_order)
  where deleted_at is null;

create index if not exists idx_knowledge_sections_parent
  on public.knowledge_sections(parent_section_id)
  where parent_section_id is not null and deleted_at is null;

-- ── knowledge_tags ────────────────────────────────────────────

create table if not exists public.knowledge_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (document_id, tag)
);

create index if not exists idx_knowledge_tags_company_tag
  on public.knowledge_tags(company_id, tag);

-- ── extend chunks for versions, sections, chunk order ─────────

alter table public.knowledge_chunks
  add column if not exists version_id uuid references public.knowledge_document_versions(id) on delete cascade,
  add column if not exists section_id uuid references public.knowledge_sections(id) on delete set null,
  add column if not exists chunk_order integer;

update public.knowledge_chunks
set chunk_order = chunk_index
where chunk_order is null;

alter table public.knowledge_chunks
  alter column chunk_order set not null;

-- attach legacy chunks to backfilled version 1
update public.knowledge_chunks c
set version_id = v.id
from public.knowledge_document_versions v
where c.document_id = v.document_id
  and v.version_number = 1
  and c.version_id is null;

create index if not exists idx_knowledge_chunks_version_order
  on public.knowledge_chunks(version_id, chunk_order)
  where deleted_at is null;

-- ── Row Level Security ────────────────────────────────────────

alter table public.knowledge_document_versions enable row level security;
alter table public.knowledge_sections enable row level security;
alter table public.knowledge_tags enable row level security;

drop policy if exists knowledge_document_versions_select on public.knowledge_document_versions;
create policy knowledge_document_versions_select
  on public.knowledge_document_versions for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_document_versions_insert on public.knowledge_document_versions;
create policy knowledge_document_versions_insert
  on public.knowledge_document_versions for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_document_versions_update on public.knowledge_document_versions;
create policy knowledge_document_versions_update
  on public.knowledge_document_versions for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_sections_select on public.knowledge_sections;
create policy knowledge_sections_select
  on public.knowledge_sections for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_sections_insert on public.knowledge_sections;
create policy knowledge_sections_insert
  on public.knowledge_sections for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_sections_update on public.knowledge_sections;
create policy knowledge_sections_update
  on public.knowledge_sections for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_tags_select on public.knowledge_tags;
create policy knowledge_tags_select
  on public.knowledge_tags for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_tags_insert on public.knowledge_tags;
create policy knowledge_tags_insert
  on public.knowledge_tags for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists knowledge_tags_delete on public.knowledge_tags;
create policy knowledge_tags_delete
  on public.knowledge_tags for delete
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
  ('knowledge.publish', 'Knowledge', 'Knowledge', 'Publish', 'Publish knowledge document versions')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── audit helpers (extend domain events) ──────────────────────

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
    return jsonb_build_array('source_created');
  end if;
  if p_op = 'UPDATE' and p_old.deleted_at is null and p_new.deleted_at is not null then
    return jsonb_build_array('source_archived');
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
    elsif p_old.status is distinct from p_new.status and p_new.status = 'published' then
      v_events := v_events || jsonb_build_array('document_published');
    elsif p_old.title is distinct from p_new.title
       or p_old.description is distinct from p_new.description
       or p_old.checksum is distinct from p_new.checksum then
      v_events := v_events || jsonb_build_array('document_updated');
    end if;
  end if;

  return v_events;
end;
$$;

create or replace function public.knowledge_document_version_audit_events(
  p_old public.knowledge_document_versions,
  p_new public.knowledge_document_versions,
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
    return jsonb_build_array('version_created');
  end if;

  if p_op = 'UPDATE' then
    if p_old.status is distinct from p_new.status and p_new.status = 'published' then
      v_events := v_events || jsonb_build_array('document_published', 'version_created');
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
      'version', coalesce(new.current_version_number, old.current_version_number),
      'status', coalesce(new.status, old.status),
      'checksum', coalesce(new.checksum, old.checksum)
    );
  elsif TG_TABLE_NAME = 'knowledge_document_versions' then
    v_events := public.knowledge_document_version_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'document_id', coalesce(new.document_id, old.document_id),
      'version_number', coalesce(new.version_number, old.version_number),
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
      'chunk_order', coalesce(new.chunk_order, new.chunk_index),
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

drop trigger if exists trg_audit_knowledge_document_versions on public.knowledge_document_versions;
create trigger trg_audit_knowledge_document_versions
  after insert or update or delete on public.knowledge_document_versions
  for each row execute procedure public.write_knowledge_audit_log();
