-- Sprint 6.8.1: Enterprise AI Employee Workspace foundation (registry layer only).

insert into public.permissions (code, category, module, action, description)
values
  ('agents.create', 'Agents', 'Agents', 'Create', 'Create AI employee profiles'),
  ('agents.edit', 'Agents', 'Agents', 'Edit', 'Edit AI employee profiles'),
  ('agents.delete', 'Agents', 'Agents', 'Delete', 'Archive AI employee profiles')
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
    ('admin', 'agents.create'),
    ('admin', 'agents.edit'),
    ('admin', 'agents.delete')
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
  on p.code in ('agents.create', 'agents.edit', 'agents.delete')
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

create table if not exists public.ai_employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  display_name text not null,
  description text not null default '',
  avatar text,
  department text,
  owner_id uuid references auth.users(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'inactive', 'archived')),
  provider text,
  model text,
  temperature numeric(3, 2)
    check (temperature is null or (temperature >= 0 and temperature <= 2)),
  max_tokens integer
    check (max_tokens is null or max_tokens > 0),
  system_prompt text not null default '',
  system_prompt_summary text not null default '',
  knowledge_source_ids jsonb not null default '[]'::jsonb,
  knowledge_summary text not null default '',
  allowed_tool_keys jsonb not null default '[]'::jsonb,
  tool_summary text not null default '',
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists idx_ai_employees_company_name_active
  on public.ai_employees(company_id, lower(name))
  where deleted_at is null;

create index if not exists idx_ai_employees_company_status
  on public.ai_employees(company_id, status)
  where deleted_at is null;

create index if not exists idx_ai_employees_company_department
  on public.ai_employees(company_id, department)
  where deleted_at is null and department is not null;

create index if not exists idx_ai_employees_company_owner
  on public.ai_employees(company_id, owner_id)
  where deleted_at is null and owner_id is not null;

drop trigger if exists ai_employees_updated_at on public.ai_employees;
create trigger ai_employees_updated_at
  before update on public.ai_employees
  for each row execute procedure public.set_updated_at();

alter table public.ai_employees enable row level security;

drop policy if exists ai_employees_select on public.ai_employees;
create policy ai_employees_select on public.ai_employees for select using (
  deleted_at is null
  and public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_employees_insert on public.ai_employees;
create policy ai_employees_insert on public.ai_employees for insert with check (
  public.company_has_agents_access(company_id, 'agents.create')
);

drop policy if exists ai_employees_update on public.ai_employees;
create policy ai_employees_update on public.ai_employees for update using (
  public.company_has_agents_access(company_id, 'agents.edit')
  or public.company_has_agents_access(company_id, 'agents.delete')
) with check (
  public.company_has_agents_access(company_id, 'agents.edit')
  or public.company_has_agents_access(company_id, 'agents.delete')
);

comment on table public.ai_employees is
  'AI Employee registry profiles (Sprint 6.8.1). Management layer only; execution remains in agent-runtime.';
comment on policy ai_employees_select on public.ai_employees is
  'AI employee reads require agents.view and ai_agents feature (Sprint 6.8.1).';
comment on policy ai_employees_insert on public.ai_employees is
  'AI employee creates require agents.create and ai_agents feature (Sprint 6.8.1).';
comment on policy ai_employees_update on public.ai_employees is
  'AI employee updates require agents.edit and ai_agents feature (Sprint 6.8.1).';
