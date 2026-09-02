-- Soft-delete / restore RPCs: SELECT policy (deleted_at IS NULL) blocks direct UPDATE
-- that sets deleted_at. SECURITY DEFINER functions enforce permission then mutate.

create or replace function public.archive_ai_employee(
  p_employee_id uuid,
  p_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, internal
as $$
begin
  if p_employee_id is null or p_company_id is null then
    raise exception 'employee_id and company_id are required';
  end if;

  if not internal.company_has_agents_access(p_company_id, 'agents.delete') then
    raise exception 'permission denied for agents.delete';
  end if;

  update public.ai_employees
  set
    status = 'archived',
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_employee_id
    and company_id = p_company_id
    and deleted_at is null
    and status <> 'published';

  if not found then
    raise exception 'AI employee not found or cannot be archived';
  end if;
end;
$$;

create or replace function public.restore_ai_employee(
  p_employee_id uuid,
  p_company_id uuid
)
returns public.ai_employees
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_row public.ai_employees;
begin
  if p_employee_id is null or p_company_id is null then
    raise exception 'employee_id and company_id are required';
  end if;

  if not internal.company_has_agents_access(p_company_id, 'agents.edit') then
    raise exception 'permission denied for agents.edit';
  end if;

  update public.ai_employees
  set
    deleted_at = null,
    status = 'draft',
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_employee_id
    and company_id = p_company_id
    and status = 'archived'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Archived AI employee not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.archive_ai_employee(uuid, uuid) from public;
revoke all on function public.restore_ai_employee(uuid, uuid) from public;
grant execute on function public.archive_ai_employee(uuid, uuid) to authenticated, service_role;
grant execute on function public.restore_ai_employee(uuid, uuid) to authenticated, service_role;

comment on function public.archive_ai_employee(uuid, uuid) is
  'Soft-delete AI employee (status=archived, deleted_at set). Requires agents.delete.';
comment on function public.restore_ai_employee(uuid, uuid) is
  'Restore archived AI employee to draft. Requires agents.edit.';
