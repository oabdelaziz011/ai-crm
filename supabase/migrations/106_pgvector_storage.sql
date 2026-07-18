-- ============================================================
-- Vault OS – Increment 3: pgvector storage and similarity search
-- Adds physical vector persistence for the Vector Store Platform.
-- ============================================================

create extension if not exists vector with schema extensions;

create table if not exists public.pgvector_store_collections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  collection_name text not null,
  dimensions integer not null check (dimensions > 0 and dimensions <= 1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, collection_name)
);

drop trigger if exists pgvector_store_collections_updated_at on public.pgvector_store_collections;
create trigger pgvector_store_collections_updated_at
  before update on public.pgvector_store_collections
  for each row execute procedure public.set_updated_at();

create index if not exists idx_pgvector_store_collections_company
  on public.pgvector_store_collections(company_id, collection_name);

create table if not exists public.pgvector_store_vectors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  collection_name text not null,
  vector_id uuid not null,
  dimensions integer not null check (dimensions > 0 and dimensions <= 1536),
  embedding extensions.vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, collection_name, vector_id)
);

drop trigger if exists pgvector_store_vectors_updated_at on public.pgvector_store_vectors;
create trigger pgvector_store_vectors_updated_at
  before update on public.pgvector_store_vectors
  for each row execute procedure public.set_updated_at();

create index if not exists idx_pgvector_store_vectors_collection
  on public.pgvector_store_vectors(company_id, collection_name);

create index if not exists idx_pgvector_store_vectors_metadata
  on public.pgvector_store_vectors using gin (metadata);

create index if not exists idx_pgvector_store_vectors_embedding_hnsw
  on public.pgvector_store_vectors
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.pgvector_store_collections enable row level security;
alter table public.pgvector_store_vectors enable row level security;

drop policy if exists pgvector_store_collections_select on public.pgvector_store_collections;
create policy pgvector_store_collections_select
  on public.pgvector_store_collections for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists pgvector_store_collections_write on public.pgvector_store_collections;
create policy pgvector_store_collections_write
  on public.pgvector_store_collections for all
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  )
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists pgvector_store_vectors_select on public.pgvector_store_vectors;
create policy pgvector_store_vectors_select
  on public.pgvector_store_vectors for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists pgvector_store_vectors_write on public.pgvector_store_vectors;
create policy pgvector_store_vectors_write
  on public.pgvector_store_vectors for all
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  )
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

create or replace function public.pgvector_pad_embedding(
  p_vector double precision[],
  p_dimensions integer default 1536
)
returns extensions.vector(1536)
language plpgsql
immutable
as $$
declare
  v_result double precision[] := array_fill(0::double precision, array[p_dimensions]);
  v_index integer;
begin
  if coalesce(array_length(p_vector, 1), 0) = 0 then
    raise exception 'Vector must not be empty.';
  end if;

  if array_length(p_vector, 1) > p_dimensions then
    raise exception 'Vector dimensions (%) exceed maximum (%).', array_length(p_vector, 1), p_dimensions;
  end if;

  for v_index in 1..array_length(p_vector, 1) loop
    v_result[v_index] := p_vector[v_index];
  end loop;

  return v_result::extensions.vector(1536);
end;
$$;

create or replace function public.pgvector_create_collection(
  p_company_id uuid,
  p_collection_name text,
  p_dimensions integer,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.pgvector_store_collections (company_id, collection_name, dimensions, metadata)
  values (p_company_id, p_collection_name, p_dimensions, coalesce(p_metadata, '{}'::jsonb))
  on conflict (company_id, collection_name) do update
    set dimensions = excluded.dimensions,
        metadata = excluded.metadata,
        updated_at = now();

  return jsonb_build_object('collectionName', p_collection_name, 'dimensions', p_dimensions);
end;
$$;

create or replace function public.pgvector_delete_collection(
  p_company_id uuid,
  p_collection_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.pgvector_store_vectors
  where company_id = p_company_id and collection_name = p_collection_name;

  delete from public.pgvector_store_collections
  where company_id = p_company_id and collection_name = p_collection_name;

  return jsonb_build_object('collectionName', p_collection_name, 'deleted', true);
end;
$$;

create or replace function public.pgvector_upsert_vector(
  p_company_id uuid,
  p_collection_name text,
  p_vector_id uuid,
  p_vector double precision[],
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dimensions integer;
  v_row_id uuid;
begin
  select dimensions into v_dimensions
  from public.pgvector_store_collections
  where company_id = p_company_id and collection_name = p_collection_name;

  if v_dimensions is null then
    raise exception 'Collection % does not exist for company.', p_collection_name;
  end if;

  if coalesce(array_length(p_vector, 1), 0) <> v_dimensions then
    raise exception 'Vector dimensions (%) do not match collection dimensions (%).',
      coalesce(array_length(p_vector, 1), 0), v_dimensions;
  end if;

  insert into public.pgvector_store_vectors (
    company_id, collection_name, vector_id, dimensions, embedding, metadata
  )
  values (
    p_company_id,
    p_collection_name,
    p_vector_id,
    v_dimensions,
    public.pgvector_pad_embedding(p_vector, 1536),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (company_id, collection_name, vector_id) do update
    set dimensions = excluded.dimensions,
        embedding = excluded.embedding,
        metadata = excluded.metadata,
        updated_at = now()
  returning id into v_row_id;

  return jsonb_build_object('id', v_row_id, 'vectorId', p_vector_id, 'collectionName', p_collection_name);
end;
$$;

create or replace function public.pgvector_delete_vector(
  p_company_id uuid,
  p_collection_name text,
  p_vector_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.pgvector_store_vectors
  where company_id = p_company_id
    and collection_name = p_collection_name
    and vector_id = p_vector_id;

  return jsonb_build_object('collectionName', p_collection_name, 'vectorId', p_vector_id, 'deleted', true);
end;
$$;

create or replace function public.pgvector_collection_statistics(
  p_company_id uuid,
  p_collection_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_dimensions integer;
  v_count bigint;
begin
  select dimensions into v_dimensions
  from public.pgvector_store_collections
  where company_id = p_company_id and collection_name = p_collection_name;

  select count(*) into v_count
  from public.pgvector_store_vectors
  where company_id = p_company_id and collection_name = p_collection_name;

  return jsonb_build_object(
    'collectionName', p_collection_name,
    'vectorCount', coalesce(v_count, 0),
    'dimensions', coalesce(v_dimensions, 0)
  );
end;
$$;

create or replace function public.pgvector_similarity_search(
  p_company_id uuid,
  p_collection_name text,
  p_query_vector double precision[],
  p_top_k integer default 10,
  p_metadata_filter jsonb default '{}'::jsonb
)
returns table (vector_id uuid, provider_score double precision, metadata jsonb)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_query extensions.vector(1536);
begin
  v_query := public.pgvector_pad_embedding(p_query_vector, 1536);

  return query
  select
    v.vector_id,
    (1 - (v.embedding <=> v_query)) * 100 as provider_score,
    v.metadata
  from public.pgvector_store_vectors v
  where v.company_id = p_company_id
    and v.collection_name = p_collection_name
    and (
      coalesce(p_metadata_filter, '{}'::jsonb) = '{}'::jsonb
      or v.metadata @> p_metadata_filter
    )
  order by v.embedding <=> v_query
  limit greatest(p_top_k, 1);
end;
$$;

update public.vector_store_definitions
set
  supported_capabilities = '["create_collection","delete_collection","upsert_vector","delete_vector","collection_statistics","similarity_query","metadata_filter"]'::jsonb,
  version = '1.1.0',
  updated_at = now()
where key = 'pgvector';
