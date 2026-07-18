-- ============================================================
-- Vault OS – Phase 2 Sprint 2.4: Enterprise Tool Router
-- ============================================================

-- ── tool_definitions (global registry) ────────────────────────

create table if not exists public.tool_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  description text not null default '',
  category text not null default 'general',
  version text not null default '1.0.0',
  is_enabled boolean not null default true,
  required_permissions jsonb not null default '[]'::jsonb,
  supported_states jsonb not null default '[]'::jsonb,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  timeout_ms integer not null default 30000
    check (timeout_ms > 0),
  retry_policy jsonb not null default '{"maxAttempts": 1, "backoffMs": 0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists tool_definitions_updated_at on public.tool_definitions;
create trigger tool_definitions_updated_at
  before update on public.tool_definitions
  for each row execute procedure public.set_updated_at();

create index if not exists idx_tool_definitions_key
  on public.tool_definitions(key);

create index if not exists idx_tool_definitions_category
  on public.tool_definitions(category)
  where is_enabled = true;

create index if not exists idx_tool_definitions_is_enabled
  on public.tool_definitions(is_enabled)
  where is_enabled = true;

-- ── tool_executions (tenant-scoped history) ───────────────────

create table if not exists public.tool_executions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  tool_definition_id uuid not null references public.tool_definitions(id) on delete restrict,
  tool_key text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'denied', 'timeout')),
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer
    check (duration_ms is null or duration_ms >= 0),
  triggered_by text not null default 'router'
    check (triggered_by in ('router', 'agent', 'automation', 'llm')),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_tool_executions_company_started
  on public.tool_executions(company_id, started_at desc);

create index if not exists idx_tool_executions_conversation_started
  on public.tool_executions(conversation_id, started_at desc);

create index if not exists idx_tool_executions_tool_key
  on public.tool_executions(company_id, tool_key, started_at desc);

create index if not exists idx_tool_executions_status
  on public.tool_executions(company_id, status)
  where status in ('pending', 'running', 'failed', 'timeout');

-- ── Row Level Security ────────────────────────────────────────

alter table public.tool_definitions enable row level security;
alter table public.tool_executions enable row level security;

drop policy if exists tool_definitions_select on public.tool_definitions;
create policy tool_definitions_select
  on public.tool_definitions for select
  using (auth.role() = 'authenticated');

drop policy if exists tool_definitions_write on public.tool_definitions;
create policy tool_definitions_write
  on public.tool_definitions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists tool_executions_select on public.tool_executions;
create policy tool_executions_select
  on public.tool_executions for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists tool_executions_insert on public.tool_executions;
create policy tool_executions_insert
  on public.tool_executions for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists tool_executions_update on public.tool_executions;
create policy tool_executions_update
  on public.tool_executions for update
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
  ('tools.view', 'Tools', 'Tools', 'View', 'View tool definitions and execution history'),
  ('tools.execute', 'Tools', 'Tools', 'Execute', 'Execute tools through the tool router'),
  ('tools.manage', 'Tools', 'Tools', 'Manage', 'Manage tool definitions and enablement')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── seed built-in tool definitions ────────────────────────────

