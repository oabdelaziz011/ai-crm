-- ============================================================
-- Vault OS – Phase 2 Sprint 2.5: Enterprise Intent Engine
-- ============================================================

-- ── intent_definitions (global registry) ──────────────────────

create table if not exists public.intent_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  description text not null default '',
  category text not null default 'general',
  priority integer not null default 100
    check (priority >= 0),
  confidence_threshold numeric(4, 3) not null default 0.600
    check (confidence_threshold >= 0 and confidence_threshold <= 1),
  required_states jsonb not null default '[]'::jsonb,
  required_permissions jsonb not null default '[]'::jsonb,
  matched_tool_key text,
  classification_rules jsonb not null default '{}'::jsonb,
  requires_human boolean not null default false,
  requires_llm boolean not null default false,
  is_enabled boolean not null default true,
  version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists intent_definitions_updated_at on public.intent_definitions;
create trigger intent_definitions_updated_at
  before update on public.intent_definitions
  for each row execute procedure public.set_updated_at();

create index if not exists idx_intent_definitions_key
  on public.intent_definitions(key);

create index if not exists idx_intent_definitions_category
  on public.intent_definitions(category)
  where is_enabled = true;

create index if not exists idx_intent_definitions_enabled
  on public.intent_definitions(is_enabled)
  where is_enabled = true;

create index if not exists idx_intent_definitions_matched_tool
  on public.intent_definitions(matched_tool_key)
  where matched_tool_key is not null;

-- ── intent_matches (tenant-scoped match history) ────────────────

