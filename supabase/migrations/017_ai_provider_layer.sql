-- ============================================================
-- Vault OS – Phase 2 Sprint 2.6: AI Provider Abstraction Layer
-- ============================================================

-- ── ai_provider_definitions (global catalog) ──────────────────

create table if not exists public.ai_provider_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  description text not null default '',
  icon text,
  supports_generate boolean not null default true,
  supports_classify boolean not null default true,
  supports_embed boolean not null default true,
  supports_streaming boolean not null default false,
  configuration_schema jsonb not null default '{}'::jsonb,
  default_configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_provider_definitions_updated_at on public.ai_provider_definitions;
create trigger ai_provider_definitions_updated_at
  before update on public.ai_provider_definitions
  for each row execute procedure public.set_updated_at();

create index if not exists idx_ai_provider_definitions_key
  on public.ai_provider_definitions(key);

create index if not exists idx_ai_provider_definitions_is_active
  on public.ai_provider_definitions(is_active)
  where is_active = true;

-- ── ai_provider_connections (tenant connections) ──────────────

create table if not exists public.ai_provider_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_id uuid not null references public.ai_provider_definitions(id) on delete restrict,
  display_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'disabled', 'error')),
  configuration jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  is_enabled boolean not null default false,
  health_status text not null default 'unknown'
    check (health_status in ('connected', 'disconnected', 'warning', 'error', 'unknown')),
  last_health_check timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

drop trigger if exists ai_provider_connections_updated_at on public.ai_provider_connections;
create trigger ai_provider_connections_updated_at
  before update on public.ai_provider_connections
  for each row execute procedure public.set_updated_at();

create index if not exists idx_ai_provider_connections_company_id
  on public.ai_provider_connections(company_id)
  where deleted_at is null;

create index if not exists idx_ai_provider_connections_provider_id
  on public.ai_provider_connections(provider_id)
  where deleted_at is null;

create index if not exists idx_ai_provider_connections_company_enabled
  on public.ai_provider_connections(company_id, is_enabled)
  where deleted_at is null;

create index if not exists idx_ai_provider_connections_company_health
  on public.ai_provider_connections(company_id, health_status)
  where deleted_at is null;

create unique index if not exists idx_ai_provider_connections_one_default
  on public.ai_provider_connections(company_id)
  where is_default = true and deleted_at is null;

create index if not exists idx_ai_provider_connections_deleted_at
  on public.ai_provider_connections(deleted_at)
  where deleted_at is not null;

-- ── Row Level Security ────────────────────────────────────────

alter table public.ai_provider_definitions enable row level security;
alter table public.ai_provider_connections enable row level security;

drop policy if exists ai_provider_definitions_select on public.ai_provider_definitions;
create policy ai_provider_definitions_select
  on public.ai_provider_definitions for select
  using (auth.role() = 'authenticated');

drop policy if exists ai_provider_definitions_write on public.ai_provider_definitions;
create policy ai_provider_definitions_write
  on public.ai_provider_definitions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists ai_provider_connections_select on public.ai_provider_connections;
create policy ai_provider_connections_select
  on public.ai_provider_connections for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_provider_connections_insert on public.ai_provider_connections;
create policy ai_provider_connections_insert
  on public.ai_provider_connections for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_provider_connections_update on public.ai_provider_connections;
create policy ai_provider_connections_update
  on public.ai_provider_connections for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

-- ── RBAC permissions ──────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('ai.providers.view', 'AI', 'Providers', 'View', 'View AI provider definitions and company connections'),
  ('ai.providers.manage', 'AI', 'Providers', 'Manage', 'Manage AI provider connections and configuration')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── seed provider definitions ─────────────────────────────────

