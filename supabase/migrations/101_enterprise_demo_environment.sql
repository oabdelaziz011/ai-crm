-- ============================================================
-- Vault OS – Permanent Enterprise Demo Environment (v1)
-- Architecture: enterprise-billing-platform-v2.1 §9
--
-- Idempotent: safe to run seed multiple times (no duplicates).
-- Removable: select public.teardown_enterprise_demo_v1();
-- Re-seed:   select public.seed_enterprise_demo_v1();
--
-- Demo password (all users): DemoVault2026!
-- ============================================================

create extension if not exists pgcrypto;

-- ── Demo-only staging tables (leads/deals/tasks + API key metadata) ──

create table if not exists public.demo_environment_manifest (
  env_key text primary key default 'vaultos_enterprise_v1',
  version integer not null default 1,
  seeded_at timestamptz,
  last_seed_at timestamptz,
  metadata jsonb not null default '{"demo": true}'::jsonb
);

insert into public.demo_environment_manifest (env_key, version, metadata)
values ('vaultos_enterprise_v1', 1, '{"demo": true, "label": "VaultOS Enterprise Demo"}'::jsonb)
on conflict (env_key) do nothing;

create table if not exists public.demo_environment_registry (
  entity_table text not null,
  entity_id uuid not null,
  demo_env text not null default 'vaultos_enterprise_v1',
  created_at timestamptz not null default now(),
  primary key (entity_table, entity_id)
);

create table if not exists public.demo_crm_scenarios (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  scenario_type text not null check (scenario_type in (
    'lead_hot', 'lead_cold', 'deal_won', 'deal_lost', 'opportunity_open',
    'customer_archived', 'task', 'note', 'activity', 'contact'
  )),
  title text not null,
  status text,
  owner_user_id uuid references auth.users(id) on delete set null,
  related_customer_id uuid references public.customers(id) on delete set null,
  metadata jsonb not null default '{"demo": true, "demo_env": "vaultos_enterprise_v1"}'::jsonb,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_demo_crm_scenarios_company
  on public.demo_crm_scenarios(company_id, scenario_type);

create table if not exists public.demo_api_credentials (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_last_four text not null default 'DEMO',
  scopes text[] not null default '{}'::text[],
  is_active boolean not null default true,
  metadata jsonb not null default '{"demo": true, "demo_env": "vaultos_enterprise_v1"}'::jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

alter table public.demo_crm_scenarios enable row level security;
alter table public.demo_api_credentials enable row level security;
alter table public.demo_environment_registry enable row level security;

drop policy if exists demo_crm_scenarios_select on public.demo_crm_scenarios;
create policy demo_crm_scenarios_select on public.demo_crm_scenarios for select
  using (auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id()));

drop policy if exists demo_api_credentials_select on public.demo_api_credentials;
create policy demo_api_credentials_select on public.demo_api_credentials for select
  using (auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id()));

drop policy if exists demo_registry_service on public.demo_environment_registry;
create policy demo_registry_service on public.demo_environment_registry for all using (false) with check (false);

-- ── Helpers ───────────────────────────────────────────────────

create or replace function public._demo_register(p_table text, p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.demo_environment_registry (entity_table, entity_id)
  values (p_table, p_id)
  on conflict do nothing;
$$;

create or replace function public._demo_auth_user(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_password text default 'DemoVault2026!'
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', p_user_id, 'authenticated', 'authenticated',
    p_email, crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'demo', true),
    jsonb_build_object('full_name', p_full_name, 'demo_env', 'vaultos_enterprise_v1'),
    now(), now(), '', '', '', ''
  )
  on conflict (id) do update set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now();

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    p_user_id, p_user_id,
    jsonb_build_object('sub', p_user_id::text, 'email', p_email, 'email_verified', true, 'demo', true),
    'email', p_user_id::text, now(), now(), now()
  )
  on conflict (provider, provider_id) do update set identity_data = excluded.identity_data, updated_at = now();
end;
$$;

-- ── Teardown (safe removal of all demo data) ────────────────

create or replace function public.teardown_enterprise_demo_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_demo_companies uuid[] := array[
    'd0000010-0001-4001-8001-000000000001'::uuid,
    'd0000010-0001-4001-8001-000000000002'::uuid,
    'd0000010-0001-4001-8001-000000000003'::uuid,
    'd0000010-0001-4001-8001-000000000004'::uuid,
    'd0000010-0001-4001-8001-000000000005'::uuid
  ];
  v_demo_users uuid[] := array[
    'd0000001-0001-4001-8001-000000000001'::uuid,
    'd0000002-0001-4001-8001-000000000001'::uuid,
    'd0000002-0001-4001-8001-000000000002'::uuid,
    'd0000002-0001-4001-8001-000000000003'::uuid,
    'd0000002-0001-4001-8001-000000000004'::uuid,
    'd0000002-0001-4001-8001-000000000005'::uuid,
    'd0000002-0001-4001-8001-000000000006'::uuid,
    'd0000002-0001-4001-8001-000000000007'::uuid
  ];
  v_count integer;
