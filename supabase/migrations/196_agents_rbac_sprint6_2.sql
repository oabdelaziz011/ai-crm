-- Sprint 6.2: AI Agents product permissions and RLS alignment.

insert into public.permissions (code, category, module, action, description)
values
  ('agents.view', 'Agents', 'Agents', 'View', 'View AI agent workflows, events, and checkpoints'),
  ('agents.execute', 'Agents', 'Agents', 'Execute', 'Start, resume, and cancel AI agent workflows'),
  ('agents.manage', 'Agents', 'Agents', 'Manage', 'Manage AI agent configuration and policies')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'agents.view'),
    ('admin', 'agents.execute'),
    ('admin', 'agents.manage')
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
join public.permissions p
  on p.code in ('agents.view', 'agents.execute', 'agents.manage')
where r.company_id is not null
  and r.is_system = true
  and (
    r.template_key = 'admin'
    or r.name ilike '%admin%'
    or r.description ilike '%administrator%'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

-- Preserve existing runtime.execute holders during permission migration.
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_agents.id
from public.role_permissions rp
join public.permissions p_runtime
  on p_runtime.id = rp.permission_id
 and p_runtime.code = 'runtime.execute'
join public.permissions p_agents
  on p_agents.code in ('agents.view', 'agents.execute')
where not exists (
  select 1
  from public.role_permissions existing
  where existing.role_id = rp.role_id
    and existing.permission_id = p_agents.id
);

drop policy if exists agent_workflows_select on public.agent_workflows;
create policy agent_workflows_select on public.agent_workflows for select using (
  public.company_has_permission(company_id, 'agents.view')
);

drop policy if exists agent_workflows_write on public.agent_workflows;
create policy agent_workflows_insert on public.agent_workflows for insert with check (
  public.company_has_permission(company_id, 'agents.execute')
);
create policy agent_workflows_update on public.agent_workflows for update using (
  public.company_has_permission(company_id, 'agents.execute')
) with check (
  public.company_has_permission(company_id, 'agents.execute')
);

drop policy if exists agent_workflow_checkpoints_select on public.agent_workflow_checkpoints;
create policy agent_workflow_checkpoints_select on public.agent_workflow_checkpoints for select using (
  public.company_has_permission(company_id, 'agents.view')
);

drop policy if exists agent_workflow_checkpoints_write on public.agent_workflow_checkpoints;
create policy agent_workflow_checkpoints_insert on public.agent_workflow_checkpoints for insert with check (
  public.company_has_permission(company_id, 'agents.execute')
);

drop policy if exists agent_workflow_events_select on public.agent_workflow_events;
create policy agent_workflow_events_select on public.agent_workflow_events for select using (
  public.company_has_permission(company_id, 'agents.view')
);

drop policy if exists agent_workflow_events_write on public.agent_workflow_events;
create policy agent_workflow_events_insert on public.agent_workflow_events for insert with check (
  public.company_has_permission(company_id, 'agents.execute')
);

comment on policy agent_workflows_select on public.agent_workflows is
  'Agent workflow reads require agents.view (Sprint 6.2).';
comment on policy agent_workflows_insert on public.agent_workflows is
  'Agent workflow writes require agents.execute (Sprint 6.2).';
