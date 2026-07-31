-- Sprint 6.8.9: Enterprise AI Governance & Compliance Platform (configuration layer only; no runtime execution).

insert into public.permissions (code, category, module, action, description)
values
  ('governance.view', 'Governance', 'Governance', 'View', 'View AI governance policies'),
  ('governance.create', 'Governance', 'Governance', 'Create', 'Create AI governance policies'),
  ('governance.edit', 'Governance', 'Governance', 'Edit', 'Edit AI governance policies'),
  ('governance.approve', 'Governance', 'Governance', 'Approve', 'Approve governance requests'),
  ('governance.manage', 'Governance', 'Governance', 'Manage', 'Manage AI governance platform')
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
    ('admin', 'governance.view'),
    ('admin', 'governance.create'),
    ('admin', 'governance.edit'),
    ('admin', 'governance.approve'),
    ('admin', 'governance.manage')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

create table if not exists public.ai_governance_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  name text not null,
  display_name text not null,
  description text not null default '',
  category text not null
    check (category in (
      'ai_policy', 'model', 'provider', 'prompt', 'skill', 'tool', 'data', 'compliance', 'approval'
    )),
  config jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  owner_id uuid references auth.users(id) on delete set null,
  department text,
  version_number integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, key)
);

create index if not exists idx_ai_governance_policies_company
  on public.ai_governance_policies(company_id, category, status)
  where deleted_at is null;

create table if not exists public.ai_governance_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('employee', 'prompt', 'skill', 'policy')),
  entity_id uuid not null,
  entity_label text not null default '',
  approval_type text not null
    check (approval_type in ('publish', 'prompt', 'skill', 'policy')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_ai_governance_approvals_company
  on public.ai_governance_approvals(company_id, status, created_at desc);

create table if not exists public.ai_governance_violations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.ai_employees(id) on delete set null,
  policy_id uuid references public.ai_governance_policies(id) on delete set null,
  violation_type text not null,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  message text not null default '',
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_ai_governance_violations_company
  on public.ai_governance_violations(company_id, resolved, created_at desc);

create table if not exists public.ai_governance_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.ai_employees(id) on delete set null,
  policy_id uuid references public.ai_governance_policies(id) on delete set null,
  event_type text not null
    check (event_type in (
      'policy_created', 'policy_updated', 'policy_published', 'policy_archived', 'policy_restored',
      'approval_requested', 'approval_granted', 'approval_rejected',
      'violation_detected', 'violation_resolved', 'risk_assessed', 'compliance_checked'
    )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_ai_governance_audit_events_company
  on public.ai_governance_audit_events(company_id, created_at desc);

alter table public.ai_governance_policies enable row level security;
alter table public.ai_governance_approvals enable row level security;
alter table public.ai_governance_violations enable row level security;
alter table public.ai_governance_audit_events enable row level security;

drop policy if exists ai_governance_policies_select on public.ai_governance_policies;
create policy ai_governance_policies_select on public.ai_governance_policies for select using (
  public.company_has_agents_access(company_id, 'governance.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_governance_policies_write on public.ai_governance_policies;
create policy ai_governance_policies_write on public.ai_governance_policies for all using (
  public.company_has_agents_access(company_id, 'governance.edit')
  or public.company_has_agents_access(company_id, 'governance.manage')
) with check (
  public.company_has_agents_access(company_id, 'governance.edit')
  or public.company_has_agents_access(company_id, 'governance.manage')
);

drop policy if exists ai_governance_approvals_select on public.ai_governance_approvals;
create policy ai_governance_approvals_select on public.ai_governance_approvals for select using (
  public.company_has_agents_access(company_id, 'governance.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_governance_approvals_write on public.ai_governance_approvals;
create policy ai_governance_approvals_write on public.ai_governance_approvals for all using (
  public.company_has_agents_access(company_id, 'governance.approve')
  or public.company_has_agents_access(company_id, 'governance.manage')
) with check (
  public.company_has_agents_access(company_id, 'governance.approve')
  or public.company_has_agents_access(company_id, 'governance.manage')
);

drop policy if exists ai_governance_violations_select on public.ai_governance_violations;
create policy ai_governance_violations_select on public.ai_governance_violations for select using (
  public.company_has_agents_access(company_id, 'governance.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_governance_violations_write on public.ai_governance_violations;
create policy ai_governance_violations_write on public.ai_governance_violations for all using (
  public.company_has_agents_access(company_id, 'governance.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
) with check (
  public.company_has_agents_access(company_id, 'governance.manage')
  or public.company_has_agents_access(company_id, 'agents.manage')
);

drop policy if exists ai_governance_audit_events_select on public.ai_governance_audit_events;
create policy ai_governance_audit_events_select on public.ai_governance_audit_events for select using (
  public.company_has_agents_access(company_id, 'governance.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_governance_audit_events_insert on public.ai_governance_audit_events;
create policy ai_governance_audit_events_insert on public.ai_governance_audit_events for insert with check (
  public.company_has_agents_access(company_id, 'governance.edit')
  or public.company_has_agents_access(company_id, 'governance.manage')
);