insert into public.ai_provider_definitions (
  key,
  display_name,
  description,
  icon,
  supports_generate,
  supports_classify,
  supports_embed,
  supports_streaming,
  configuration_schema,
  default_configuration,
  is_active,
  version
)
values
  (
    'openai',
    'OpenAI',
    'OpenAI-compatible provider adapter.',
    'openai',
    true,
    true,
    true,
    false,
    '{"type":"object","properties":{"model":{"type":"string"},"baseUrl":{"type":"string"},"organizationId":{"type":"string"}},"required":["model"]}'::jsonb,
    '{"model":"gpt-4o-mini"}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'claude',
    'Claude',
    'Anthropic Claude provider adapter.',
    'claude',
    true,
    true,
    true,
    false,
    '{"type":"object","properties":{"model":{"type":"string"},"apiVersion":{"type":"string"}},"required":["model"]}'::jsonb,
    '{"model":"claude-3-5-sonnet-latest"}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'gemini',
    'Gemini',
    'Google Gemini provider adapter.',
    'gemini',
    true,
    true,
    true,
    false,
    '{"type":"object","properties":{"model":{"type":"string"},"projectId":{"type":"string"}},"required":["model"]}'::jsonb,
    '{"model":"gemini-1.5-flash"}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'azure_openai',
    'Azure OpenAI',
    'Azure OpenAI provider adapter.',
    'azure',
    true,
    true,
    true,
    false,
    '{"type":"object","properties":{"model":{"type":"string"},"deploymentName":{"type":"string"},"endpoint":{"type":"string"},"apiVersion":{"type":"string"}},"required":["model","deploymentName","endpoint"]}'::jsonb,
    '{"model":"gpt-4o-mini","apiVersion":"2024-02-01"}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'deepseek',
    'DeepSeek',
    'DeepSeek provider adapter.',
    'deepseek',
    true,
    true,
    true,
    false,
    '{"type":"object","properties":{"model":{"type":"string"},"baseUrl":{"type":"string"}},"required":["model"]}'::jsonb,
    '{"model":"deepseek-chat"}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'ollama',
    'Ollama',
    'Local Ollama provider adapter.',
    'ollama',
    true,
    true,
    true,
    false,
    '{"type":"object","properties":{"model":{"type":"string"},"baseUrl":{"type":"string"}},"required":["model","baseUrl"]}'::jsonb,
    '{"model":"llama3","baseUrl":"http://localhost:11434"}'::jsonb,
    true,
    '1.0.0'
  ),
  (
    'local_models',
    'Local Models',
    'Generic local model runtime adapter.',
    'local',
    true,
    true,
    true,
    false,
    '{"type":"object","properties":{"model":{"type":"string"},"runtimeEndpoint":{"type":"string"}},"required":["model","runtimeEndpoint"]}'::jsonb,
    '{"model":"local-default","runtimeEndpoint":"http://localhost:8080"}'::jsonb,
    true,
    '1.0.0'
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  icon = excluded.icon,
  supports_generate = excluded.supports_generate,
  supports_classify = excluded.supports_classify,
  supports_embed = excluded.supports_embed,
  supports_streaming = excluded.supports_streaming,
  configuration_schema = excluded.configuration_schema,
  default_configuration = excluded.default_configuration,
  version = excluded.version,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.ai_provider_connection_audit_events(
  p_old public.ai_provider_connections,
  p_new public.ai_provider_connections,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_events jsonb := '[]'::jsonb;
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('provider_connected');
  end if;

  if p_old.is_enabled is distinct from p_new.is_enabled then
    if p_new.is_enabled then
      v_events := v_events || jsonb_build_array('provider_enabled');
    else
      v_events := v_events || jsonb_build_array('provider_disabled');
    end if;
  end if;

  if p_old.configuration is distinct from p_new.configuration
     or p_old.display_name is distinct from p_new.display_name
     or p_old.status is distinct from p_new.status then
    v_events := v_events || jsonb_build_array('provider_updated');
  end if;

  if p_old.health_status is distinct from p_new.health_status then
    v_events := v_events || jsonb_build_array('provider_health_changed');
  end if;

  if p_old.deleted_at is distinct from p_new.deleted_at and p_new.deleted_at is not null then
    v_events := v_events || jsonb_build_array('provider_disabled');
  end if;

  return v_events;
end;
$$;

create or replace function public.write_ai_provider_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity_id text;
  v_company_id uuid;
  v_metadata jsonb := '{}'::jsonb;
  v_provider_key text;
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  v_entity_id := coalesce(new.id, old.id)::text;

  if TG_TABLE_NAME = 'ai_provider_definitions' then
    v_company_id := public.current_company_id();
    v_metadata := jsonb_build_object(
      'key', coalesce(new.key, old.key),
      'display_name', coalesce(new.display_name, old.display_name)
    );
  elsif TG_TABLE_NAME = 'ai_provider_connections' then
    v_company_id := coalesce(new.company_id, old.company_id);
    select key into v_provider_key
    from public.ai_provider_definitions
    where id = coalesce(new.provider_id, old.provider_id);

    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'events', public.ai_provider_connection_audit_events(old, new, TG_OP),
        'display_name', new.display_name,
        'provider_key', v_provider_key,
        'status', new.status,
        'is_enabled', new.is_enabled
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'events', public.ai_provider_connection_audit_events(old, new, TG_OP),
        'display_name', new.display_name,
        'provider_key', v_provider_key,
        'old', jsonb_build_object(
          'status', old.status,
          'is_enabled', old.is_enabled,
          'health_status', old.health_status
        ),
        'new', jsonb_build_object(
          'status', new.status,
          'is_enabled', new.is_enabled,
          'health_status', new.health_status
        )
      );
    else
      v_metadata := jsonb_build_object(
        'display_name', old.display_name,
        'provider_key', v_provider_key,
        'events', jsonb_build_array('provider_disabled')
      );
    end if;
  end if;

  insert into public.audit_logs (
    user_id,
    company_id,
    action,
    entity,
    entity_id,
    ip_address,
    metadata,
    created_at
  )
  values (
    auth.uid(),
    v_company_id,
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    public.request_ip_address(),
    v_metadata,
    now()
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_ai_provider_definitions on public.ai_provider_definitions;
create trigger trg_audit_ai_provider_definitions
  after insert or update or delete on public.ai_provider_definitions
  for each row execute procedure public.write_ai_provider_audit_log();

drop trigger if exists trg_audit_ai_provider_connections on public.ai_provider_connections;
create trigger trg_audit_ai_provider_connections
  after insert or update or delete on public.ai_provider_connections
  for each row execute procedure public.write_ai_provider_audit_log();
