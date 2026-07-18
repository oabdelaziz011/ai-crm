-- Validate company create → delete audit trail (run after migration 110)
-- Usage: supabase db query --linked -f scripts/audit-company-delete-validation.sql

do $$
declare
  v_company_id uuid;
  v_create_audit_id uuid;
  v_delete_audit_id uuid;
begin
  insert into public.companies (name, status, subscription_plan)
  values ('Audit Delete Test Co', 'Trial', 'Basic')
  returning id into v_company_id;

  select id into v_create_audit_id
  from public.audit_logs
  where entity = 'companies'
    and entity_id = v_company_id::text
    and action = 'CREATE'
  order by created_at desc
  limit 1;

  if v_create_audit_id is null then
    raise exception 'Expected CREATE audit row for company %', v_company_id;
  end if;

  delete from public.companies where id = v_company_id;

  if exists (select 1 from public.companies where id = v_company_id) then
    raise exception 'Company % was not deleted', v_company_id;
  end if;

  select id into v_delete_audit_id
  from public.audit_logs
  where entity = 'companies'
    and entity_id = v_company_id::text
    and action = 'DELETE'
  order by created_at desc
  limit 1;

  if v_delete_audit_id is null then
    raise exception 'Expected DELETE audit row for company %', v_company_id;
  end if;

  if exists (
    select 1
    from public.audit_logs
    where id = v_delete_audit_id
      and company_id is not null
  ) then
    raise exception 'DELETE audit row must have NULL company_id (got %)', (
      select company_id from public.audit_logs where id = v_delete_audit_id
    );
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where id = v_delete_audit_id
      and metadata->>'company_id' = v_company_id::text
  ) then
    raise exception 'DELETE audit metadata must include company_id %', v_company_id;
  end if;

  raise notice 'PASS: company % create/delete audit OK (create=%, delete=%)',
    v_company_id, v_create_audit_id, v_delete_audit_id;
end $$;