begin
  alter table public.companies disable trigger trg_notify_subscription_events;
  alter table public.profiles disable trigger trg_notify_profile_events;
  alter table public.roles disable trigger trg_notify_role_events;

  delete from public.conversation_messages where conversation_id in (
    select id from public.conversations where company_id = any(v_demo_companies)
  );
  delete from public.conversation_participants where conversation_id in (
    select id from public.conversations where company_id = any(v_demo_companies)
  );
  delete from public.ai_execution_metrics where company_id = any(v_demo_companies);
  delete from public.ai_token_cost_records where company_id = any(v_demo_companies);
  delete from public.ai_trace_spans where company_id = any(v_demo_companies);
  delete from public.ai_traces where company_id = any(v_demo_companies);
  delete from public.ai_executions where company_id = any(v_demo_companies);
  delete from public.prompt_builds where company_id = any(v_demo_companies);
  delete from public.conversations where company_id = any(v_demo_companies);
  delete from public.prompt_template_versions where template_id in (
    select id from public.prompt_templates where company_id = any(v_demo_companies)
  );
  delete from public.prompt_templates where company_id = any(v_demo_companies);
  delete from public.knowledge_documents where company_id = any(v_demo_companies);
  delete from public.knowledge_sources where company_id = any(v_demo_companies);
  delete from public.demo_crm_scenarios where company_id = any(v_demo_companies);
  delete from public.demo_api_credentials where company_id = any(v_demo_companies);
  delete from public.notifications where company_id = any(v_demo_companies);
  delete from public.audit_logs where company_id = any(v_demo_companies);
  delete from public.bookings where user_id = any(v_demo_users);
  delete from public.invoices where user_id = any(v_demo_users);
  delete from public.customers where user_id = any(v_demo_users);
  delete from public.billing_notification_events where company_id = any(v_demo_companies);
  delete from public.subscription_events where company_id = any(v_demo_companies);
  delete from public.billing_audit_logs where company_id = any(v_demo_companies);
  delete from public.billing_receipts where company_id = any(v_demo_companies);
  delete from public.billing_invoices where company_id = any(v_demo_companies);
  delete from public.billing_payments where company_id = any(v_demo_companies);
  delete from public.payment_intents where company_id = any(v_demo_companies);
  delete from public.usage_records where company_id = any(v_demo_companies);
  delete from public.usage_aggregates where company_id = any(v_demo_companies);
  delete from public.company_usage_snapshots where company_id = any(v_demo_companies);
  delete from public.company_feature_overrides where company_id = any(v_demo_companies);
  delete from public.company_payment_methods where company_id = any(v_demo_companies);
  delete from public.company_billing_profiles where company_id = any(v_demo_companies);
  delete from public.company_billing_contacts where company_id = any(v_demo_companies);
  delete from public.user_roles where user_id = any(v_demo_users);
  delete from public.role_permissions where role_id in (
    select id from public.roles where company_id = any(v_demo_companies)
  );
  delete from public.roles where company_id = any(v_demo_companies);
  delete from public.company_subscriptions where company_id = any(v_demo_companies);
  delete from public.ai_assistant_settings where company_id = any(v_demo_companies);
  update public.profiles set company_id = null, is_super_admin = false where id = any(v_demo_users);
  delete from public.companies where id = any(v_demo_companies);
  delete from public.demo_environment_registry;
  delete from auth.identities where user_id = any(v_demo_users);
  delete from auth.users where id = any(v_demo_users);

  get diagnostics v_count = row_count;

  update public.demo_environment_manifest
  set last_seed_at = null, metadata = metadata || '{"teardown_at": "' || now()::text || '"}'::jsonb
  where env_key = 'vaultos_enterprise_v1';

  alter table public.companies enable trigger trg_notify_subscription_events;
  alter table public.profiles enable trigger trg_notify_profile_events;
  alter table public.roles enable trigger trg_notify_role_events;

  return jsonb_build_object('status', 'teardown_complete', 'demo_env', 'vaultos_enterprise_v1');
end;
$$;
