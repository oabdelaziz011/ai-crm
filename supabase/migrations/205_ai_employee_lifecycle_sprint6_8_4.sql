-- Sprint 6.8.4: AI Employee lifecycle & deployment management (registry layer only).

insert into public.permissions (code, category, module, action, description)
values
  ('agents.publish', 'Agents', 'Agents', 'Publish', 'Publish AI employee versions'),
  ('agents.rollback', 'Agents', 'Agents', 'Rollback', 'Rollback AI employee versions')
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
    ('admin', 'agents.publish'),
    ('admin', 'agents.rollback')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

-- Normalize legacy lifecycle statuses before tightening constraint.
update public.ai_employees
set status = 'published'
where status = 'active';

update public.ai_employees
set status = 'disabled'
where status = 'inactive';

alter table public.ai_employees
  drop constraint if exists ai_employees_status_check;

alter table public.ai_employees
  add constraint ai_employees_status_check
  check (status in ('draft', 'published', 'disabled', 'archived'));

alter table public.ai_employees
  add column if not exists published_version_id uuid,
  add column if not exists current_version_number integer not null default 0,
  add column if not exists has_unpublished_draft boolean not null default false;

create table if not exists public.ai_employee_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.ai_employees(id) on delete cascade,
  version_number integer not null,
  status text not null default 'published'
    check (status in ('published', 'superseded', 'rolled_back')),
  snapshot jsonb not null,
  publish_notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  unique (employee_id, version_number)
);

create index if not exists idx_ai_employee_versions_company_employee
  on public.ai_employee_versions(company_id, employee_id, version_number desc);

create table if not exists public.ai_employee_deployments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.ai_employees(id) on delete cascade,
  version_id uuid not null references public.ai_employee_versions(id) on delete cascade,
  version_number integer not null,
  status text not null default 'active'
    check (status in ('active', 'superseded', 'rolled_back')),
  publish_notes text not null default '',
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_ai_employee_deployments_company_employee
  on public.ai_employee_deployments(company_id, employee_id, published_at desc);

create table if not exists public.ai_employee_change_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.ai_employees(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'prompt_updated',
      'knowledge_updated',
      'tools_updated',
      'runtime_updated',
      'published',
      'rolled_back',
      'archived',
      'restored',
      'disabled',
      'draft_saved'
    )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_ai_employee_change_events_company_employee
  on public.ai_employee_change_events(company_id, employee_id, created_at desc);

alter table public.ai_employee_versions enable row level security;
alter table public.ai_employee_deployments enable row level security;
alter table public.ai_employee_change_events enable row level security;

drop policy if exists ai_employee_versions_select on public.ai_employee_versions;
create policy ai_employee_versions_select on public.ai_employee_versions for select using (
  public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_employee_versions_insert on public.ai_employee_versions;
create policy ai_employee_versions_insert on public.ai_employee_versions for insert with check (
  public.company_has_agents_access(company_id, 'agents.publish')
);

drop policy if exists ai_employee_deployments_select on public.ai_employee_deployments;
create policy ai_employee_deployments_select on public.ai_employee_deployments for select using (
  public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_employee_deployments_insert on public.ai_employee_deployments;
create policy ai_employee_deployments_insert on public.ai_employee_deployments for insert with check (
  public.company_has_agents_access(company_id, 'agents.publish')
    or public.company_has_agents_access(company_id, 'agents.rollback')
);

drop policy if exists ai_employee_change_events_select on public.ai_employee_change_events;
create policy ai_employee_change_events_select on public.ai_employee_change_events for select using (
  public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_employee_change_events_insert on public.ai_employee_change_events;
create policy ai_employee_change_events_insert on public.ai_employee_change_events for insert with check (
  public.company_has_agents_access(company_id, 'agents.edit')
    or public.company_has_agents_access(company_id, 'agents.publish')
    or public.company_has_agents_access(company_id, 'agents.rollback')
);

comment on table public.ai_employee_versions is
  'Immutable AI employee configuration snapshots (Sprint 6.8.4). Execution remains in agent-runtime.';
comment on table public.ai_employee_deployments is
  'AI employee deployment history (Sprint 6.8.4).';
comment on table public.ai_employee_change_events is
  'AI employee registry change timeline (Sprint 6.8.4).';
