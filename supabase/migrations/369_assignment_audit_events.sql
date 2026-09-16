/**
 * Migration 369 — Assignment audit events (Phase 5 + Phase 5.1 hardening).
 *
 * Append-only assignment history across conversations, tickets, leads, and tasks.
 * Does NOT change assignment governance, AI routing, or employee department architecture.
 *
 * Phase 5.1 security boundary:
 * - Authenticated clients: SELECT only (company-scoped). No direct INSERT/UPDATE/DELETE.
 * - Writes only via public.record_assignment_audit_event (SECURITY DEFINER) with validation,
 *   or service_role direct INSERT (trusted server paths).
 * - Immutability trigger blocks UPDATE/DELETE for all roles.
 */

create table if not exists public.assignment_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  resource_type text not null check (
    resource_type in ('conversation', 'email_conversation', 'ticket', 'lead', 'task')
  ),
  resource_id text not null,
  previous_assignee_user_id uuid references auth.users(id) on delete set null,
  new_assignee_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('assigned', 'reassigned', 'unassigned')),
  source text not null check (source in ('human', 'handoff', 'ai', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_assignment_audit_company_resource
  on public.assignment_audit_events(company_id, resource_type, resource_id);

create index if not exists idx_assignment_audit_company_created
  on public.assignment_audit_events(company_id, created_at desc);

create index if not exists idx_assignment_audit_company_actor
  on public.assignment_audit_events(company_id, actor_user_id);

alter table public.assignment_audit_events enable row level security;

-- Read: company-scoped SELECT only.
drop policy if exists assignment_audit_events_select on public.assignment_audit_events;
create policy assignment_audit_events_select on public.assignment_audit_events
  for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

-- Remove any Phase-5 authenticated INSERT policy (fabrication vector).
drop policy if exists assignment_audit_events_insert on public.assignment_audit_events;

-- Trusted server (service_role) may INSERT directly; still subject to immutability trigger on UPDATE/DELETE.
create policy assignment_audit_events_service_insert on public.assignment_audit_events
  for insert
  with check (auth.role() = 'service_role');

-- No UPDATE / DELETE policies for authenticated or service_role under RLS.
-- service_role bypasses RLS by default in PostgREST; immutability trigger still blocks mutation.

revoke all on table public.assignment_audit_events from anon;
revoke insert, update, delete on table public.assignment_audit_events from authenticated;
grant select on table public.assignment_audit_events to authenticated;
grant select, insert on table public.assignment_audit_events to service_role;

create or replace function public.assignment_audit_events_prevent_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'assignment_audit_events is append-only';
end;
$$;

drop trigger if exists assignment_audit_events_no_update on public.assignment_audit_events;
create trigger assignment_audit_events_no_update
  before update on public.assignment_audit_events
  for each row
  execute function public.assignment_audit_events_prevent_mutation();

drop trigger if exists assignment_audit_events_no_delete on public.assignment_audit_events;
create trigger assignment_audit_events_no_delete
  before delete on public.assignment_audit_events
  for each row
  execute function public.assignment_audit_events_prevent_mutation();

revoke all on function public.assignment_audit_events_prevent_mutation() from public;
revoke all on function public.assignment_audit_events_prevent_mutation() from anon;
revoke all on function public.assignment_audit_events_prevent_mutation() from authenticated;

/**
 * Trusted write path for assignment audit events.
 *
 * Authenticated callers:
 *   - may only write source in (human, handoff)
 *   - actor_user_id is forced to auth.uid() (spoofing impossible)
 *   - company_id must match current_company_id() unless super_admin
 *
 * service_role callers:
 *   - may write human | handoff | ai | system
 *   - actor_user_id may be provided (nullable for system)
 *
 * Always validates: enums, action/old/new consistency, resource company scope, assignee company scope.
 */
create or replace function public.record_assignment_audit_event(
  p_company_id uuid,
  p_resource_type text,
  p_resource_id text,
  p_previous_assignee_user_id uuid,
  p_new_assignee_user_id uuid,
  p_action text,
  p_source text,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.assignment_audit_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := (auth.role() = 'service_role');
  v_actor uuid;
  v_resource_ok boolean := false;
  v_row public.assignment_audit_events;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if p_resource_type is null
     or p_resource_type not in ('conversation', 'email_conversation', 'ticket', 'lead', 'task') then
    raise exception 'invalid resource_type';
  end if;

  if nullif(btrim(coalesce(p_resource_id, '')), '') is null then
    raise exception 'resource_id is required';
  end if;

  if p_action is null or p_action not in ('assigned', 'reassigned', 'unassigned') then
    raise exception 'invalid action';
  end if;

  if p_source is null or p_source not in ('human', 'handoff', 'ai', 'system') then
    raise exception 'invalid source';
  end if;

  -- Action / assignee consistency (same-assignee must not reach this function).
  if p_action = 'assigned' then
    if p_previous_assignee_user_id is not null or p_new_assignee_user_id is null then
      raise exception 'invalid assignee combination for assigned';
    end if;
  elsif p_action = 'reassigned' then
    if p_previous_assignee_user_id is null
       or p_new_assignee_user_id is null
       or p_previous_assignee_user_id = p_new_assignee_user_id then
      raise exception 'invalid assignee combination for reassigned';
    end if;
  elsif p_action = 'unassigned' then
    if p_previous_assignee_user_id is null or p_new_assignee_user_id is not null then
      raise exception 'invalid assignee combination for unassigned';
    end if;
  end if;

  if not v_is_service then
    if auth.uid() is null or auth.role() <> 'authenticated' then
      raise exception 'Not authenticated';
    end if;
    if p_source not in ('human', 'handoff') then
      raise exception 'Authenticated clients may only record human or handoff assignment audit events';
    end if;
    if not public.is_super_admin()
       and p_company_id is distinct from public.current_company_id() then
      raise exception 'Cross-company assignment audit is not allowed';
    end if;
    -- Actor integrity: never trust client-supplied actor for human/handoff.
    v_actor := auth.uid();
  else
    v_actor := p_actor_user_id;
  end if;

  -- Resource integrity: must exist in the claimed company.
  if p_resource_type in ('conversation', 'email_conversation') then
    select exists (
      select 1
      from public.conversations c
      where c.id::text = p_resource_id
        and c.company_id = p_company_id
        and c.deleted_at is null
        and (
          p_resource_type = 'conversation'
          or c.channel_type = 'email'
        )
    ) into v_resource_ok;
  elsif p_resource_type = 'ticket' then
    select exists (
      select 1
      from public.support_tickets t
      where t.id::text = p_resource_id
        and t.company_id = p_company_id
        and t.deleted_at is null
    ) into v_resource_ok;
  elsif p_resource_type = 'lead' then
    select exists (
      select 1
      from public.leads l
      where l.id::text = p_resource_id
        and l.company_id = p_company_id
        and l.deleted_at is null
    ) into v_resource_ok;
  elsif p_resource_type = 'task' then
    select exists (
      select 1
      from public.tasks tk
      where tk.id::text = p_resource_id
        and tk.company_id = p_company_id
        and tk.deleted_at is null
    ) into v_resource_ok;
  end if;

  if not coalesce(v_resource_ok, false) then
    raise exception 'Assignment audit resource not found for company';
  end if;

  -- Assignee integrity: non-null assignees must belong to the same company.
  if p_previous_assignee_user_id is not null then
    if not exists (
      select 1
      from public.profiles p
      where p.id = p_previous_assignee_user_id
        and p.company_id = p_company_id
    ) then
      raise exception 'previous_assignee_user_id is not in company scope';
    end if;
  end if;

  if p_new_assignee_user_id is not null then
    if not exists (
      select 1
      from public.profiles p
      where p.id = p_new_assignee_user_id
        and p.company_id = p_company_id
    ) then
      raise exception 'new_assignee_user_id is not in company scope';
    end if;
  end if;

  insert into public.assignment_audit_events (
    company_id,
    actor_user_id,
    resource_type,
    resource_id,
    previous_assignee_user_id,
    new_assignee_user_id,
    action,
    source,
    metadata
  ) values (
    p_company_id,
    v_actor,
    p_resource_type,
    btrim(p_resource_id),
    p_previous_assignee_user_id,
    p_new_assignee_user_id,
    p_action,
    p_source,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.record_assignment_audit_event(
  uuid, text, text, uuid, uuid, text, text, uuid, jsonb
) from public;
revoke all on function public.record_assignment_audit_event(
  uuid, text, text, uuid, uuid, text, text, uuid, jsonb
) from anon;
grant execute on function public.record_assignment_audit_event(
  uuid, text, text, uuid, uuid, text, text, uuid, jsonb
) to authenticated, service_role;

comment on table public.assignment_audit_events is
  'Append-only assignment audit trail. Client INSERT denied; writes via record_assignment_audit_event or service_role.';

comment on function public.record_assignment_audit_event(
  uuid, text, text, uuid, uuid, text, text, uuid, jsonb
) is
  'SECURITY DEFINER assignment audit writer. Forces auth.uid() actor for human/handoff; validates company/resource/assignees/action/source.';
