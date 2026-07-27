-- ============================================================
-- Sprint AI-Platform: Centralized platform-managed AI providers
-- Elevates provider credentials from tenant scope to platform scope.
-- ============================================================

create extension if not exists pgcrypto;

-- ── 1. Platform provider catalog ────────────────────────────

create table if not exists public.platform_ai_providers (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique,
  display_name text not null,
  description text not null default '',
  is_enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_ai_providers_updated_at on public.platform_ai_providers;
create trigger platform_ai_providers_updated_at
  before update on public.platform_ai_providers
  for each row execute procedure public.set_updated_at();

create index if not exists idx_platform_ai_providers_key
  on public.platform_ai_providers(provider_key)
  where is_enabled = true;

-- ── 2. Default models per use case ──────────────────────────

create table if not exists public.platform_ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.platform_ai_providers(id) on delete cascade,
  use_case text not null check (use_case in ('chat', 'tool_calling', 'embeddings', 'vision', 'audio')),
  model_name text not null,
  is_default boolean not null default false,
  is_enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, use_case, model_name)
);

drop trigger if exists platform_ai_models_updated_at on public.platform_ai_models;
create trigger platform_ai_models_updated_at
  before update on public.platform_ai_models
  for each row execute procedure public.set_updated_at();

create unique index if not exists idx_platform_ai_models_one_default
  on public.platform_ai_models(provider_id, use_case)
  where is_default = true and is_enabled = true;

-- ── 3. Encrypted API keys (platform admin only) ─────────────

create table if not exists public.platform_ai_provider_keys (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.platform_ai_providers(id) on delete cascade,
  key_label text not null default 'primary',
  encrypted_key bytea not null,
  key_hint text,
  is_active boolean not null default true,
  rotated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_ai_provider_keys_updated_at on public.platform_ai_provider_keys;
create trigger platform_ai_provider_keys_updated_at
  before update on public.platform_ai_provider_keys
  for each row execute procedure public.set_updated_at();

create unique index if not exists idx_platform_ai_provider_keys_one_active
  on public.platform_ai_provider_keys(provider_id)
  where is_active = true;

-- ── 4. Rate limits ──────────────────────────────────────────

create table if not exists public.platform_ai_limits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  scope text not null default 'company' check (scope in ('platform', 'company', 'user')),
  window_type text not null check (window_type in ('minute', 'day', 'month')),
  max_requests integer,
  max_tokens integer,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_ai_limits_updated_at on public.platform_ai_limits;
create trigger platform_ai_limits_updated_at
  before update on public.platform_ai_limits
  for each row execute procedure public.set_updated_at();

create index if not exists idx_platform_ai_limits_company
  on public.platform_ai_limits(company_id)
  where is_enabled = true;

-- ── 5. Usage telemetry ───────────────────────────────────────

create table if not exists public.platform_ai_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  provider_key text not null,
  model text not null,
  use_case text not null default 'chat',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6),
  latency_ms integer,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed', 'timeout', 'denied')),
  error_code text,
  conversation_id uuid,
  execution_id uuid,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_platform_ai_usage_company_recorded
  on public.platform_ai_usage(company_id, recorded_at desc);

create index if not exists idx_platform_ai_usage_provider
  on public.platform_ai_usage(provider_key, recorded_at desc);

-- ── 6. Per-company feature flags ────────────────────────────

create table if not exists public.platform_ai_feature_flags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_key text not null check (feature_key in (
    'ai_chat', 'tool_calling', 'knowledge', 'automation', 'voice', 'embeddings'
  )),
  is_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, feature_key)
);

drop trigger if exists platform_ai_feature_flags_updated_at on public.platform_ai_feature_flags;
create trigger platform_ai_feature_flags_updated_at
  before update on public.platform_ai_feature_flags
  for each row execute procedure public.set_updated_at();

-- ── 7. Tenant connections reference platform keys ───────────

alter table public.ai_provider_connections
  add column if not exists uses_platform_key boolean not null default true;

comment on column public.ai_provider_connections.uses_platform_key is
  'When true, runtime resolves API credentials from platform_ai_provider_keys.';

-- ── 8. Crypto helpers ───────────────────────────────────────

