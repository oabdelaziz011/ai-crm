-- Tool execution payload visibility.
--
-- Root cause: migration 015 grants row visibility to every authenticated member
-- of the company. Table-level SELECT then exposes input and output, including
-- historical product prices stored before fail-closed masking.
--
-- REVOKE SELECT (input, output) is not sufficient while a table-level SELECT
-- grant remains, because PostgreSQL allows the column when either privilege exists.
-- This migration removes table-level SELECT from authenticated and anon, then
-- grants SELECT on the operational columns the employee surfaces already request.
--
-- The tool repository selects only the columns granted below. It returns the
-- payload it just wrote from memory, and calls read_own_tool_execution only when
-- loading an existing row. Shipping that repository before this migration is safe.
-- Applying this migration before that repository breaks any remaining select("*").
--
-- Realtime postgres_changes sends the WAL row and does not honor column grants.
-- tool_executions is not added to supabase_realtime here. Do not publish it
-- without a payload filter. Existing rows are not updated or deleted.
--
-- Does not modify migration 414 or the employee runtime price-disclosure flag.

revoke select on table public.tool_executions from authenticated, anon;

grant select (
  id,
  company_id,
  conversation_id,
  tool_definition_id,
  tool_key,
  status,
  error_code,
  error_message,
  started_at,
  completed_at,
  duration_ms,
  triggered_by,
  created_by
) on table public.tool_executions to authenticated;

create or replace function public.read_own_tool_execution(p_execution_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to public
as $$
  select to_jsonb(row)
  from public.tool_executions as row
  where row.id = p_execution_id
    and auth.uid() is not null
    and auth.role() = 'authenticated'
    and row.created_by = auth.uid()
    and (
      public.is_super_admin()
      or row.company_id = public.current_company_id()
    );
$$;

comment on function public.read_own_tool_execution(uuid) is
  'Returns one tool execution, including input and output, only to the authenticated user who created it. Not a service-role bypass for other employees.';

revoke all on function public.read_own_tool_execution(uuid) from public;
revoke all on function public.read_own_tool_execution(uuid) from anon;
grant execute on function public.read_own_tool_execution(uuid) to authenticated;

-- Authenticated updates are limited to the creator inside the current company.
-- No production caller updates another user's row. service_role bypasses RLS;
-- the trigger below also skips every non-authenticated role so webhook completion
-- keeps working. Super admin is not exempt: no caller needs that exception.
-- RLS does not freeze columns, and a table-level UPDATE grant cannot be narrowed
-- by revoking individual columns. Table UPDATE is revoked, then re-granted only
-- for the columns ToolRouterService writes after insert.

drop policy if exists tool_executions_update on public.tool_executions;
create policy tool_executions_update
  on public.tool_executions
  for update
  to authenticated
  using (
    created_by = auth.uid()
    and company_id = public.current_company_id()
  )
  with check (
    created_by = auth.uid()
    and company_id = public.current_company_id()
  );

revoke update on table public.tool_executions from authenticated, anon;
grant update (
  status,
  output,
  error_code,
  error_message,
  completed_at,
  duration_ms
) on table public.tool_executions to authenticated;

create or replace function public.tool_executions_freeze_identity()
returns trigger
language plpgsql
set search_path to public
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if auth.uid() is null or old.created_by is distinct from auth.uid() then
    raise exception 'tool_execution_owner_mismatch' using errcode = '42501';
  end if;

  if old.company_id is distinct from public.current_company_id() then
    raise exception 'tool_execution_company_mismatch' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.company_id is distinct from old.company_id
     or new.conversation_id is distinct from old.conversation_id
     or new.created_by is distinct from old.created_by
     or new.tool_key is distinct from old.tool_key
  then
    raise exception 'tool_execution_identity_frozen' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.tool_executions_freeze_identity() from public;
revoke all on function public.tool_executions_freeze_identity() from anon;
grant execute on function public.tool_executions_freeze_identity() to authenticated, service_role;

drop trigger if exists tool_executions_freeze_identity on public.tool_executions;
create trigger tool_executions_freeze_identity
  before update on public.tool_executions
  for each row
  execute function public.tool_executions_freeze_identity();
