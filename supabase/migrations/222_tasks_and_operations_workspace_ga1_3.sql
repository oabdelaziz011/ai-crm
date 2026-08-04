-- GA-1.3 — Enterprise Operations Core
-- Tasks platform, persistent operations workspace config, permissions, realtime.

insert into public.entity_type_registry (code, label) values
  ('task', 'Task'),
  ('workflow', 'Workflow')
on conflict (code) do nothing;

-- ── tasks ────────────────────────────────────────────────────────────────────

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references auth.users(id) on delete set null,
  entity_type text references public.entity_type_registry(code),
  entity_id uuid,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'paused', 'completed', 'cancelled')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  parent_task_id uuid references public.tasks(id) on delete set null,
  recurrence_rule jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_tasks_company_entity
  on public.tasks(company_id, entity_type, entity_id)
  where deleted_at is null;

create index if not exists idx_tasks_company_assignee
  on public.tasks(company_id, assignee_id, status)
  where deleted_at is null;

create index if not exists idx_tasks_company_due
  on public.tasks(company_id, due_at)
  where deleted_at is null and status not in ('completed', 'cancelled');

-- ── operations_workspace_config ──────────────────────────────────────────────

create table if not exists public.operations_workspace_config (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_key text not null default 'clinic',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, template_key)
);

create index if not exists idx_operations_workspace_config_company
  on public.operations_workspace_config(company_id);

-- ── RLS: tasks ───────────────────────────────────────────────────────────────

alter table public.tasks enable row level security;

create policy tasks_select on public.tasks
  for select using (
    company_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy tasks_insert on public.tasks
  for insert with check (
    company_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy tasks_update on public.tasks
  for update using (
    company_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy tasks_delete on public.tasks
  for delete using (
    company_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

-- ── RLS: operations_workspace_config ─────────────────────────────────────────

alter table public.operations_workspace_config enable row level security;

create policy operations_workspace_config_select on public.operations_workspace_config
  for select using (
    company_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy operations_workspace_config_insert on public.operations_workspace_config
  for insert with check (
    company_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy operations_workspace_config_update on public.operations_workspace_config
  for update using (
    company_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

-- ── Permissions ──────────────────────────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('operations.read', 'Operations', 'Operations', 'Read', 'View operations queue and workspace'),
  ('operations.write', 'Operations', 'Operations', 'Write', 'Execute operations commands'),
  ('operations.queue.checkin', 'Operations', 'Operations Queue', 'Check In', 'Check in bookings from operations queue'),
  ('operations.queue.complete', 'Operations', 'Operations Queue', 'Complete', 'Complete bookings from operations queue'),
  ('tasks.read', 'Tasks', 'Tasks', 'Read', 'View tasks'),
  ('tasks.write', 'Tasks', 'Tasks', 'Write', 'Create and manage tasks'),
  ('tasks.assign', 'Tasks', 'Tasks', 'Assign', 'Assign tasks to users'),
  ('workflow.read', 'Workflow', 'Workflow', 'Read', 'View workflow executions'),
  ('workflow.execute', 'Workflow', 'Workflow', 'Execute', 'Start and manage workflows'),
  ('knowledge.read', 'Knowledge', 'Knowledge', 'Read', 'Query knowledge base'),
  ('knowledge.manage', 'Knowledge', 'Knowledge', 'Manage', 'Manage knowledge documents')
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
    ('admin', 'operations.read'),
    ('admin', 'operations.write'),
    ('admin', 'operations.queue.checkin'),
    ('admin', 'operations.queue.complete'),
    ('admin', 'tasks.read'),
    ('admin', 'tasks.write'),
    ('admin', 'tasks.assign'),
    ('admin', 'workflow.read'),
    ('admin', 'workflow.execute'),
    ('admin', 'knowledge.read'),
    ('admin', 'knowledge.manage'),
    ('manager', 'operations.read'),
    ('manager', 'operations.write'),
    ('manager', 'operations.queue.checkin'),
    ('manager', 'operations.queue.complete'),
    ('manager', 'tasks.read'),
    ('manager', 'tasks.write'),
    ('manager', 'tasks.assign'),
    ('manager', 'workflow.read'),
    ('manager', 'workflow.execute'),
    ('manager', 'knowledge.read'),
    ('employee', 'operations.read'),
    ('employee', 'tasks.read'),
    ('employee', 'tasks.write'),
    ('employee', 'knowledge.read')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p.id
from public.roles r
inner join public.platform_role_template_permissions trp
  on trp.template_key = r.template_key
inner join public.permissions p
  on p.code = trp.permission_code
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and trp.permission_code in (
    'operations.read',
    'operations.write',
    'operations.queue.checkin',
    'operations.queue.complete',
    'tasks.read',
    'tasks.write',
    'tasks.assign',
    'workflow.read',
    'workflow.execute',
    'knowledge.read',
    'knowledge.manage'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.operations_workspace_config;
exception when duplicate_object then null;
end $$;