create or replace function public.platform_ai_crypto_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(current_setting('app.platform_crypto_key', true)), ''),
    nullif(trim(current_setting('vault.platform_crypto_key', true)), ''),
    nullif(trim(current_setting('app.openai_api_key', true)), ''),
    nullif(trim(current_setting('vault.openai_api_key', true)), '')
  );
$$;

create or replace function public.platform_ai_encrypt_key(p_plaintext text)
returns bytea
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if not public.is_super_admin() then
    raise exception 'access denied';
  end if;
  v_secret := public.platform_ai_crypto_secret();
  if v_secret is null or length(trim(v_secret)) = 0 then
    raise exception 'platform crypto secret is not configured';
  end if;
  return pgp_sym_encrypt(p_plaintext, v_secret);
end;
$$;

create or replace function public.platform_ai_decrypt_key(p_encrypted bytea)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  v_secret := public.platform_ai_crypto_secret();
  if v_secret is null or length(trim(v_secret)) = 0 then
    raise exception 'platform crypto secret is not configured';
  end if;
  return pgp_sym_decrypt(p_encrypted, v_secret);
end;
$$;

-- ── 9. Feature flag check ───────────────────────────────────

create or replace function public.platform_ai_feature_enabled(
  p_company_id uuid,
  p_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or coalesce(
      (
        select ff.is_enabled
        from public.platform_ai_feature_flags ff
        where ff.company_id = p_company_id
          and ff.feature_key = p_feature_key
        limit 1
      ),
      true
    );
$$;

-- ── 10. Runtime config resolver (execution-only) ─────────────

create or replace function public.platform_resolve_ai_runtime_config(
  p_company_id uuid,
  p_provider_key text default 'openai',
  p_use_case text default 'chat'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_provider public.platform_ai_providers%rowtype;
  v_model public.platform_ai_models%rowtype;
  v_key record;
  v_api_key text;
  v_feature text;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not public.is_super_admin()
     and p_company_id is distinct from public.current_company_id() then
    raise exception 'access denied for company %', p_company_id;
  end if;

  v_feature := case p_use_case
    when 'embeddings' then 'embeddings'
    when 'tool_calling' then 'tool_calling'
    else 'ai_chat'
  end;

  if not public.platform_ai_feature_enabled(p_company_id, v_feature) then
    raise exception 'AI feature % is disabled for this company', v_feature;
  end if;

  select * into v_provider
  from public.platform_ai_providers pap
  where pap.provider_key = p_provider_key
    and pap.is_enabled = true
  limit 1;

  if not found then
    raise exception 'platform provider % is not configured', p_provider_key;
  end if;

  select * into v_model
  from public.platform_ai_models pam
  where pam.provider_id = v_provider.id
    and pam.use_case = p_use_case
    and pam.is_enabled = true
  order by pam.is_default desc, pam.created_at asc
  limit 1;

  if not found then
    select * into v_model
    from public.platform_ai_models pam
    where pam.provider_id = v_provider.id
      and pam.use_case = 'chat'
      and pam.is_enabled = true
    order by pam.is_default desc, pam.created_at asc
    limit 1;
  end if;

  select pk.encrypted_key, pk.key_hint
  into v_key
  from public.platform_ai_provider_keys pk
  where pk.provider_id = v_provider.id
    and pk.is_active = true
  order by pk.created_at desc
  limit 1;

  if v_key.encrypted_key is null then
    raise exception 'platform provider key for % is not configured', p_provider_key;
  end if;

  v_api_key := public.platform_ai_decrypt_key(v_key.encrypted_key);

  return jsonb_build_object(
    'providerKey', v_provider.provider_key,
    'model', coalesce(v_model.model_name, v_provider.configuration->>'defaultModel', 'gpt-4o-mini'),
    'apiKey', v_api_key,
    'baseUrl', coalesce(v_provider.configuration->>'baseUrl', 'https://api.openai.com/v1'),
    'useCase', p_use_case,
    'usesPlatformKey', true
  );
end;
$$;

grant execute on function public.platform_ai_feature_enabled(uuid, text) to authenticated;
grant execute on function public.platform_resolve_ai_runtime_config(uuid, text, text) to authenticated;

grant execute on function public.platform_ai_encrypt_key(text) to authenticated;
grant execute on function public.platform_ai_decrypt_key(bytea) to service_role;

-- ── 11. Sanitize tenant connection reads ─────────────────────

create or replace function public.sanitize_provider_connection_configuration(
  p_configuration jsonb,
  p_uses_platform_key boolean
)
returns jsonb
language sql
stable
as $$
  select case
    when p_uses_platform_key then
      coalesce(p_configuration, '{}'::jsonb) - 'apiKey' - 'api_key' - 'secret' - 'token'
    else
      coalesce(p_configuration, '{}'::jsonb) - 'apiKey' - 'api_key' - 'secret' - 'token'
  end;
$$;

-- ── 12. RLS ─────────────────────────────────────────────────

alter table public.platform_ai_providers enable row level security;
alter table public.platform_ai_models enable row level security;
alter table public.platform_ai_provider_keys enable row level security;
alter table public.platform_ai_limits enable row level security;
alter table public.platform_ai_usage enable row level security;
alter table public.platform_ai_feature_flags enable row level security;

-- Providers & models: metadata readable by authenticated; writes super-admin only
drop policy if exists platform_ai_providers_select on public.platform_ai_providers;
create policy platform_ai_providers_select on public.platform_ai_providers for select using (
  auth.role() = 'authenticated'
);

drop policy if exists platform_ai_providers_write on public.platform_ai_providers;
create policy platform_ai_providers_write on public.platform_ai_providers for all using (
  public.is_super_admin()
) with check (public.is_super_admin());

drop policy if exists platform_ai_models_select on public.platform_ai_models;
create policy platform_ai_models_select on public.platform_ai_models for select using (
  auth.role() = 'authenticated'
);

drop policy if exists platform_ai_models_write on public.platform_ai_models;
create policy platform_ai_models_write on public.platform_ai_models for all using (
  public.is_super_admin()
) with check (public.is_super_admin());

-- Keys: super-admin only (never exposed to tenants)
drop policy if exists platform_ai_provider_keys_select on public.platform_ai_provider_keys;
create policy platform_ai_provider_keys_select on public.platform_ai_provider_keys for select using (
  public.is_super_admin()
);

drop policy if exists platform_ai_provider_keys_write on public.platform_ai_provider_keys;
create policy platform_ai_provider_keys_write on public.platform_ai_provider_keys for all using (
  public.is_super_admin()
) with check (public.is_super_admin());

-- Limits: super-admin manages; companies read own
drop policy if exists platform_ai_limits_select on public.platform_ai_limits;
create policy platform_ai_limits_select on public.platform_ai_limits for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or company_id is null
    or company_id = public.current_company_id()
  )
);

