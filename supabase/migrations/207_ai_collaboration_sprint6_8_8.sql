-- Sprint 6.8.8: Enterprise Multi-Agent Collaboration Platform (orchestration layer only; execution remains in Agent Runtime).

insert into public.permissions (code, category, module, action, description)
values
  ('collaboration.view', 'Collaboration', 'Collaboration', 'View', 'View multi-agent collaboration'),
  ('collaboration.manage', 'Collaboration', 'Collaboration', 'Manage', 'Manage agent groups and policies'),
  ('collaboration.handover', 'Collaboration', 'Collaboration', 'Handover', 'Request agent task handovers')
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
    ('admin', 'collaboration.view'),
    ('admin', 'collaboration.manage'),
    ('admin', 'collaboration.handover')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

create table if not exists public.ai_employee_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  name text not null,
  display_name text not null,
  description text not null default '',
  department text,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);

create table if not exists public.ai_employee_group_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null references public.ai_employee_groups(id) on delete cascade,
  employee_id uuid not null references public.ai_employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, employee_id)
);

create index if not exists idx_ai_employee_group_members_employee
  on public.ai_employee_group_members(company_id, employee_id);

create table if not exists public.ai_employee_handovers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_employee_id uuid not null references public.ai_employees(id) on delete cascade,
  destination_employee_id uuid not null references public.ai_employees(id) on delete cascade,
  reason text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'completed', 'failed', 'cancelled')),
  escalation_type text not null default 'ai_to_ai'
    check (escalation_type in ('ai_to_ai', 'ai_to_human', 'human_to_ai')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_ai_employee_handovers_company
  on public.ai_employee_handovers(company_id, created_at desc);

create table if not exists public.ai_employee_collaboration_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.ai_employees(id) on delete set null,
  event_type text not null
    check (event_type in (
      'group_joined', 'group_left', 'handover_requested', 'handover_accepted',
      'handover_completed', 'handover_failed', 'escalation_started', 'escalation_completed',
      'assignment', 'completion'
    )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_ai_employee_collaboration_events_company
  on public.ai_employee_collaboration_events(company_id, created_at desc);

create table if not exists public.ai_employee_collaboration_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  policy_key text not null default 'default',
  allowed_collaborations jsonb not null default '[]'::jsonb,
  blocked_collaborations jsonb not null default '[]'::jsonb,
  department_rules jsonb not null default '{}'::jsonb,
  tenant_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, policy_key)
);

alter table public.ai_employee_groups enable row level security;
alter table public.ai_employee_group_members enable row level security;
alter table public.ai_employee_handovers enable row level security;
alter table public.ai_employee_collaboration_events enable row level security;
alter table public.ai_employee_collaboration_policies enable row level security;

drop policy if exists ai_employee_groups_select on public.ai_employee_groups;
create policy ai_employee_groups_select on public.ai_employee_groups for select using (
  public.company_has_agents_access(company_id, 'collaboration.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_employee_groups_write on public.ai_employee_groups;
create policy ai_employee_groups_write on public.ai_employee_groups for all using (
  public.company_has_agents_access(company_id, 'collaboration.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
) with check (
  public.company_has_agents_access(company_id, 'collaboration.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
);

drop policy if exists ai_employee_group_members_select on public.ai_employee_group_members;
create policy ai_employee_group_members_select on public.ai_employee_group_members for select using (
  public.company_has_agents_access(company_id, 'collaboration.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_employee_group_members_write on public.ai_employee_group_members;
create policy ai_employee_group_members_write on public.ai_employee_group_members for all using (
  public.company_has_agents_access(company_id, 'collaboration.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
) with check (
  public.company_has_agents_access(company_id, 'collaboration.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
);

drop policy if exists ai_employee_handovers_select on public.ai_employee_handovers;
create policy ai_employee_handovers_select on public.ai_employee_handovers for select using (
  public.company_has_agents_access(company_id, 'collaboration.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_employee_handovers_write on public.ai_employee_handovers;
create policy ai_employee_handovers_write on public.ai_employee_handovers for all using (
  public.company_has_agents_access(company_id, 'collaboration.handover')
  or public.company_has_agents_access(company_id, 'collaboration.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
) with check (
  public.company_has_agents_access(company_id, 'collaboration.handover')
  or public.company_has_agents_access(company_id, 'collaboration.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
);

drop policy if exists ai_employee_collaboration_events_select on public.ai_employee_collaboration_events;
create policy ai_employee_collaboration_events_select on public.ai_employee_collaboration_events for select using (
  public.company_has_agents_access(company_id, 'collaboration.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_employee_collaboration_events_insert on public.ai_employee_collaboration_events;
create policy ai_employee_collaboration_events_insert on public.ai_employee_collaboration_events for insert with check (
  public.company_has_agents_access(company_id, 'collaboration.handover')
  or public.company_has_agents_access(company_id, 'collaboration.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
);

drop policy if exists ai_employee_collaboration_policies_select on public.ai_employee_collaboration_policies;
create policy ai_employee_collaboration_policies_select on public.ai_employee_collaboration_policies for select using (
  public.company_has_agents_access(company_id, 'collaboration.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_employee_collaboration_policies_write on public.ai_employee_collaboration_policies;
create policy ai_employee_collaboration_policies_write on public.ai_employee_collaboration_policies for all using (
  public.company_has_agents_access(company_id, 'collaboration.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
) with check (
  public.company_has_agents_access(company_id, 'collaboration.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
);
