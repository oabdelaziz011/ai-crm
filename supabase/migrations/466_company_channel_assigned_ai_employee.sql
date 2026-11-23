-- Local Meta self-serve: explicit AI Employee assignment for Messenger/Instagram channels.
-- Nullable; never auto-set on OAuth complete. WhatsApp continues to use tag-fallback only.

alter table public.company_channels
  add column if not exists assigned_ai_employee_id uuid
    references public.ai_employees(id) on delete set null;

create index if not exists idx_company_channels_assigned_ai_employee
  on public.company_channels(assigned_ai_employee_id)
  where assigned_ai_employee_id is not null and deleted_at is null;

comment on column public.company_channels.assigned_ai_employee_id is
  'Explicit AI Employee for Messenger/Instagram inbound. Null = soft-skip AI for those channels. WhatsApp ignores this column.';

create or replace function public.enforce_company_channel_assigned_ai_same_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_company uuid;
begin
  if new.assigned_ai_employee_id is null then
    return new;
  end if;

  select company_id into employee_company
  from public.ai_employees
  where id = new.assigned_ai_employee_id
    and deleted_at is null;

  if employee_company is null then
    raise exception 'assigned_ai_employee_id % not found', new.assigned_ai_employee_id
      using errcode = '23503';
  end if;

  if employee_company is distinct from new.company_id then
    raise exception 'assigned_ai_employee_id must belong to the same company as the channel'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists company_channels_assigned_ai_same_company on public.company_channels;
create trigger company_channels_assigned_ai_same_company
  before insert or update of assigned_ai_employee_id, company_id
  on public.company_channels
  for each row
  execute procedure public.enforce_company_channel_assigned_ai_same_company();

-- Service-role + authenticated helpers for get/set/clear (company-scoped).
create or replace function public.get_company_channel_ai_assignment(
  p_company_id uuid,
  p_company_channel_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_channels;
begin
  if auth.role() not in ('service_role', 'authenticated') then
    raise exception 'Forbidden';
  end if;

  if auth.role() = 'authenticated'
     and not public.has_company_permission(p_company_id, 'channels.view')
     and not public.has_company_permission(p_company_id, 'settings.edit') then
    raise exception 'Forbidden';
  end if;

  select * into row
  from public.company_channels
  where id = p_company_channel_id
    and company_id = p_company_id
    and deleted_at is null;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'companyChannelId', row.id,
    'companyId', row.company_id,
    'assignedAiEmployeeId', row.assigned_ai_employee_id
  );
end;
$$;

create or replace function public.set_company_channel_ai_assignment(
  p_company_id uuid,
  p_company_channel_id uuid,
  p_assigned_ai_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_channels;
begin
  if auth.role() not in ('service_role', 'authenticated') then
    raise exception 'Forbidden';
  end if;

  if auth.role() = 'authenticated'
     and not public.has_company_permission(p_company_id, 'channels.manage')
     and not public.has_company_permission(p_company_id, 'settings.edit') then
    raise exception 'Forbidden';
  end if;

  update public.company_channels
  set
    assigned_ai_employee_id = p_assigned_ai_employee_id,
    updated_at = now()
  where id = p_company_channel_id
    and company_id = p_company_id
    and deleted_at is null
  returning * into row;

  if not found then
    raise exception 'company channel not found';
  end if;

  return jsonb_build_object(
    'companyChannelId', row.id,
    'companyId', row.company_id,
    'assignedAiEmployeeId', row.assigned_ai_employee_id
  );
end;
$$;

revoke all on function public.get_company_channel_ai_assignment(uuid, uuid) from public;
revoke all on function public.set_company_channel_ai_assignment(uuid, uuid, uuid) from public;
grant execute on function public.get_company_channel_ai_assignment(uuid, uuid) to service_role, authenticated;
grant execute on function public.set_company_channel_ai_assignment(uuid, uuid, uuid) to service_role, authenticated;
