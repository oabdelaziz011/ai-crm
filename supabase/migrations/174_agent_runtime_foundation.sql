-- Sprint AI-Agents Foundation — Enterprise Agent Runtime tables

create table if not exists public.agent_workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  goal text not null,
  status text not null default 'planning'
    check (status in ('planning', 'running', 'paused', 'waiting_user', 'completed', 'failed', 'cancelled')),
  task_graph jsonb not null default '{}'::jsonb,
  memory jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  checkpoint_index integer not null default 0,
  error_message text,
  final_report text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

drop trigger if exists agent_workflows_updated_at on public.agent_workflows;
create trigger agent_workflows_updated_at
  before update on public.agent_workflows
  for each row execute procedure public.set_updated_at();

create index if not exists idx_agent_workflows_company
  on public.agent_workflows(company_id, created_at desc);

create index if not exists idx_agent_workflows_status
  on public.agent_workflows(status, created_at desc);

create table if not exists public.agent_workflow_checkpoints (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.agent_workflows(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  checkpoint_index integer not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_workflow_checkpoints_workflow
  on public.agent_workflow_checkpoints(workflow_id, checkpoint_index desc);

create table if not exists public.agent_workflow_events (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.agent_workflows(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null check (event_type in (
    'PlanningStarted', 'PlanningCompleted', 'TaskStarted', 'TaskCompleted',
    'TaskFailed', 'VerificationPassed', 'VerificationFailed', 'WorkflowCompleted',
    'WorkflowPaused', 'CheckpointSaved'
  )),
  task_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_workflow_events_workflow
  on public.agent_workflow_events(workflow_id, created_at asc);

alter table public.agent_workflows enable row level security;
alter table public.agent_workflow_checkpoints enable row level security;
alter table public.agent_workflow_events enable row level security;

drop policy if exists agent_workflows_select on public.agent_workflows;
create policy agent_workflows_select on public.agent_workflows for select using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists agent_workflows_write on public.agent_workflows;
create policy agent_workflows_write on public.agent_workflows for all using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or company_id = public.current_company_id())
) with check (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists agent_workflow_checkpoints_select on public.agent_workflow_checkpoints;
create policy agent_workflow_checkpoints_select on public.agent_workflow_checkpoints for select using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists agent_workflow_checkpoints_write on public.agent_workflow_checkpoints;
create policy agent_workflow_checkpoints_write on public.agent_workflow_checkpoints for all using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or company_id = public.current_company_id())
) with check (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists agent_workflow_events_select on public.agent_workflow_events;
create policy agent_workflow_events_select on public.agent_workflow_events for select using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists agent_workflow_events_write on public.agent_workflow_events;
create policy agent_workflow_events_write on public.agent_workflow_events for insert with check (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or company_id = public.current_company_id())
);

-- Ops RPC: list active agent workflows (super admin)
create or replace function public.platform_ai_ops_agent_workflows(p_limit int default 20)
returns table (
  id uuid,
  company_id uuid,
  company_name text,
  goal text,
  status text,
  progress numeric,
  task_count int,
  correlation_id text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    w.id,
    w.company_id,
    c.name,
    w.goal,
    w.status,
    coalesce((w.memory->>'executionState')::jsonb->>'progress', '0')::numeric,
    jsonb_array_length(coalesce(w.task_graph->'nodes', '[]'::jsonb))::int,
    w.correlation_id,
    w.created_at,
    w.updated_at
  from public.agent_workflows w
  join public.companies c on c.id = w.company_id
  order by w.updated_at desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.platform_ai_ops_agent_workflows(int) to authenticated;