create table if not exists public.intent_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  intent_definition_id uuid references public.intent_definitions(id) on delete set null,
  intent_key text not null,
  classifier_key text not null,
  message_preview text not null default '',
  confidence numeric(4, 3) not null default 0
    check (confidence >= 0 and confidence <= 1),
  matched_tool_key text,
  reason text not null default '',
  alternatives jsonb not null default '[]'::jsonb,
  requires_human boolean not null default false,
  requires_llm boolean not null default false,
  status text not null default 'matched'
    check (status in ('matched', 'rejected', 'fallback', 'escalated')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_intent_matches_company_created
  on public.intent_matches(company_id, created_at desc);

create index if not exists idx_intent_matches_conversation_created
  on public.intent_matches(conversation_id, created_at desc);

create index if not exists idx_intent_matches_intent_key
  on public.intent_matches(company_id, intent_key, created_at desc);

create index if not exists idx_intent_matches_status
  on public.intent_matches(company_id, status, created_at desc);

-- ── Row Level Security ────────────────────────────────────────

alter table public.intent_definitions enable row level security;
alter table public.intent_matches enable row level security;

drop policy if exists intent_definitions_select on public.intent_definitions;
create policy intent_definitions_select
  on public.intent_definitions for select
  using (auth.role() = 'authenticated');

drop policy if exists intent_definitions_write on public.intent_definitions;
create policy intent_definitions_write
  on public.intent_definitions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists intent_matches_select on public.intent_matches;
create policy intent_matches_select
  on public.intent_matches for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists intent_matches_insert on public.intent_matches;
create policy intent_matches_insert
  on public.intent_matches for insert
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
  ('intents.view', 'Intents', 'Intents', 'View', 'View intent definitions and match history'),
  ('intents.manage', 'Intents', 'Intents', 'Manage', 'Manage intent definitions and enablement')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── seed representative intents ───────────────────────────────

insert into public.intent_definitions (
  key,
  display_name,
  description,
  category,
  priority,
  confidence_threshold,
  required_states,
  required_permissions,
  matched_tool_key,
  classification_rules,
  requires_human,
  requires_llm,
  is_enabled,
  version
)
values
  (
    'greeting',
    'Greeting',
    'User is greeting or starting a conversation.',
    'conversation',
    200,
    0.550,
    '["greeting", "idle"]'::jsonb,
    '["intents.view"]'::jsonb,
    null,
    '{"keywords":["hello","hi","hey","good morning","good evening"],"phrases":["how are you"],"baseConfidence":0.82}'::jsonb,
    false,
    false,
    true,
    '1.0.0'
  ),
  (
    'faq',
    'FAQ',
    'User is asking a frequently asked question.',
    'knowledge',
    150,
    0.600,
    '["greeting","waiting_user","waiting_api"]'::jsonb,
    '["intents.view"]'::jsonb,
    'faq',
    '{"keywords":["hours","pricing","price","cost","policy","location","address","open"],"phrases":["what are your hours","how much does it cost"],"baseConfidence":0.78}'::jsonb,
    false,
    false,
    true,
    '1.0.0'
  ),
  (
    'booking_request',
    'Booking Request',
    'User wants to book or schedule a service.',
    'scheduling',
    180,
    0.650,
    '["collecting_information","waiting_user","waiting_api"]'::jsonb,
    '["intents.view","tools.execute"]'::jsonb,
    'booking',
    '{"keywords":["book","booking","schedule","reserve","appointment"],"phrases":["book an appointment","schedule a visit"],"baseConfidence":0.86}'::jsonb,
    false,
    false,
    true,
    '1.0.0'
  ),
  (
    'appointment_lookup',
    'Appointment Lookup',
    'User wants to find or check an existing appointment.',
    'scheduling',
    170,
    0.620,
    '["collecting_information","waiting_user","waiting_api"]'::jsonb,
    '["intents.view","tools.execute"]'::jsonb,
    'appointment_lookup',
    '{"keywords":["appointment","upcoming","when is my","my booking","reservation"],"phrases":["check my appointment","when is my appointment"],"baseConfidence":0.84}'::jsonb,
    false,
    false,
    true,
    '1.0.0'
  ),
  (
    'customer_lookup',
    'Customer Lookup',
    'User wants customer profile information.',
    'crm',
    160,
    0.620,
    '["collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '["intents.view","tools.execute"]'::jsonb,
    'customer_profile',
    '{"keywords":["my profile","my account","customer profile","who am i"],"phrases":["show my profile","my customer details"],"baseConfidence":0.83}'::jsonb,
    false,
    false,
    true,
    '1.0.0'
  ),
  (
    'crm_lookup',
    'CRM Lookup',
    'User wants to search CRM records.',
    'crm',
    165,
    0.620,
    '["collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '["intents.view","tools.execute"]'::jsonb,
    'crm_lookup',
    '{"keywords":["contact","lead","customer record","crm","client"],"phrases":["find customer","search crm"],"baseConfidence":0.81}'::jsonb,
    false,
    false,
    true,
    '1.0.0'
  ),
  (
    'knowledge_lookup',
    'Knowledge Lookup',
    'User wants knowledge base information.',
    'knowledge',
    155,
    0.600,
    '["greeting","collecting_information","waiting_user","waiting_api"]'::jsonb,
    '["intents.view","tools.execute"]'::jsonb,
    'knowledge_lookup',
    '{"keywords":["documentation","docs","guide","manual","knowledge","article"],"phrases":["search knowledge base","look up documentation"],"baseConfidence":0.80}'::jsonb,
    false,
    false,
    true,
    '1.0.0'
  ),
  (
    'escalation_request',
    'Escalation Request',
    'User wants to speak with a human agent.',
    'control',
    190,
    0.580,
    '["greeting","collecting_information","waiting_user","waiting_api"]'::jsonb,
    '["intents.view","tools.execute","ai.conversations.takeover"]'::jsonb,
    'escalation',
    '{"keywords":["human","agent","representative","person","support","help me","talk to someone"],"phrases":["speak to a human","talk to an agent"],"baseConfidence":0.88}'::jsonb,
    true,
    false,
    true,
    '1.0.0'
  ),
  (
    'notification_request',
    'Notification Request',
    'User wants to send or trigger a notification.',
    'control',
    140,
    0.620,
    '["waiting_api","transferred_to_human"]'::jsonb,
    '["intents.view","tools.execute"]'::jsonb,
    'notification',
    '{"keywords":["notify","notification","alert","remind","reminder"],"phrases":["send a notification","notify the team"],"baseConfidence":0.79}'::jsonb,
    false,
    false,
    true,
    '1.0.0'
  ),
  (
    'fallback',
    'Fallback',
    'Default intent when confidence is too low or no intent matches.',
    'system',
    10,
    0.000,
    '[]'::jsonb,
    '["intents.view"]'::jsonb,
    null,
    '{}'::jsonb,
    false,
    true,
    true,
    '1.0.0'
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  category = excluded.category,
  priority = excluded.priority,
  confidence_threshold = excluded.confidence_threshold,
  required_states = excluded.required_states,
  required_permissions = excluded.required_permissions,
  matched_tool_key = excluded.matched_tool_key,
  classification_rules = excluded.classification_rules,
  requires_human = excluded.requires_human,
  requires_llm = excluded.requires_llm,
  version = excluded.version,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.intent_definition_audit_events(
  p_old public.intent_definitions,
  p_new public.intent_definitions,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    if p_new.is_enabled then
      return jsonb_build_array('intent_enabled');
    end if;
    return jsonb_build_array('intent_disabled');
  end if;

  if p_old.is_enabled is distinct from p_new.is_enabled then
    if p_new.is_enabled then
      return jsonb_build_array('intent_enabled');
    end if;
    return jsonb_build_array('intent_disabled');
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.intent_match_audit_events(
  p_new public.intent_matches
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_events jsonb := jsonb_build_array('classifier_selected');
begin
  if p_new.status = 'matched' then
    v_events := v_events || jsonb_build_array('intent_matched');
  elsif p_new.status = 'rejected' then
    v_events := v_events || jsonb_build_array('intent_rejected');
  elsif p_new.status = 'fallback' then
    v_events := v_events || jsonb_build_array('intent_fallback');
  elsif p_new.status = 'escalated' then
    v_events := v_events || jsonb_build_array('intent_escalated');
  end if;

  return v_events;
end;
$$;

create or replace function public.write_intent_audit_log()
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

  if TG_TABLE_NAME = 'intent_definitions' then
    v_company_id := public.current_company_id();
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'events', public.intent_definition_audit_events(old, new, TG_OP),
        'key', new.key,
        'display_name', new.display_name,
        'is_enabled', new.is_enabled
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'events', public.intent_definition_audit_events(old, new, TG_OP),
        'key', new.key,
        'old', jsonb_build_object('is_enabled', old.is_enabled),
        'new', jsonb_build_object('is_enabled', new.is_enabled)
      );
    else
      v_metadata := jsonb_build_object('key', old.key, 'events', jsonb_build_array('intent_disabled'));
    end if;
  elsif TG_TABLE_NAME = 'intent_matches' then
    v_company_id := new.company_id;
    v_metadata := jsonb_build_object(
      'events', public.intent_match_audit_events(new),
      'intent_key', new.intent_key,
      'classifier_key', new.classifier_key,
      'conversation_id', new.conversation_id,
      'confidence', new.confidence,
      'matched_tool_key', new.matched_tool_key,
      'status', new.status,
      'requires_human', new.requires_human,
      'requires_llm', new.requires_llm
    );
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

drop trigger if exists trg_audit_intent_definitions on public.intent_definitions;
create trigger trg_audit_intent_definitions
  after insert or update or delete on public.intent_definitions
  for each row execute procedure public.write_intent_audit_log();

drop trigger if exists trg_audit_intent_matches on public.intent_matches;
create trigger trg_audit_intent_matches
  after insert on public.intent_matches
  for each row execute procedure public.write_intent_audit_log();
