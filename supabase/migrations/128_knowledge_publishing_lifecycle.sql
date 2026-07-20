-- ============================================================
-- Vault OS – Sprint A1-03: Knowledge publishing lifecycle
-- Extends document statuses and audit events for enterprise workflow.
-- ============================================================

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_status_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_status_check
  check (status in ('draft', 'published', 'indexing', 'indexed', 'archived'));

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

    if p_old.title is distinct from p_new.title
       or p_old.description is distinct from p_new.description
       or p_old.checksum is distinct from p_new.checksum then
      v_events := v_events || jsonb_build_array('document_updated');
    end if;
  end if;

  return v_events;
end;
$$;

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'knowledge.publish')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'knowledge.publish'
where r.role_type = 'DEFAULT'
  and r.template_key = 'admin'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );
