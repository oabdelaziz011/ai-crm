-- Sprint 6.2.4: Enforce ai_agents feature flag in agent table RLS (closes validation I-1).

create or replace function public.company_has_agents_access(
  p_company_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.company_has_permission(p_company_id, p_permission)
    and public.platform_ai_feature_enabled(p_company_id, 'ai_agents');
$$;

comment on function public.company_has_agents_access(uuid, text) is
  'Agents RLS gate: requires RBAC permission and ai_agents feature enabled. Super-admin bypass via company_has_permission and platform_ai_feature_enabled (Sprint 6.2.4).';

grant execute on function public.company_has_agents_access(uuid, text) to authenticated;

drop policy if exists agent_workflows_select on public.agent_workflows;
create policy agent_workflows_select on public.agent_workflows for select using (
  public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists agent_workflows_insert on public.agent_workflows;
create policy agent_workflows_insert on public.agent_workflows for insert with check (
  public.company_has_agents_access(company_id, 'agents.execute')
);

drop policy if exists agent_workflows_update on public.agent_workflows;
create policy agent_workflows_update on public.agent_workflows for update using (
  public.company_has_agents_access(company_id, 'agents.execute')
) with check (
  public.company_has_agents_access(company_id, 'agents.execute')
);

drop policy if exists agent_workflows_delete on public.agent_workflows;
create policy agent_workflows_delete on public.agent_workflows for delete using (
  public.company_has_agents_access(company_id, 'agents.manage')
);

drop policy if exists agent_workflow_checkpoints_select on public.agent_workflow_checkpoints;
create policy agent_workflow_checkpoints_select on public.agent_workflow_checkpoints for select using (
  public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists agent_workflow_checkpoints_insert on public.agent_workflow_checkpoints;
create policy agent_workflow_checkpoints_insert on public.agent_workflow_checkpoints for insert with check (
  public.company_has_agents_access(company_id, 'agents.execute')
);

drop policy if exists agent_workflow_events_select on public.agent_workflow_events;
create policy agent_workflow_events_select on public.agent_workflow_events for select using (
  public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists agent_workflow_events_insert on public.agent_workflow_events;
create policy agent_workflow_events_insert on public.agent_workflow_events for insert with check (
  public.company_has_agents_access(company_id, 'agents.execute')
);

comment on policy agent_workflows_select on public.agent_workflows is
  'Agent workflow reads require agents.view and ai_agents feature (Sprint 6.2.4).';
comment on policy agent_workflows_insert on public.agent_workflows is
  'Agent workflow writes require agents.execute and ai_agents feature (Sprint 6.2.4).';
comment on policy agent_workflows_update on public.agent_workflows is
  'Agent workflow updates require agents.execute and ai_agents feature (Sprint 6.2.4).';
comment on policy agent_workflows_delete on public.agent_workflows is
  'Agent workflow deletes require agents.manage and ai_agents feature (Sprint 6.2.4).';
comment on policy agent_workflow_checkpoints_select on public.agent_workflow_checkpoints is
  'Checkpoint reads require agents.view and ai_agents feature (Sprint 6.2.4).';
comment on policy agent_workflow_checkpoints_insert on public.agent_workflow_checkpoints is
  'Checkpoint writes require agents.execute and ai_agents feature (Sprint 6.2.4).';
comment on policy agent_workflow_events_select on public.agent_workflow_events is
  'Event reads require agents.view and ai_agents feature (Sprint 6.2.4).';
comment on policy agent_workflow_events_insert on public.agent_workflow_events is
  'Event writes require agents.execute and ai_agents feature (Sprint 6.2.4).';
