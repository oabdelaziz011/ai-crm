-- ============================================================
-- Vault OS – Sprint 7.4 Enterprise Marketplace & Plugin Platform
-- Plugin registry, installations, permissions, audit, health
-- ============================================================

insert into public.permissions (code, category, module, action, description)
values
  ('marketplace.view', 'Marketplace', 'Plugin Platform', 'View', 'View plugin marketplace'),
  ('marketplace.manage', 'Marketplace', 'Plugin Platform', 'Manage', 'Install, enable, disable, and upgrade plugins'),
  ('marketplace.install', 'Marketplace', 'Plugin Platform', 'Install', 'Install plugins from marketplace'),
  ('marketplace.develop', 'Marketplace', 'Plugin Platform', 'Develop', 'Publish and manage custom plugins')
on conflict (code) do nothing;

-- ── Publishers ───────────────────────────────────────────────

create table if not exists public.plugin_publishers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_trusted boolean not null default false,
  public_key text,
  website_url text,
  created_at timestamptz not null default now()
);

-- ── Plugin catalog (registry) ────────────────────────────────

create table if not exists public.plugin_registry (
  id uuid primary key default gen_random_uuid(),
  plugin_id text not null unique,
  name text not null,
  author text not null,
  category text not null default 'general'
    check (category in ('crm', 'scheduling', 'billing', 'communication', 'executive', 'organization', 'portal', 'automation', 'analytics', 'general')),
  description text,
  publisher_id uuid references public.plugin_publishers(id) on delete set null,
  is_official boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plugin_registry_category on public.plugin_registry(category, is_active);

-- ── Plugin versions ──────────────────────────────────────────

create table if not exists public.plugin_versions (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.plugin_registry(id) on delete cascade,
  version text not null,
  min_platform_version text not null default '7.0.0',
  max_platform_version text,
  manifest jsonb not null default '{}'::jsonb,
  permissions text[] not null default '{}',
  dependencies text[] not null default '{}',
  signature_hash text,
  entry_point text not null default 'index.js',
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  unique (registry_id, version)
);

-- ── Installations (per company) ──────────────────────────────

create table if not exists public.plugin_installations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  registry_id uuid not null references public.plugin_registry(id) on delete cascade,
  version_id uuid not null references public.plugin_versions(id) on delete restrict,
  status text not null default 'installed'
    check (status in ('installed', 'enabled', 'disabled', 'upgrading', 'error', 'uninstalled')),
  settings jsonb not null default '{}'::jsonb,
  granted_permissions text[] not null default '{}',
  installed_by uuid references auth.users(id) on delete set null,
  enabled_at timestamptz,
  disabled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, registry_id)
);

create index if not exists idx_plugin_installations_company
  on public.plugin_installations(company_id, status);

-- ── Plugin health ────────────────────────────────────────────

create table if not exists public.plugin_health (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.plugin_installations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'unknown'
    check (status in ('healthy', 'degraded', 'unhealthy', 'crashed', 'unknown')),
  execution_count bigint not null default 0,
  error_count bigint not null default 0,
  avg_execution_ms integer not null default 0,
  last_execution_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  memory_peak_kb integer,
  updated_at timestamptz not null default now(),
  unique (installation_id)
);

-- ── Plugin audit ─────────────────────────────────────────────

create table if not exists public.plugin_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  installation_id uuid references public.plugin_installations(id) on delete set null,
  plugin_id text not null,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_plugin_audit_company
  on public.plugin_audit_log(company_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.plugin_registry enable row level security;
alter table public.plugin_versions enable row level security;
alter table public.plugin_installations enable row level security;
alter table public.plugin_health enable row level security;
alter table public.plugin_audit_log enable row level security;

create policy plugin_registry_read on public.plugin_registry for select using (is_active = true);

create policy plugin_versions_read on public.plugin_versions for select using (is_published = true);

create policy plugin_installations_tenant on public.plugin_installations
  for all using (company_id = public.current_company_id());

create policy plugin_health_tenant on public.plugin_health
  for all using (company_id = public.current_company_id());

create policy plugin_audit_tenant on public.plugin_audit_log
  for all using (company_id = public.current_company_id());

-- ── Seed official plugins ────────────────────────────────────

insert into public.plugin_publishers (slug, name, is_trusted)
values ('valueor', 'ValueOR Official', true)
on conflict (slug) do nothing;

insert into public.plugin_registry (plugin_id, name, author, category, description, is_official)
values
  ('valueor.booking-insights', 'Booking Insights Widget', 'ValueOR', 'scheduling', 'Dashboard widget for booking analytics', true),
  ('valueor.revenue-summary', 'Revenue Summary Widget', 'ValueOR', 'billing', 'Executive revenue widget from billing platform', true),
  ('valueor.customer-timeline', 'Customer Timeline Extension', 'ValueOR', 'crm', 'Extended customer timeline in CRM', true),
  ('valueor.branch-health', 'Branch Health Monitor', 'ValueOR', 'organization', 'Organization branch health dashboard widget', true),
  ('valueor.communication-digest', 'Communication Digest', 'ValueOR', 'communication', 'Daily communication summary widget', true)
on conflict (plugin_id) do nothing;

insert into public.plugin_versions (registry_id, version, manifest, permissions, dependencies)
select r.id, '1.0.0',
  jsonb_build_object(
    'pluginId', r.plugin_id,
    'name', r.name,
    'version', '1.0.0',
    'category', r.category,
    'entryPoints', jsonb_build_object('main', 'index.js'),
    'hooks', jsonb_build_array('dashboard.widget'),
    'events', jsonb_build_array('booking.created', 'booking.updated')
  ),
  case r.category
    when 'scheduling' then array['bookings.read', 'reports.read']
    when 'billing' then array['billing.read', 'reports.read']
    when 'crm' then array['customers.read']
    when 'organization' then array['organization.read']
    when 'communication' then array['communication.send', 'reports.read']
    else array['reports.read']
  end,
  '{}'::text[]
from public.plugin_registry r
where r.is_official = true
on conflict (registry_id, version) do nothing;

-- ── RPC: list enabled plugins for runtime ────────────────────

create or replace function public.plugin_list_enabled(p_company_id uuid)
returns table (
  installation_id uuid,
  plugin_id text,
  version text,
  manifest jsonb,
  granted_permissions text[],
  settings jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    r.plugin_id,
    v.version,
    v.manifest,
    i.granted_permissions,
    i.settings
  from public.plugin_installations i
  join public.plugin_registry r on r.id = i.registry_id
  join public.plugin_versions v on v.id = i.version_id
  where i.company_id = p_company_id
    and i.status = 'enabled';
$$;
