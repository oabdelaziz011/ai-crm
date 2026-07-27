-- ============================================================
-- Vault OS – Sprint 7.3 Enterprise Integration Hub & Public API
-- API keys, OAuth, webhooks, event bus, connectors, audit
-- ============================================================

insert into public.permissions (code, category, module, action, description)
values
  ('integrations.view', 'Integrations', 'Integration Hub', 'View', 'View integration hub dashboard'),
  ('integrations.manage', 'Integrations', 'Integration Hub', 'Manage', 'Manage API keys, OAuth clients, and webhooks'),
  ('integrations.api_keys', 'Integrations', 'Integration Hub', 'API Keys', 'Create and rotate API keys'),
  ('integrations.webhooks', 'Integrations', 'Integration Hub', 'Webhooks', 'Manage webhook subscriptions')
on conflict (code) do nothing;

-- ── API Keys ─────────────────────────────────────────────────

create table if not exists public.integration_api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  ip_allowlist text[] not null default '{}',
  is_active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  usage_count bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  rotated_from_id uuid references public.integration_api_keys(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integration_api_keys_company
  on public.integration_api_keys(company_id, is_active);
create unique index if not exists idx_integration_api_keys_hash
  on public.integration_api_keys(key_hash);

-- ── OAuth clients ────────────────────────────────────────────

create table if not exists public.integration_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  client_id text not null unique,
  client_secret_hash text not null,
  redirect_uris text[] not null default '{}',
  grant_types text[] not null default '{client_credentials,authorization_code}',
  scopes text[] not null default '{}',
  is_confidential boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integration_oauth_clients_company
  on public.integration_oauth_clients(company_id, is_active);

-- ── OAuth tokens ─────────────────────────────────────────────

create table if not exists public.integration_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.integration_oauth_clients(id) on delete cascade,
  token_hash text not null unique,
  refresh_token_hash text,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_oauth_tokens_client
  on public.integration_oauth_tokens(client_id, expires_at);

-- ── Webhook subscriptions ────────────────────────────────────

create table if not exists public.integration_webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  endpoint_url text not null,
  secret_hash text not null,
  event_types text[] not null default '{}',
  is_active boolean not null default true,
  is_paused boolean not null default false,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integration_webhook_subs_company
  on public.integration_webhook_subscriptions(company_id, is_active);

-- ── Webhook deliveries ───────────────────────────────────────

create table if not exists public.integration_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid not null references public.integration_webhook_subscriptions(id) on delete cascade,
  event_type text not null,
  event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed', 'dead_letter')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  response_status integer,
  response_body text,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subscription_id, event_id)
);

create index if not exists idx_integration_webhook_deliveries_status
  on public.integration_webhook_deliveries(status, next_retry_at)
  where status in ('pending', 'failed');

-- ── Event bus registry ───────────────────────────────────────

create table if not exists public.integration_event_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null,
  event_id text not null,
  source_platform text not null,
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  unique (company_id, event_type, event_id)
);

create index if not exists idx_integration_event_log_company
  on public.integration_event_log(company_id, published_at desc);

-- ── Connector registry ───────────────────────────────────────

create table if not exists public.integration_connectors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connector_type text not null
    check (connector_type in (
      'accounting', 'erp', 'laboratory', 'radiology', 'insurance',
      'email', 'sms', 'whatsapp', 'calendar', 'identity', 'storage', 'custom'
    )),
  name text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  health_status text not null default 'unknown'
    check (health_status in ('healthy', 'degraded', 'unhealthy', 'unknown')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integration_connectors_company
  on public.integration_connectors(company_id, connector_type);

-- ── API audit log ──────────────────────────────────────────────

create table if not exists public.integration_api_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  auth_type text not null check (auth_type in ('api_key', 'oauth', 'service_account')),
  auth_id uuid,
  method text not null,
  path text not null,
  api_version text not null default 'v1',
  status_code integer not null,
  latency_ms integer,
  ip_address inet,
  scopes text[] not null default '{}',
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_api_audit_company
  on public.integration_api_audit_log(company_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.integration_api_keys enable row level security;
alter table public.integration_oauth_clients enable row level security;
alter table public.integration_oauth_tokens enable row level security;
alter table public.integration_webhook_subscriptions enable row level security;
alter table public.integration_webhook_deliveries enable row level security;
alter table public.integration_event_log enable row level security;
alter table public.integration_connectors enable row level security;
alter table public.integration_api_audit_log enable row level security;

create policy integration_api_keys_tenant on public.integration_api_keys
  for all using (company_id = public.get_user_company_id());

create policy integration_oauth_clients_tenant on public.integration_oauth_clients
  for all using (company_id = public.get_user_company_id());

create policy integration_oauth_tokens_tenant on public.integration_oauth_tokens
  for all using (company_id = public.get_user_company_id());

create policy integration_webhook_subs_tenant on public.integration_webhook_subscriptions
  for all using (company_id = public.get_user_company_id());

create policy integration_webhook_deliveries_tenant on public.integration_webhook_deliveries
  for all using (company_id = public.get_user_company_id());

create policy integration_event_log_tenant on public.integration_event_log
  for all using (company_id = public.get_user_company_id());

create policy integration_connectors_tenant on public.integration_connectors
  for all using (company_id = public.get_user_company_id());

create policy integration_api_audit_tenant on public.integration_api_audit_log
  for all using (company_id = public.get_user_company_id());

-- ── RPC: validate API key (service role) ─────────────────────

create or replace function public.integration_validate_api_key(p_key_hash text)
returns table (
  key_id uuid,
  company_id uuid,
  scopes text[],
  ip_allowlist text[],
  is_active boolean,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, company_id, scopes, ip_allowlist, is_active, expires_at
  from public.integration_api_keys
  where key_hash = p_key_hash
  limit 1;
$$;

-- ── RPC: record API key usage ────────────────────────────────

create or replace function public.integration_record_api_key_usage(p_key_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.integration_api_keys
  set usage_count = usage_count + 1, last_used_at = now(), updated_at = now()
  where id = p_key_id;
$$;
