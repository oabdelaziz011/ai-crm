-- Sprint 6.4 — Enterprise Automation Engine
-- Does NOT modify notification_queue schema or NotificationService.

create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  enabled boolean not null default false,
  version integer not null default 1,
  trigger jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  schedule jsonb not null default '{"type":"immediate"}'::jsonb,
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  is_template boolean not null default false,
  template_key text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  workflow_version integer not null default 1,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled')),
  trigger_event text not null,
  context jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_execution_history (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.automation_executions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  step_type text not null check (step_type in ('trigger', 'condition', 'delay', 'action')),
  step_index integer not null default 0,
  status text not null check (status in ('completed', 'failed', 'skipped')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  execution_id uuid not null references public.automation_executions(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  scheduled_at timestamptz not null,
  delay_type text not null,
  delay_config jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'consumed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_workflows_company_enabled
  on public.automation_workflows(company_id, enabled);

create index if not exists idx_automation_executions_company_created
  on public.automation_executions(company_id, created_at desc);

create index if not exists idx_automation_executions_workflow
  on public.automation_executions(workflow_id, created_at desc);

create index if not exists idx_automation_schedules_pending
  on public.automation_schedules(company_id, status, scheduled_at)
  where status = 'pending';

create index if not exists idx_automation_execution_history_execution
  on public.automation_execution_history(execution_id, step_index);

alter table public.automation_workflows enable row level security;
alter table public.automation_executions enable row level security;
alter table public.automation_execution_history enable row level security;
alter table public.automation_schedules enable row level security;

drop policy if exists automation_workflows_select on public.automation_workflows;
create policy automation_workflows_select
  on public.automation_workflows for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or is_template = true
      or company_id = public.current_company_id()
    )
  );

drop policy if exists automation_workflows_mutate on public.automation_workflows;
create policy automation_workflows_mutate
  on public.automation_workflows for all
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or (company_id = public.current_company_id() and public.is_company_admin()))
  )
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or (company_id = public.current_company_id() and public.is_company_admin()))
  );

drop policy if exists automation_executions_select on public.automation_executions;
create policy automation_executions_select
  on public.automation_executions for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists automation_executions_insert on public.automation_executions;
create policy automation_executions_insert
  on public.automation_executions for insert
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists automation_executions_update on public.automation_executions;
create policy automation_executions_update
  on public.automation_executions for update
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists automation_execution_history_select on public.automation_execution_history;
create policy automation_execution_history_select
  on public.automation_execution_history for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists automation_execution_history_insert on public.automation_execution_history;
create policy automation_execution_history_insert
  on public.automation_execution_history for insert
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists automation_schedules_select on public.automation_schedules;
create policy automation_schedules_select
  on public.automation_schedules for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists automation_schedules_insert on public.automation_schedules;
create policy automation_schedules_insert
  on public.automation_schedules for insert
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists automation_schedules_update on public.automation_schedules;
create policy automation_schedules_update
  on public.automation_schedules for update
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );
