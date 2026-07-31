-- Sprint 6.3.5 — Workflow execution lease for single-runner recovery

alter table public.agent_workflows
  add column if not exists execution_lease_holder text,
  add column if not exists execution_lease_expires_at timestamptz;

create index if not exists idx_agent_workflows_execution_lease
  on public.agent_workflows(id, execution_lease_expires_at)
  where execution_lease_holder is not null;

create or replace function public.try_acquire_agent_workflow_execution_lease(
  p_workflow_id uuid,
  p_holder text,
  p_ttl_seconds integer default 120
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if p_holder is null or length(trim(p_holder)) = 0 then
    return false;
  end if;

  update public.agent_workflows
  set
    execution_lease_holder = p_holder,
    execution_lease_expires_at = now() + make_interval(secs => greatest(p_ttl_seconds, 1))
  where id = p_workflow_id
    and (
      execution_lease_holder is null
      or execution_lease_expires_at is null
      or execution_lease_expires_at < now()
      or execution_lease_holder = p_holder
    );

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.release_agent_workflow_execution_lease(
  p_workflow_id uuid,
  p_holder text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.agent_workflows
  set
    execution_lease_holder = null,
    execution_lease_expires_at = null
  where id = p_workflow_id
    and execution_lease_holder = p_holder;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.renew_agent_workflow_execution_lease(
  p_workflow_id uuid,
  p_holder text,
  p_ttl_seconds integer default 120
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.agent_workflows
  set execution_lease_expires_at = now() + make_interval(secs => greatest(p_ttl_seconds, 1))
  where id = p_workflow_id
    and execution_lease_holder = p_holder;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

comment on function public.try_acquire_agent_workflow_execution_lease(uuid, text, integer) is
  'Atomically acquire a workflow execution lease for single-runner agent recovery (Sprint 6.3.5).';
comment on function public.release_agent_workflow_execution_lease(uuid, text) is
  'Release a workflow execution lease when held by the given holder (Sprint 6.3.5).';
comment on function public.renew_agent_workflow_execution_lease(uuid, text, integer) is
  'Extend a held workflow execution lease TTL during long-running execution (Sprint 6.3.5).';
