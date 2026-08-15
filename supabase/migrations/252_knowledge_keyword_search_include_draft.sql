-- Allow keyword verify/search against freshly imported draft documents.
-- Import creates documents as draft; embedding/publish may not have run yet.
-- Production hybrid retrieval still prefers published/indexed via embedding pipeline.

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
    and d.status in ('draft', 'published', 'indexing', 'indexed')
    and c.search_vector @@ v_tsquery
    and (p_source_ids is null or d.source_id = any(p_source_ids))
    and (p_document_ids is null or c.document_id = any(p_document_ids))
  order by ts_rank(c.search_vector, v_tsquery) desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.knowledge_keyword_search(uuid, text, int, uuid[], uuid[]) to authenticated;