drop policy if exists platform_ai_limits_write on public.platform_ai_limits;
create policy platform_ai_limits_write on public.platform_ai_limits for all using (
  public.is_super_admin()
) with check (public.is_super_admin());

-- Usage: company-scoped read; insert via service role / RPC only for tenants
drop policy if exists platform_ai_usage_select on public.platform_ai_usage;
create policy platform_ai_usage_select on public.platform_ai_usage for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or company_id = public.current_company_id()
  )
);

drop policy if exists platform_ai_usage_insert on public.platform_ai_usage;
create policy platform_ai_usage_insert on public.platform_ai_usage for insert with check (
  public.is_super_admin()
  or company_id = public.current_company_id()
);

-- Feature flags: super-admin write; company read own
drop policy if exists platform_ai_feature_flags_select on public.platform_ai_feature_flags;
create policy platform_ai_feature_flags_select on public.platform_ai_feature_flags for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or company_id = public.current_company_id()
  )
);

drop policy if exists platform_ai_feature_flags_write on public.platform_ai_feature_flags;
create policy platform_ai_feature_flags_write on public.platform_ai_feature_flags for all using (
  public.is_super_admin()
) with check (public.is_super_admin());

-- Deny tenant provider management (read metadata only, no secrets)
drop policy if exists ai_provider_connections_insert on public.ai_provider_connections;
create policy ai_provider_connections_insert on public.ai_provider_connections for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'ai.providers.manage')
      and uses_platform_key = true
      and not (configuration ? 'apiKey')
      and not (configuration ? 'api_key')
    )
  )
);

