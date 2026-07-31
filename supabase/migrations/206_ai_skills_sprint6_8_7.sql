-- Sprint 6.8.7: Enterprise AI Skills Platform (registry layer only; execution remains in Tool Router / Agent Runtime).

insert into public.permissions (code, category, module, action, description)
values
  ('skills.view', 'Skills', 'Skills', 'View', 'View AI skills catalog'),
  ('skills.create', 'Skills', 'Skills', 'Create', 'Create AI skills'),
  ('skills.edit', 'Skills', 'Skills', 'Edit', 'Edit AI skills'),
  ('skills.publish', 'Skills', 'Skills', 'Publish', 'Publish AI skill versions'),
  ('skills.rollback', 'Skills', 'Skills', 'Rollback', 'Rollback AI skill versions'),
  ('skills.manage', 'Skills', 'Skills', 'Manage', 'Manage AI skills')
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
    ('admin', 'skills.view'),
    ('admin', 'skills.create'),
    ('admin', 'skills.edit'),
    ('admin', 'skills.publish'),
    ('admin', 'skills.rollback'),
    ('admin', 'skills.manage')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

alter table public.ai_employees
  add column if not exists allowed_skill_ids uuid[] not null default '{}'::uuid[],
  add column if not exists skills_summary text not null default 'No skills assigned';

create table if not exists public.ai_skills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  name text not null,
  display_name text not null,
  description text not null default '',
  category text not null default 'general',
  tags text[] not null default '{}'::text[],
  tool_keys text[] not null default '{}'::text[],
  required_permissions text[] not null default '{}'::text[],
  required_knowledge_ids uuid[] not null default '{}'::uuid[],
  runtime_recommendations jsonb not null default '{}'::jsonb,
  documentation jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  published_version_id uuid,
  current_version_number integer not null default 0,
  has_unpublished_draft boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, key)
);

create index if not exists idx_ai_skills_company_status
  on public.ai_skills(company_id, status, updated_at desc)
  where deleted_at is null;

create table if not exists public.ai_skill_dependencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  skill_id uuid not null references public.ai_skills(id) on delete cascade,
  depends_on_skill_id uuid not null references public.ai_skills(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (skill_id, depends_on_skill_id),
  check (skill_id <> depends_on_skill_id)
);

create index if not exists idx_ai_skill_dependencies_skill
  on public.ai_skill_dependencies(company_id, skill_id);

create table if not exists public.ai_skill_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  skill_id uuid not null references public.ai_skills(id) on delete cascade,
  version_number integer not null,
  status text not null default 'published'
    check (status in ('published', 'superseded', 'rolled_back')),
  snapshot jsonb not null,
  publish_notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  unique (skill_id, version_number)
);

create table if not exists public.ai_skill_deployments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  skill_id uuid not null references public.ai_skills(id) on delete cascade,
  version_id uuid not null references public.ai_skill_versions(id) on delete cascade,
  version_number integer not null,
  status text not null default 'active'
    check (status in ('active', 'superseded', 'rolled_back')),
  publish_notes text not null default '',
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null
);

create table if not exists public.ai_skill_change_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  skill_id uuid not null references public.ai_skills(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'created', 'updated', 'published', 'rolled_back', 'archived', 'restored',
      'dependency_added', 'dependency_removed', 'assigned', 'unassigned', 'tested'
    )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.ai_skill_favorites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  skill_id uuid not null references public.ai_skills(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (company_id, skill_id, user_id)
);

alter table public.ai_skills enable row level security;
alter table public.ai_skill_dependencies enable row level security;
alter table public.ai_skill_versions enable row level security;
alter table public.ai_skill_deployments enable row level security;
alter table public.ai_skill_change_events enable row level security;
alter table public.ai_skill_favorites enable row level security;

drop policy if exists ai_skills_select on public.ai_skills;
create policy ai_skills_select on public.ai_skills for select using (
  public.company_has_agents_access(company_id, 'skills.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_skills_write on public.ai_skills;
create policy ai_skills_write on public.ai_skills for all using (
  public.company_has_agents_access(company_id, 'skills.edit')
  or public.company_has_agents_access(company_id, 'skills.manage')
) with check (
  public.company_has_agents_access(company_id, 'skills.edit')
  or public.company_has_agents_access(company_id, 'skills.manage')
);

drop policy if exists ai_skill_dependencies_select on public.ai_skill_dependencies;
create policy ai_skill_dependencies_select on public.ai_skill_dependencies for select using (
  public.company_has_agents_access(company_id, 'skills.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_skill_dependencies_write on public.ai_skill_dependencies;
create policy ai_skill_dependencies_write on public.ai_skill_dependencies for all using (
  public.company_has_agents_access(company_id, 'skills.edit')
  or public.company_has_agents_access(company_id, 'skills.manage')
) with check (
  public.company_has_agents_access(company_id, 'skills.edit')
  or public.company_has_agents_access(company_id, 'skills.manage')
);

drop policy if exists ai_skill_versions_select on public.ai_skill_versions;
create policy ai_skill_versions_select on public.ai_skill_versions for select using (
  public.company_has_agents_access(company_id, 'skills.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_skill_versions_insert on public.ai_skill_versions;
create policy ai_skill_versions_insert on public.ai_skill_versions for insert with check (
  public.company_has_agents_access(company_id, 'skills.publish')
  or public.company_has_agents_access(company_id, 'skills.manage')
);

drop policy if exists ai_skill_deployments_select on public.ai_skill_deployments;
create policy ai_skill_deployments_select on public.ai_skill_deployments for select using (
  public.company_has_agents_access(company_id, 'skills.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_skill_deployments_insert on public.ai_skill_deployments;
create policy ai_skill_deployments_insert on public.ai_skill_deployments for insert with check (
  public.company_has_agents_access(company_id, 'skills.publish')
  or public.company_has_agents_access(company_id, 'skills.manage')
);

drop policy if exists ai_skill_change_events_select on public.ai_skill_change_events;
create policy ai_skill_change_events_select on public.ai_skill_change_events for select using (
  public.company_has_agents_access(company_id, 'skills.view')
  or public.company_has_agents_access(company_id, 'agents.view')
);

drop policy if exists ai_skill_change_events_insert on public.ai_skill_change_events;
create policy ai_skill_change_events_insert on public.ai_skill_change_events for insert with check (
  public.company_has_agents_access(company_id, 'skills.edit')
  or public.company_has_agents_access(company_id, 'skills.manage')
);

drop policy if exists ai_skill_favorites_select on public.ai_skill_favorites;
create policy ai_skill_favorites_select on public.ai_skill_favorites for select using (
  auth.uid() = user_id
);

drop policy if exists ai_skill_favorites_write on public.ai_skill_favorites;
create policy ai_skill_favorites_write on public.ai_skill_favorites for all using (
  auth.uid() = user_id
) with check (
  auth.uid() = user_id
);
