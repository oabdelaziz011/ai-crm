-- ============================================================
-- Vault OS – Sprint A1-04: Knowledge embedding queue pipeline
-- Duplicate prevention + audit events for queue lifecycle.
-- ============================================================

create unique index if not exists idx_embedding_jobs_active_chunk_version
  on public.embedding_jobs (knowledge_chunk_id, embedding_version, connection_id)
  where status in ('queued', 'running');

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
