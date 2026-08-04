-- GA-1.4 — Feature Flags & Licensing Platform (extends Enterprise Configuration)

-- ── Feature flag registry ────────────────────────────────────────────────────

create table if not exists public.platform_feature_flag_registry (
  feature_key text primary key,
  label text not null,
  category text not null default 'platform',
  description text,
  default_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.platform_feature_flag_registry (feature_key, label, category) values
  ('ai.employee', 'AI Employee', 'ai'),
  ('ai.chat', 'AI Chat', 'ai'),
  ('ai.analytics', 'AI Analytics', 'ai'),
  ('knowledge.platform', 'Knowledge Platform', 'knowledge'),
  ('workflow.automation', 'Workflow Automation', 'automation'),
  ('customer.portal', 'Customer Portal', 'portal'),
  ('employee.portal', 'Employee Portal', 'portal'),
  ('public.booking', 'Public Booking', 'booking'),
  ('channel.whatsapp', 'WhatsApp', 'omnichannel'),
  ('channel.instagram', 'Instagram', 'omnichannel'),
  ('channel.facebook', 'Facebook', 'omnichannel'),
  ('channel.voice', 'Voice Calling', 'omnichannel'),
  ('dashboard.executive', 'Executive Dashboard', 'dashboard'),
  ('analytics.advanced', 'Advanced Analytics', 'analytics'),
  ('reports.enterprise', 'Enterprise Reports', 'reports'),
  ('leads.management', 'Lead Management', 'crm'),
  ('tasks.management', 'Task Management', 'operations'),
  ('operations.workspace', 'Operations Workspace', 'operations'),
  ('call.center', 'Call Center', 'call_center'),
  ('omnichannel', 'Omnichannel', 'omnichannel'),
  ('tool.calling', 'Tool Calling', 'ai'),
  ('embeddings', 'Embeddings', 'ai')
on conflict (feature_key) do nothing;

-- ── Scoped feature flags ─────────────────────────────────────────────────────

create table if not exists public.platform_feature_flags (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null references public.platform_feature_flag_registry(feature_key),
  scope_type text not null check (scope_type in ('global', 'plan', 'company', 'branch', 'department', 'role', 'user')),
  scope_id text,
  enabled boolean not null default true,
  rollout_percentage integer not null default 100 check (rollout_percentage >= 0 and rollout_percentage <= 100),
  environment text not null default 'all' check (environment in ('all', 'development', 'staging', 'production')),
  activates_at timestamptz,
  expires_at timestamptz,
  prerequisites jsonb not null default '[]'::jsonb,
  priority integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (feature_key, scope_type, scope_id, environment)
);

create index if not exists idx_platform_feature_flags_scope
  on public.platform_feature_flags(scope_type, scope_id);

create index if not exists idx_platform_feature_flags_feature
  on public.platform_feature_flags(feature_key);

-- ── Feature flag version history ─────────────────────────────────────────────

create table if not exists public.platform_feature_flag_versions (
  id uuid primary key default gen_random_uuid(),
  feature_flag_id uuid not null references public.platform_feature_flags(id) on delete cascade,
  tenant_id uuid references public.companies(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  action text not null default 'update' check (action in ('create', 'update', 'rollback', 'restore')),
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_feature_flag_versions_flag
  on public.platform_feature_flag_versions(feature_flag_id, version desc);

-- ── Plan entitlements (extends existing plans table) ─────────────────────────

create table if not exists public.platform_plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  plan_code text not null,
  features jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  modules jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id)
);

create index if not exists idx_platform_plan_entitlements_code
  on public.platform_plan_entitlements(plan_code);

-- Seed entitlements for existing plans
insert into public.platform_plan_entitlements (plan_id, plan_code, features, limits, modules)
select
  p.id,
  p.code,
  case p.code
    when 'enterprise' then '{"ai.employee":true,"ai.chat":true,"ai.analytics":true,"knowledge.platform":true,"workflow.automation":true,"customer.portal":true,"employee.portal":true,"public.booking":true,"dashboard.executive":true,"analytics.advanced":true,"reports.enterprise":true,"leads.management":true,"tasks.management":true,"operations.workspace":true,"call.center":true,"omnichannel":true,"channel.whatsapp":true,"channel.instagram":true,"channel.facebook":true,"channel.voice":true,"tool.calling":true,"embeddings":true,"api.access":true}'::jsonb
    when 'pro' then '{"ai.chat":true,"knowledge.platform":true,"workflow.automation":true,"customer.portal":true,"public.booking":true,"leads.management":true,"tasks.management":true,"operations.workspace":true,"channel.whatsapp":true,"embeddings":true}'::jsonb
    else '{"ai.chat":true,"leads.management":true,"operations.workspace":true,"public.booking":true}'::jsonb
  end,
  case p.code
    when 'enterprise' then '{"users":500,"branches":50,"storage_gb":500,"ai_tokens_monthly":1000000,"bookings_monthly":50000,"customers":100000,"workflows":500}'::jsonb
    when 'pro' then '{"users":50,"branches":10,"storage_gb":100,"ai_tokens_monthly":200000,"bookings_monthly":10000,"customers":20000,"workflows":100}'::jsonb
    else '{"users":10,"branches":2,"storage_gb":20,"ai_tokens_monthly":50000,"bookings_monthly":2000,"customers":5000,"workflows":20}'::jsonb
  end,
  case p.code
    when 'enterprise' then '["*"]'::jsonb
    when 'pro' then '["crm","operations","booking","knowledge","automation"]'::jsonb
    else '["crm","operations","booking"]'::jsonb
  end
from public.plans p
where not exists (select 1 from public.platform_plan_entitlements pe where pe.plan_id = p.id);

-- ── Company license state ────────────────────────────────────────────────────

create table if not exists public.platform_company_licenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade unique,
  plan_id uuid references public.plans(id) on delete set null,
  plan_code text not null default 'basic',
  status text not null default 'active' check (status in ('active', 'trial', 'grace', 'expired', 'suspended')),
  trial_ends_at timestamptz,
  expires_at timestamptz,
  grace_ends_at timestamptz,
  add_ons jsonb not null default '[]'::jsonb,
  usage_counters jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.platform_company_licenses (tenant_id, plan_id, plan_code, status)
select
  c.id,
  c.plan_id,
  coalesce(p.code, lower(coalesce(c.subscription_plan, 'basic'))),
  'active'
from public.companies c
left join public.plans p on p.id = c.plan_id
where not exists (select 1 from public.platform_company_licenses l where l.tenant_id = c.id);

-- Migrate platform_ai_feature_flags → platform_feature_flags (company scope)
insert into public.platform_feature_flags (feature_key, scope_type, scope_id, enabled, environment, updated_by)
select
  case ff.feature_key
    when 'knowledge' then 'knowledge.platform'
    when 'automation' then 'workflow.automation'
    when 'ai_chat' then 'ai.chat'
    when 'ai_agents' then 'ai.employee'
    when 'ai_analytics' then 'ai.analytics'
    when 'tool_calling' then 'tool.calling'
    when 'embeddings' then 'embeddings'
    when 'voice' then 'channel.voice'
    else ff.feature_key
  end,
  'company',
  ff.company_id::text,
  ff.is_enabled,
  'all',
  ff.updated_by
from public.platform_ai_feature_flags ff
where exists (select 1 from public.platform_feature_flag_registry r where r.feature_key = case ff.feature_key
  when 'knowledge' then 'knowledge.platform'
  when 'automation' then 'workflow.automation'
  when 'ai_chat' then 'ai.chat'
  when 'ai_agents' then 'ai.employee'
  when 'ai_analytics' then 'ai.analytics'
  when 'tool_calling' then 'tool.calling'
  when 'embeddings' then 'embeddings'
  when 'voice' then 'channel.voice'
  else ff.feature_key
end)
on conflict (feature_key, scope_type, scope_id, environment) do update
set enabled = excluded.enabled, updated_at = now();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.platform_feature_flags enable row level security;
alter table public.platform_feature_flag_versions enable row level security;
alter table public.platform_plan_entitlements enable row level security;
alter table public.platform_company_licenses enable row level security;

create policy platform_feature_flags_select on public.platform_feature_flags
  for select using (auth.role() = 'authenticated');

create policy platform_feature_flags_write on public.platform_feature_flags
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
    or scope_type = 'company' and scope_id in (
      select company_id::text from public.profiles where id = auth.uid()
    )
  );

