-- GA-1.4 — Enterprise Configuration Platform
-- Unified metadata-driven configuration store with versioning, permissions, and realtime.

-- ── Domain registry ──────────────────────────────────────────────────────────

create table if not exists public.configuration_domain_registry (
  code text primary key,
  label text not null,
  category text not null default 'platform',
  created_at timestamptz not null default now()
);

insert into public.configuration_domain_registry (code, label, category) values
  ('workspace', 'Workspace', 'workspace'),
  ('crm', 'CRM', 'crm'),
  ('operations', 'Operations', 'operations'),
  ('operations.workspace', 'Operations Workspace', 'operations'),
  ('bookings', 'Bookings', 'operations'),
  ('scheduling', 'Scheduling', 'operations'),
  ('calendar', 'Calendar', 'operations'),
  ('billing', 'Billing', 'billing'),
  ('notifications', 'Notifications', 'notifications'),
  ('automation', 'Automation', 'automation'),
  ('ai', 'AI', 'ai'),
  ('knowledge', 'Knowledge', 'knowledge'),
  ('dashboard', 'Dashboard', 'dashboard'),
  ('customer_portal', 'Customer Portal', 'portal'),
  ('employee_portal', 'Employee Portal', 'portal'),
  ('public_booking', 'Public Booking', 'portal'),
  ('global_search', 'Global Search', 'platform'),
  ('reports', 'Reports', 'platform')
on conflict (code) do nothing;

-- ── Platform configurations ──────────────────────────────────────────────────

create table if not exists public.platform_configurations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  domain text not null references public.configuration_domain_registry(code),
  scope_key text not null default 'default',
  status text not null default 'published'
    check (status in ('draft', 'published')),
  version integer not null default 1,
  published_config jsonb not null default '{}'::jsonb,
  draft_config jsonb,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, domain, scope_key)
);

create index if not exists idx_platform_configurations_tenant_domain
  on public.platform_configurations(tenant_id, domain);

-- ── Version history ──────────────────────────────────────────────────────────

create table if not exists public.platform_configuration_versions (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.platform_configurations(id) on delete cascade,
  tenant_id uuid not null references public.companies(id) on delete cascade,
  version integer not null,
  config jsonb not null default '{}'::jsonb,
  action text not null default 'publish'
    check (action in ('draft', 'publish', 'rollback', 'restore')),
  change_summary text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_configuration_versions_config
  on public.platform_configuration_versions(configuration_id, version desc);

-- ── Migrate GA-1.3 operations_workspace_config ───────────────────────────────

insert into public.platform_configurations (
  tenant_id,
  domain,
  scope_key,
  status,
  version,
  published_config,
  draft_config,
  published_at,
  published_by,
  updated_at,
  updated_by
)
select
  owc.company_id,
  'operations.workspace',
  owc.template_key,
  'published',
  1,
  owc.config,
  null,
  owc.updated_at,
  owc.updated_by,
  owc.updated_at,
  owc.updated_by
from public.operations_workspace_config owc
where not exists (
  select 1 from public.platform_configurations pc
  where pc.tenant_id = owc.company_id
    and pc.domain = 'operations.workspace'
    and pc.scope_key = owc.template_key
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.platform_configurations enable row level security;
alter table public.platform_configuration_versions enable row level security;

create policy platform_configurations_select on public.platform_configurations
  for select using (
    tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy platform_configurations_insert on public.platform_configurations
  for insert with check (
    tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy platform_configurations_update on public.platform_configurations
  for update using (
    tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy platform_configuration_versions_select on public.platform_configuration_versions
  for select using (
    tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy platform_configuration_versions_insert on public.platform_configuration_versions
  for insert with check (
    tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

-- ── Permissions ──────────────────────────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('configuration.read', 'Configuration', 'Configuration', 'Read', 'View platform configuration'),
  ('configuration.write', 'Configuration', 'Configuration', 'Write', 'Edit platform configuration drafts'),
  ('configuration.publish', 'Configuration', 'Configuration', 'Publish', 'Publish configuration changes'),
  ('configuration.workspace.read', 'Configuration', 'Workspace', 'Read', 'View workspace configuration'),
  ('configuration.workspace.write', 'Configuration', 'Workspace', 'Write', 'Edit workspace configuration'),
  ('configuration.crm.read', 'Configuration', 'CRM', 'Read', 'View CRM configuration'),
  ('configuration.crm.write', 'Configuration', 'CRM', 'Write', 'Edit CRM configuration'),
  ('configuration.operations.read', 'Configuration', 'Operations', 'Read', 'View operations configuration'),
  ('configuration.operations.write', 'Configuration', 'Operations', 'Write', 'Edit operations configuration'),
  ('configuration.billing.read', 'Configuration', 'Billing', 'Read', 'View billing configuration'),
  ('configuration.billing.write', 'Configuration', 'Billing', 'Write', 'Edit billing configuration'),
  ('configuration.ai.read', 'Configuration', 'AI', 'Read', 'View AI configuration'),
  ('configuration.ai.write', 'Configuration', 'AI', 'Write', 'Edit AI configuration'),
  ('configuration.dashboard.read', 'Configuration', 'Dashboard', 'Read', 'View dashboard configuration'),
  ('configuration.dashboard.write', 'Configuration', 'Dashboard', 'Write', 'Edit dashboard configuration'),
  ('operations.universal.configure', 'Operations', 'Universal Operations', 'Configure', 'Manage universal operations configuration'),
  ('operations.configuration.manage', 'Operations', 'Operations Config', 'Manage', 'Legacy operations config permission')
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
    ('admin', 'configuration.read'),
    ('admin', 'configuration.write'),
    ('admin', 'configuration.publish'),
    ('admin', 'configuration.workspace.read'),
    ('admin', 'configuration.workspace.write'),
    ('admin', 'configuration.crm.read'),
    ('admin', 'configuration.crm.write'),
    ('admin', 'configuration.operations.read'),
    ('admin', 'configuration.operations.write'),
    ('admin', 'configuration.billing.read'),
    ('admin', 'configuration.billing.write'),
    ('admin', 'configuration.ai.read'),
    ('admin', 'configuration.ai.write'),
    ('admin', 'configuration.dashboard.read'),
    ('admin', 'configuration.dashboard.write'),
    ('admin', 'operations.universal.configure'),
    ('admin', 'operations.configuration.manage'),
    ('manager', 'configuration.read'),
    ('manager', 'configuration.write'),
    ('manager', 'configuration.publish'),
    ('manager', 'configuration.workspace.read'),
    ('manager', 'configuration.workspace.write'),
    ('manager', 'configuration.operations.read'),
    ('manager', 'configuration.operations.write'),
    ('manager', 'operations.universal.configure'),
    ('manager', 'operations.configuration.manage')
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
    'configuration.read',
    'configuration.write',
    'configuration.publish',
    'configuration.workspace.read',
    'configuration.workspace.write',
    'configuration.crm.read',
    'configuration.crm.write',
    'configuration.operations.read',
    'configuration.operations.write',
    'configuration.billing.read',
    'configuration.billing.write',
    'configuration.ai.read',
    'configuration.ai.write',
    'configuration.dashboard.read',
    'configuration.dashboard.write',
    'operations.universal.configure',
    'operations.configuration.manage'
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
  alter publication supabase_realtime add table public.platform_configurations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.platform_configuration_versions;
exception when duplicate_object then null;
end $$;
