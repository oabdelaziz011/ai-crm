-- Sprint 6.2.1: agents.manage enforcement for administrative agent operations.

drop policy if exists agent_workflows_delete on public.agent_workflows;
create policy agent_workflows_delete on public.agent_workflows for delete using (
  public.company_has_permission(company_id, 'agents.manage')
);

comment on policy agent_workflows_delete on public.agent_workflows is
  'Agent workflow deletes require agents.manage (Sprint 6.2.1).';