insert into public.tool_definitions (
  key,
  display_name,
  description,
  category,
  version,
  is_enabled,
  required_permissions,
  supported_states,
  input_schema,
  output_schema,
  timeout_ms,
  retry_policy
)
values
  (
    'knowledge_lookup',
    'Knowledge Lookup',
    'Retrieve knowledge base entries for the current company.',
    'knowledge',
    '1.0.0',
    true,
    '["tools.execute"]'::jsonb,
    '["greeting", "collecting_information", "waiting_user", "waiting_api"]'::jsonb,
    '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}'::jsonb,
    '{"type":"object","properties":{"results":{"type":"array"}}}'::jsonb,
    15000,
    '{"maxAttempts":2,"backoffMs":250}'::jsonb
  ),
  (
    'crm_lookup',
    'CRM Lookup',
    'Search CRM records by query.',
    'crm',
    '1.0.0',
    true,
    '["tools.execute"]'::jsonb,
    '["collecting_information", "waiting_user", "waiting_api", "transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}'::jsonb,
    '{"type":"object","properties":{"records":{"type":"array"}}}'::jsonb,
    20000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'customer_profile',
    'Customer Profile',
    'Load a customer profile snapshot.',
    'crm',
    '1.0.0',
    true,
    '["tools.execute"]'::jsonb,
    '["greeting", "collecting_information", "waiting_user", "waiting_api", "transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"customerId":{"type":"string"}},"required":["customerId"]}'::jsonb,
    '{"type":"object","properties":{"profile":{"type":"object"}}}'::jsonb,
    15000,
    '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'appointment_lookup',
    'Appointment Lookup',
    'Find appointments for a customer or date range.',
    'scheduling',
    '1.0.0',
    true,
    '["tools.execute"]'::jsonb,
    '["collecting_information", "waiting_user", "waiting_api"]'::jsonb,
    '{"type":"object","properties":{"customerId":{"type":"string"},"from":{"type":"string"},"to":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"appointments":{"type":"array"}}}'::jsonb,
    20000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'booking',
    'Booking',
    'Create or modify a booking placeholder.',
    'scheduling',
    '1.0.0',
    true,
    '["tools.execute"]'::jsonb,
    '["collecting_information", "waiting_api"]'::jsonb,
    '{"type":"object","properties":{"service":{"type":"string"},"slot":{"type":"string"}},"required":["service","slot"]}'::jsonb,
    '{"type":"object","properties":{"bookingId":{"type":"string"},"status":{"type":"string"}}}'::jsonb,
    30000,
    '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'faq',
    'FAQ',
    'Answer frequently asked questions from configured FAQ content.',
    'knowledge',
    '1.0.0',
    true,
    '["tools.execute"]'::jsonb,
    '["greeting", "waiting_user", "waiting_api"]'::jsonb,
    '{"type":"object","properties":{"question":{"type":"string"}},"required":["question"]}'::jsonb,
    '{"type":"object","properties":{"answer":{"type":"string"}}}'::jsonb,
    10000,
    '{"maxAttempts":2,"backoffMs":200}'::jsonb
  ),
  (
    'notification',
    'Notification',
    'Send an internal notification placeholder.',
    'control',
    '1.0.0',
    true,
    '["tools.execute"]'::jsonb,
    '["waiting_api", "transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"message":{"type":"string"},"severity":{"type":"string"}},"required":["message"]}'::jsonb,
    '{"type":"object","properties":{"delivered":{"type":"boolean"}}}'::jsonb,
    10000,
    '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'escalation',
    'Escalation',
    'Escalate the conversation to human agents.',
    'control',
    '1.0.0',
    true,
    '["tools.execute", "ai.conversations.takeover"]'::jsonb,
    '["greeting", "collecting_information", "waiting_user", "waiting_api"]'::jsonb,
    '{"type":"object","properties":{"reason":{"type":"string"}},"required":["reason"]}'::jsonb,
    '{"type":"object","properties":{"escalated":{"type":"boolean"}}}'::jsonb,
    10000,
    '{"maxAttempts":1,"backoffMs":0}'::jsonb
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  category = excluded.category,
  version = excluded.version,
  required_permissions = excluded.required_permissions,
  supported_states = excluded.supported_states,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  timeout_ms = excluded.timeout_ms,
  retry_policy = excluded.retry_policy,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.tool_definition_audit_events(
  p_old public.tool_definitions,
  p_new public.tool_definitions,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    if p_new.is_enabled then
      return jsonb_build_array('tool_enabled');
    end if;
    return jsonb_build_array('tool_disabled');
  end if;

  if p_old.is_enabled is distinct from p_new.is_enabled then
    if p_new.is_enabled then
      return jsonb_build_array('tool_enabled');
    end if;
    return jsonb_build_array('tool_disabled');
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.tool_execution_audit_events(
  p_old public.tool_executions,
  p_new public.tool_executions,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return '[]'::jsonb;
  end if;

  if p_old.status is distinct from p_new.status then
    if p_new.status = 'succeeded' then
      return jsonb_build_array('tool_executed');
    elsif p_new.status = 'timeout' then
      return jsonb_build_array('tool_timeout');
    elsif p_new.status in ('failed', 'denied') then
      return jsonb_build_array('tool_failed');
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.write_tool_audit_log()
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
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  v_entity_id := coalesce(new.id, old.id)::text;

  if TG_TABLE_NAME = 'tool_definitions' then
    v_company_id := public.current_company_id();
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'events', public.tool_definition_audit_events(old, new, TG_OP),
        'key', new.key,
        'display_name', new.display_name,
        'is_enabled', new.is_enabled
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'events', public.tool_definition_audit_events(old, new, TG_OP),
        'key', new.key,
        'old', jsonb_build_object('is_enabled', old.is_enabled),
        'new', jsonb_build_object('is_enabled', new.is_enabled)
      );
    else
      v_metadata := jsonb_build_object('key', old.key, 'events', jsonb_build_array('tool_disabled'));
    end if;
  elsif TG_TABLE_NAME = 'tool_executions' then
    v_company_id := coalesce(new.company_id, old.company_id);
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'tool_key', new.tool_key,
        'conversation_id', new.conversation_id,
        'status', new.status
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'events', public.tool_execution_audit_events(old, new, TG_OP),
        'tool_key', new.tool_key,
        'conversation_id', new.conversation_id,
        'old', jsonb_build_object('status', old.status),
        'new', jsonb_build_object('status', new.status, 'duration_ms', new.duration_ms)
      );
    else
      v_metadata := jsonb_build_object(
        'tool_key', old.tool_key,
        'conversation_id', old.conversation_id,
        'events', jsonb_build_array('tool_failed')
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

drop trigger if exists trg_audit_tool_definitions on public.tool_definitions;
create trigger trg_audit_tool_definitions
  after insert or update or delete on public.tool_definitions
  for each row execute procedure public.write_tool_audit_log();

drop trigger if exists trg_audit_tool_executions on public.tool_executions;
create trigger trg_audit_tool_executions
  after insert or update or delete on public.tool_executions
  for each row execute procedure public.write_tool_audit_log();