drop policy if exists ai_provider_connections_update on public.ai_provider_connections;
create policy ai_provider_connections_update on public.ai_provider_connections for update
using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'ai.providers.manage')
    )
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'ai.providers.manage')
      and uses_platform_key = true
      and not (configuration ? 'apiKey')
      and not (configuration ? 'api_key')
    )
  )
);

-- ── 13. Seed platform OpenAI provider ───────────────────────

insert into public.platform_ai_providers (provider_key, display_name, description, is_enabled, configuration)
values (
  'openai',
  'OpenAI',
  'Platform-managed OpenAI provider',
  true,
  jsonb_build_object('baseUrl', 'https://api.openai.com/v1', 'defaultModel', 'gpt-4o-mini')
)
on conflict (provider_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  configuration = excluded.configuration,
  updated_at = now();

insert into public.platform_ai_models (provider_id, use_case, model_name, is_default, is_enabled)
select p.id, v.use_case, v.model_name, true, true
from public.platform_ai_providers p
cross join (
  values
    ('chat', 'gpt-4o-mini'),
    ('tool_calling', 'gpt-4o-mini'),
    ('embeddings', 'text-embedding-3-small'),
    ('vision', 'gpt-4o-mini'),
    ('audio', 'gpt-4o-mini')
) as v(use_case, model_name)
where p.provider_key = 'openai'
on conflict (provider_id, use_case, model_name) do update set
  is_default = excluded.is_default,
  is_enabled = excluded.is_enabled,
  updated_at = now();

-- ── 14. Migrate existing tenant API keys → platform ─────────

do $$
declare
  v_provider_id uuid;
  v_existing_key text;
  v_encrypted bytea;
begin
  select id into v_provider_id
  from public.platform_ai_providers
  where provider_key = 'openai'
  limit 1;

  select nullif(trim(c.configuration->>'apiKey'), '')
  into v_existing_key
  from public.ai_provider_connections c
  join public.ai_provider_definitions d on d.id = c.provider_id
  where d.key = 'openai'
    and c.deleted_at is null
    and nullif(trim(c.configuration->>'apiKey'), '') is not null
  order by c.is_default desc, c.updated_at desc
  limit 1;

  if v_existing_key is null then
    v_existing_key := nullif(trim(current_setting('app.openai_api_key', true)), '');
  end if;
  if v_existing_key is null then
    v_existing_key := nullif(trim(current_setting('vault.openai_api_key', true)), '');
  end if;

  if v_existing_key is not null
     and v_provider_id is not null
     and public.platform_ai_crypto_secret() is not null then
    v_encrypted := pgp_sym_encrypt(v_existing_key, public.platform_ai_crypto_secret());

    update public.platform_ai_provider_keys
    set is_active = false, updated_at = now()
    where provider_id = v_provider_id and is_active = true;

    insert into public.platform_ai_provider_keys (
      provider_id, key_label, encrypted_key, key_hint, is_active
    ) values (
      v_provider_id,
      'migrated-primary',
      v_encrypted,
      right(v_existing_key, 4),
      true
    );
  end if;
end $$;

-- Strip tenant-stored keys; all connections use platform key
update public.ai_provider_connections c
set
  uses_platform_key = true,
  configuration = c.configuration - 'apiKey' - 'api_key' - 'secret' - 'token',
  updated_at = now()
where c.deleted_at is null
  and (
    c.configuration ? 'apiKey'
    or c.configuration ? 'api_key'
    or coalesce(c.uses_platform_key, true) = true
  );

-- Enable AI features for all existing companies (backward compatible)
insert into public.platform_ai_feature_flags (company_id, feature_key, is_enabled)
select c.id, f.feature_key, true
from public.companies c
cross join (
  values ('ai_chat'), ('tool_calling'), ('knowledge'), ('automation'), ('voice'), ('embeddings')
) as f(feature_key)
on conflict (company_id, feature_key) do nothing;

comment on table public.platform_ai_providers is
  'Platform-managed AI provider catalog. Credentials stored separately in platform_ai_provider_keys.';
comment on function public.platform_resolve_ai_runtime_config(uuid, text, text) is
  'Execution-only resolver: returns decrypted platform credentials for runtime. Not for admin UI display.';
