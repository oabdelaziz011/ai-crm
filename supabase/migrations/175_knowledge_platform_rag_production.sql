-- ============================================================
-- Sprint Knowledge-Platform-2: Production Enterprise RAG
-- FTS, hybrid search, indexing progress, ops observability
-- ============================================================

-- ── Full-text search on knowledge_chunks ─────────────────────

alter table public.knowledge_chunks
  add column if not exists search_vector tsvector;

create or replace function public.knowledge_chunks_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.content, '')), 'A');
  return new;
end;
$$;

drop trigger if exists trg_knowledge_chunks_search_vector on public.knowledge_chunks;
create trigger trg_knowledge_chunks_search_vector
  before insert or update of content on public.knowledge_chunks
  for each row execute function public.knowledge_chunks_search_vector_update();

-- Backfill existing rows
update public.knowledge_chunks
set search_vector = setweight(to_tsvector('english', coalesce(content, '')), 'A')
where search_vector is null and deleted_at is null;

create index if not exists idx_knowledge_chunks_fts
  on public.knowledge_chunks using gin (search_vector)
  where deleted_at is null;

-- ── Embedding job progress + cancellation ────────────────────

alter table public.embedding_jobs
  add column if not exists progress_pct numeric(5, 2) not null default 0
    check (progress_pct >= 0 and progress_pct <= 100);

alter table public.embedding_jobs
  add column if not exists cancelled_at timestamptz;

alter table public.embedding_jobs
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

create index if not exists idx_embedding_jobs_cancelled
  on public.embedding_jobs(company_id, cancelled_at)
  where cancelled_at is not null;

-- ── Keyword search RPC (FTS) ─────────────────────────────────

create or replace function public.knowledge_keyword_search(
  p_company_id uuid,
  p_query text,
  p_limit int default 20,
  p_source_ids uuid[] default null,
  p_document_ids uuid[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  source_id uuid,
  document_title text,
  section_title text,
  content text,
  rank real,
  page_number int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_tsquery tsquery;
begin
  if auth.role() <> 'service_role'
     and not public.is_super_admin()
     and p_company_id is distinct from public.current_company_id() then
    raise exception 'Tenant isolation violation';
  end if;

  v_tsquery := plainto_tsquery('english', coalesce(p_query, ''));
  if v_tsquery is null then
    return;
  end if;

  return query
  select
    c.id,
    c.document_id,
    d.source_id,
    d.title,
    coalesce(s.title, ''),
    c.content,
    ts_rank(c.search_vector, v_tsquery)::real,
    coalesce((c.metadata->>'page_number')::int, (s.metadata->>'page_number')::int, null)
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id and d.deleted_at is null
  left join public.knowledge_sections s on s.id = c.section_id
  where c.company_id = p_company_id
    and c.deleted_at is null
    and d.status in ('published', 'indexing', 'indexed')
    and c.search_vector @@ v_tsquery
    and (p_source_ids is null or d.source_id = any(p_source_ids))
    and (p_document_ids is null or c.document_id = any(p_document_ids))
  order by ts_rank(c.search_vector, v_tsquery) desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.knowledge_keyword_search(uuid, text, int, uuid[], uuid[]) to authenticated;

-- ── Cancel embedding job ─────────────────────────────────────

create or replace function public.cancel_embedding_job(p_job_id uuid)
returns public.embedding_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.embedding_jobs;
begin
  select * into v_job from public.embedding_jobs where id = p_job_id;
  if not found then
    raise exception 'Embedding job not found';
  end if;

  if not public.is_super_admin() and v_job.company_id is distinct from public.current_company_id() then
    raise exception 'Tenant isolation violation';
  end if;

  if v_job.status not in ('queued', 'running') then
    return v_job;
  end if;

  update public.embedding_jobs
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    progress_pct = 0
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

grant execute on function public.cancel_embedding_job(uuid) to authenticated;

-- ── Platform ops: knowledge summary ──────────────────────────

create or replace function public.platform_ai_ops_knowledge_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
  perform public.platform_ai_ops_assert_super_admin();

  select jsonb_build_object(
    'documents_total', (select count(*)::int from public.knowledge_documents where deleted_at is null),
    'documents_indexed', (select count(*)::int from public.knowledge_documents where deleted_at is null and status = 'indexed'),
    'documents_indexing', (select count(*)::int from public.knowledge_documents where deleted_at is null and status = 'indexing'),
    'chunks_total', (select count(*)::int from public.knowledge_chunks where deleted_at is null),
    'embeddings_active', (select count(*)::int from public.knowledge_embeddings where is_active = true and status = 'active'),
    'jobs_queued', (select count(*)::int from public.embedding_jobs where status = 'queued'),
    'jobs_running', (select count(*)::int from public.embedding_jobs where status = 'running'),
    'jobs_failed', (select count(*)::int from public.embedding_jobs where status = 'failed' and queued_at > now() - interval '7 days'),
    'avg_indexing_latency_ms', coalesce((
      select round(avg(extract(epoch from (completed_at - started_at)) * 1000))::int
      from public.embedding_jobs
      where status = 'completed' and started_at is not null and completed_at > now() - interval '7 days'
    ), 0)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.platform_ai_ops_knowledge_summary() to authenticated;

-- ── Platform ops: embedding job feed ─────────────────────────

create or replace function public.platform_ai_ops_embedding_jobs(p_limit int default 30)
returns table (
  id uuid,
  company_id uuid,
  company_name text,
  document_title text,
  status text,
  progress_pct numeric,
  retry_count int,
  error_message text,
  provider text,
  model text,
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    j.id,
    j.company_id,
    c.name,
    coalesce(d.title, j.metadata->>'documentId', '—'),
    j.status,
    j.progress_pct,
    j.retry_count,
    j.error_message,
    j.provider,
    j.model,
    j.queued_at,
    j.started_at,
    j.completed_at
  from public.embedding_jobs j
  join public.companies c on c.id = j.company_id
  left join public.knowledge_documents d on d.id = (j.metadata->>'documentId')::uuid
  order by j.queued_at desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.platform_ai_ops_embedding_jobs(int) to authenticated;

-- ── Platform ops: knowledge document feed ────────────────────

create or replace function public.platform_ai_ops_knowledge_documents(p_limit int default 30)
returns table (
  id uuid,
  company_id uuid,
  company_name text,
  title text,
  status text,
  mime_type text,
  chunk_count bigint,
  embedding_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    d.id,
    d.company_id,
    c.name,
    d.title,
    d.status,
    d.mime_type,
    (select count(*) from public.knowledge_chunks k where k.document_id = d.id and k.deleted_at is null),
    coalesce(d.metadata->'publishing'->>'embedding_status', 'unknown'),
    d.updated_at
  from public.knowledge_documents d
  join public.companies c on c.id = d.company_id
  where d.deleted_at is null
  order by d.updated_at desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.platform_ai_ops_knowledge_documents(int) to authenticated;
