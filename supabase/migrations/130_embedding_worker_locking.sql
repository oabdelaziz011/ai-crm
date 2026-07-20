-- ============================================================
-- Vault OS – Sprint A1-05: Embedding worker locking + audit
-- Atomic job claims for multi-worker safety.
-- ============================================================

alter table public.embedding_jobs
  add column if not exists locked_by text,
  add column if not exists locked_at timestamptz;

create index if not exists idx_embedding_jobs_running_locked
  on public.embedding_jobs(company_id, locked_at)
  where status = 'running';

create or replace function public.claim_embedding_jobs(
  p_company_id uuid,
  p_limit integer,
  p_worker_id text default null
)
returns setof public.embedding_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.embedding_jobs j
  set
    status = 'running',
    started_at = coalesce(j.started_at, now()),
    locked_by = p_worker_id,
    locked_at = now(),
    updated_at = now()
  where j.id in (
    select candidate.id
    from public.embedding_jobs candidate
    where candidate.company_id = p_company_id
      and candidate.status = 'queued'
    order by candidate.queued_at asc
    for update skip locked
    limit greatest(p_limit, 0)
  )
  returning j.*;
end;
$$;

create or replace function public.recover_stale_embedding_jobs(
  p_stale_seconds integer default 900
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.embedding_jobs
  set
    status = 'queued',
    locked_by = null,
    locked_at = null,
    started_at = null,
    updated_at = now()
  where status = 'running'
    and locked_at is not null
    and locked_at < now() - make_interval(secs => greatest(p_stale_seconds, 60));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
    if p_old.status is distinct from p_new.status then
      if p_new.status = 'running' and p_old.status = 'queued' then
        v_events := v_events || jsonb_build_array('embedding_job_claimed');
      elsif p_new.status = 'completed' then
        v_events := v_events || jsonb_build_array('embedding_job_completed');
      elsif p_new.status = 'failed' then
        v_events := v_events || jsonb_build_array('embedding_failed');
      elsif p_new.status = 'queued' and p_old.status in ('failed', 'running') then
        v_events := v_events || jsonb_build_array('embedding_job_retry');
      end if;
    end if;
  end if;

  return v_events;
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
  v_old_embedding_status text;
  v_new_embedding_status text;
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('document_imported');
  end if;

  if p_op = 'UPDATE' then
    v_old_embedding_status := coalesce(p_old.metadata->'publishing'->>'embedding_status', '');
    v_new_embedding_status := coalesce(p_new.metadata->'publishing'->>'embedding_status', '');

    if p_old.status is distinct from p_new.status then
      if p_new.status = 'archived' then
        v_events := v_events || jsonb_build_array('document_archived');
      elsif p_new.status = 'published' then
        v_events := v_events || jsonb_build_array('document_published');
      elsif p_new.status = 'indexing' then
        v_events := v_events || jsonb_build_array('document_indexing');
      elsif p_new.status = 'indexed' then
        v_events := v_events || jsonb_build_array('document_indexed');
      elsif p_old.status = 'archived' and p_new.status <> 'archived' then
        v_events := v_events || jsonb_build_array('document_restored');
      end if;
    end if;

    if v_new_embedding_status = 'processing'
       and v_old_embedding_status is distinct from 'processing' then
      v_events := v_events || jsonb_build_array('embedding_worker_started');
    end if;

    if v_new_embedding_status = 'completed'
       and v_old_embedding_status is distinct from 'completed' then
      v_events := v_events || jsonb_build_array('embedding_indexing_completed');
    end if;

    if v_new_embedding_status = 'failed'
       and v_old_embedding_status is distinct from 'failed' then
      v_events := v_events || jsonb_build_array('embedding_indexing_failed');
    end if;

    if v_new_embedding_status = 'queued'
       and v_old_embedding_status is distinct from 'queued' then
      v_events := v_events || jsonb_build_array('embedding_queue_completed');
    end if;

    if coalesce(p_new.metadata->'publishing'->'queue'->>'started_at', '')
       is distinct from coalesce(p_old.metadata->'publishing'->'queue'->>'started_at', '')
       and coalesce(p_new.metadata->'publishing'->'queue'->>'started_at', '') <> '' then
      v_events := v_events || jsonb_build_array('embedding_queue_started');
    end if;

    if coalesce(p_new.metadata->'publishing'->'queue'->>'jobs_created', '0')::int
       > coalesce(p_old.metadata->'publishing'->'queue'->>'jobs_created', '0')::int then
      v_events := v_events || jsonb_build_array('embedding_jobs_created');
    end if;

    if coalesce(p_new.metadata->'publishing'->'queue'->>'jobs_skipped', '0')::int
       > coalesce(p_old.metadata->'publishing'->'queue'->>'jobs_skipped', '0')::int then
      v_events := v_events || jsonb_build_array('embedding_jobs_skipped');
    end if;

    if coalesce(p_new.metadata->'publishing'->'queue'->>'jobs_duplicate', '0')::int
       > coalesce(p_old.metadata->'publishing'->'queue'->>'jobs_duplicate', '0')::int then
      v_events := v_events || jsonb_build_array('embedding_queue_duplicate_prevented');
    end if;

    if p_old.title is distinct from p_new.title
       or p_old.description is distinct from p_new.description
       or p_old.checksum is distinct from p_new.checksum then
      v_events := v_events || jsonb_build_array('document_updated');
    end if;
  end if;

  return v_events;
end;
$$;

grant execute on function public.claim_embedding_jobs(uuid, integer, text) to service_role;
grant execute on function public.recover_stale_embedding_jobs(integer) to service_role;