create policy platform_feature_flag_versions_select on public.platform_feature_flag_versions
  for select using (
    tenant_id is null
    or tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy platform_plan_entitlements_select on public.platform_plan_entitlements
  for select using (auth.role() = 'authenticated');

create policy platform_company_licenses_select on public.platform_company_licenses
  for select using (
    tenant_id in (select company_id from public.profiles where id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

create policy platform_company_licenses_write on public.platform_company_licenses
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
  );

-- ── Permissions ──────────────────────────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('feature_flags.read', 'Feature Flags', 'Feature Flags', 'Read', 'View feature flag state'),
  ('feature_flags.write', 'Feature Flags', 'Feature Flags', 'Write', 'Manage feature flags'),
  ('feature_flags.publish', 'Feature Flags', 'Feature Flags', 'Publish', 'Publish feature flag changes'),
  ('licenses.read', 'Licenses', 'Licenses', 'Read', 'View license and entitlements'),
  ('licenses.write', 'Licenses', 'Licenses', 'Write', 'Manage company licenses'),
  ('licenses.assign', 'Licenses', 'Licenses', 'Assign', 'Assign plans and add-ons'),
  ('configuration.notifications.read', 'Configuration', 'Notifications', 'Read', 'View notification configuration'),
  ('configuration.notifications.write', 'Configuration', 'Notifications', 'Write', 'Edit notification configuration')
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
    ('admin', 'feature_flags.read'),
    ('admin', 'feature_flags.write'),
    ('admin', 'feature_flags.publish'),
    ('admin', 'licenses.read'),
    ('admin', 'licenses.write'),
    ('admin', 'licenses.assign'),
    ('admin', 'configuration.notifications.read'),
    ('admin', 'configuration.notifications.write'),
    ('manager', 'feature_flags.read'),
    ('manager', 'licenses.read'),
    ('employee', 'feature_flags.read'),
    ('employee', 'licenses.read')
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
    'feature_flags.read',
    'feature_flags.write',
    'feature_flags.publish',
    'licenses.read',
    'licenses.write',
    'licenses.assign',
    'configuration.notifications.read',
    'configuration.notifications.write'
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
  alter publication supabase_realtime add table public.platform_feature_flags;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.platform_company_licenses;
exception when duplicate_object then null;
end $$;
