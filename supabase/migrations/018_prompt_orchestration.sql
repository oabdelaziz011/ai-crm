-- ============================================================
-- Vault OS – Phase 2 Sprint 2.7: Prompt Orchestration Engine
-- ============================================================

-- ── prompt_templates (tenant-scoped) ──────────────────────────

create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  display_name text not null,
  description text not null default '',
  template_type text not null
    check (template_type in (
      'conversation',
      'classification',
      'tool_assistance',
      'summarization',
      'extraction',
      'fallback',
      'escalation'
    )),
  section_order jsonb not null default '[]'::jsonb,
  is_enabled boolean not null default true,
  active_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_prompt_templates_system_key
  on public.prompt_templates(key)
  where company_id is null;

create unique index if not exists idx_prompt_templates_company_key
  on public.prompt_templates(company_id, key)
  where company_id is not null;

drop trigger if exists prompt_templates_updated_at on public.prompt_templates;
create trigger prompt_templates_updated_at
  before update on public.prompt_templates
  for each row execute procedure public.set_updated_at();

create index if not exists idx_prompt_templates_company_id
  on public.prompt_templates(company_id);

create index if not exists idx_prompt_templates_type
  on public.prompt_templates(template_type)
  where is_enabled = true;

create index if not exists idx_prompt_templates_key
  on public.prompt_templates(key);

create index if not exists idx_prompt_templates_system
  on public.prompt_templates(key)
  where company_id is null;

-- ── prompt_template_versions ────────────────────────────────────

create table if not exists public.prompt_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.prompt_templates(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  version_label text not null default '1.0.0',
  sections jsonb not null default '{}'::jsonb,
  output_contract jsonb not null default '{}'::jsonb,
  change_notes text not null default '',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint prompt_template_versions_unique_number unique (template_id, version_number)
);

create index if not exists idx_prompt_template_versions_template
  on public.prompt_template_versions(template_id, version_number desc);

create index if not exists idx_prompt_template_versions_active
  on public.prompt_template_versions(template_id)
  where is_active = true;

alter table public.prompt_templates
  drop constraint if exists prompt_templates_active_version_id_fkey;

alter table public.prompt_templates
  add constraint prompt_templates_active_version_id_fkey
  foreign key (active_version_id) references public.prompt_template_versions(id) on delete set null;

-- ── prompt_builds (orchestration history + Prompt Built audit) ─

create table if not exists public.prompt_builds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  template_id uuid not null references public.prompt_templates(id) on delete restrict,
  template_version_id uuid not null references public.prompt_template_versions(id) on delete restrict,
  template_key text not null,
  template_type text not null,
  sections jsonb not null default '[]'::jsonb,
  final_prompt text not null,
  output_contract jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_prompt_builds_company_created
  on public.prompt_builds(company_id, created_at desc);

create index if not exists idx_prompt_builds_conversation_created
  on public.prompt_builds(conversation_id, created_at desc)
  where conversation_id is not null;

create index if not exists idx_prompt_builds_template_key
  on public.prompt_builds(company_id, template_key, created_at desc);

-- ── Row Level Security ────────────────────────────────────────

alter table public.prompt_templates enable row level security;
alter table public.prompt_template_versions enable row level security;
alter table public.prompt_builds enable row level security;

drop policy if exists prompt_templates_select on public.prompt_templates;
create policy prompt_templates_select
  on public.prompt_templates for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id is null
      or company_id = public.current_company_id()
    )
  );

drop policy if exists prompt_templates_insert on public.prompt_templates;
create policy prompt_templates_insert
  on public.prompt_templates for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists prompt_templates_update on public.prompt_templates;
create policy prompt_templates_update
  on public.prompt_templates for update
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

drop policy if exists prompt_template_versions_select on public.prompt_template_versions;
create policy prompt_template_versions_select
  on public.prompt_template_versions for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.prompt_templates pt
      where pt.id = template_id
        and (
          public.is_super_admin()
          or pt.company_id is null
          or pt.company_id = public.current_company_id()
        )
    )
  );

drop policy if exists prompt_template_versions_insert on public.prompt_template_versions;
create policy prompt_template_versions_insert
  on public.prompt_template_versions for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.prompt_templates pt
      where pt.id = template_id
        and (
          public.is_super_admin()
          or pt.company_id = public.current_company_id()
        )
    )
  );

drop policy if exists prompt_template_versions_update on public.prompt_template_versions;
create policy prompt_template_versions_update
  on public.prompt_template_versions for update
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.prompt_templates pt
      where pt.id = template_id
        and (
          public.is_super_admin()
          or pt.company_id = public.current_company_id()
        )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.prompt_templates pt
      where pt.id = template_id
        and (
          public.is_super_admin()
          or pt.company_id = public.current_company_id()
        )
    )
  );

drop policy if exists prompt_builds_select on public.prompt_builds;
create policy prompt_builds_select
  on public.prompt_builds for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists prompt_builds_insert on public.prompt_builds;
create policy prompt_builds_insert
  on public.prompt_builds for insert
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
  ('prompts.view', 'Prompts', 'Prompts', 'View', 'View prompt templates and build history'),
  ('prompts.manage', 'Prompts', 'Prompts', 'Manage', 'Manage prompt templates and versions')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── seed system prompt templates (company_id null) ──────────────

insert into public.prompt_templates (
  key,
  display_name,
  description,
  template_type,
  section_order,
  is_enabled
)
select seed.key, seed.display_name, seed.description, seed.template_type, seed.section_order, seed.is_enabled
from (
  values
    (
      'conversation_default',
      'Conversation Default',
      'Default conversation response prompt template.',
      'conversation',
      '["system_instructions","assistant_profile","conversation_summary","recent_messages","conversation_state","intent_decision","tool_results","company_policies","language","tone","formatting_rules","safety_instructions","output_contract"]'::jsonb,
      true
    ),
    (
      'classification_default',
      'Classification Default',
      'Default intent classification prompt template.',
      'classification',
      '["system_instructions","recent_messages","intent_decision","language","output_contract"]'::jsonb,
      true
    ),
    (
      'tool_assistance_default',
      'Tool Assistance Default',
      'Default tool assistance prompt template.',
      'tool_assistance',
      '["system_instructions","conversation_state","intent_decision","tool_results","formatting_rules","output_contract"]'::jsonb,
      true
    ),
    (
      'summarization_default',
      'Summarization Default',
      'Default conversation summarization prompt template.',
      'summarization',
      '["system_instructions","conversation_summary","recent_messages","language","output_contract"]'::jsonb,
      true
    ),
    (
      'extraction_default',
      'Extraction Default',
      'Default structured extraction prompt template.',
      'extraction',
      '["system_instructions","recent_messages","formatting_rules","output_contract"]'::jsonb,
      true
    ),
    (
      'fallback_default',
      'Fallback Default',
      'Default fallback prompt template.',
      'fallback',
      '["system_instructions","assistant_profile","recent_messages","safety_instructions","output_contract"]'::jsonb,
      true
    ),
    (
      'escalation_default',
      'Escalation Default',
      'Default human escalation prompt template.',
      'escalation',
      '["system_instructions","conversation_summary","conversation_state","intent_decision","company_policies","output_contract"]'::jsonb,
      true
    )
) as seed(key, display_name, description, template_type, section_order, is_enabled)
where not exists (
  select 1
  from public.prompt_templates existing
  where existing.company_id is null
    and existing.key = seed.key
);

-- ── seed initial versions for system templates ─────────────────

insert into public.prompt_template_versions (
  template_id,
  version_number,
  version_label,
  sections,
  output_contract,
  change_notes,
  is_active
)
select
  pt.id,
  1,
  '1.0.0',
  jsonb_build_object(
    'system_instructions', jsonb_build_object(
      'enabled', true,
      'title', 'System Instructions',
      'content', 'You are a helpful AI assistant operating inside VaultOS. Follow company policies and respond accurately.'
    ),
    'assistant_profile', jsonb_build_object(
      'enabled', true,
      'title', 'Assistant Profile',
      'content', 'Use the configured assistant name, personality, and welcome message when relevant.'
    ),
    'conversation_summary', jsonb_build_object(
      'enabled', true,
      'title', 'Conversation Summary',
      'content', 'Summarize prior context before responding when a summary is available.'
    ),
    'recent_messages', jsonb_build_object(
      'enabled', true,
      'title', 'Recent Messages',
      'content', 'Use the most recent customer and assistant messages as primary context.'
    ),
    'conversation_state', jsonb_build_object(
      'enabled', true,
      'title', 'Conversation State',
      'content', 'Respect the current conversation state when deciding what to say next.'
    ),
    'intent_decision', jsonb_build_object(
      'enabled', true,
      'title', 'Intent Decision',
      'content', 'Use the latest intent routing decision to stay aligned with the user goal.'
    ),
    'tool_results', jsonb_build_object(
      'enabled', true,
      'title', 'Executed Tool Results',
      'content', 'Incorporate executed tool outputs as factual context. Never invent tool data.'
    ),
    'company_policies', jsonb_build_object(
      'enabled', true,
      'title', 'Company Policies',
      'content', 'Follow all company policies provided for this tenant.'
    ),
    'language', jsonb_build_object(
      'enabled', true,
      'title', 'Language',
      'content', 'Respond in the requested conversation language.'
    ),
    'tone', jsonb_build_object(
      'enabled', true,
      'title', 'Tone',
      'content', 'Maintain the configured assistant tone throughout the response.'
    ),
    'formatting_rules', jsonb_build_object(
      'enabled', true,
      'title', 'Formatting Rules',
      'content', 'Use concise, readable formatting unless the output contract requires JSON.'
    ),
    'safety_instructions', jsonb_build_object(
      'enabled', true,
      'title', 'Safety Instructions',
      'content', 'Refuse unsafe requests and escalate when human intervention is required.'
    ),
    'output_contract', jsonb_build_object(
      'enabled', true,
      'title', 'Output Contract',
      'content', 'Return output that conforms to the structured response contract.'
    )
  ),
  jsonb_build_object(
    'format', 'json',
    'instructions', 'Return a provider-agnostic JSON object with keys: reply, confidence, requires_human.',
    'schema', jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'reply', jsonb_build_object('type', 'string'),
        'confidence', jsonb_build_object('type', 'number'),
        'requires_human', jsonb_build_object('type', 'boolean')
      ),
      'required', jsonb_build_array('reply')
    )
  ),
  'Initial system template version.',
  true
from public.prompt_templates pt
where pt.company_id is null
  and not exists (
    select 1
    from public.prompt_template_versions v
    where v.template_id = pt.id
  );

update public.prompt_templates pt
set active_version_id = v.id
from public.prompt_template_versions v
where v.template_id = pt.id
  and v.is_active = true
  and pt.active_version_id is null;

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.prompt_template_audit_events(
  p_old public.prompt_templates,
  p_new public.prompt_templates,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    if p_new.is_enabled then
      return jsonb_build_array('template_activated');
    end if;
    return jsonb_build_array('template_disabled');
  end if;

  if p_old.is_enabled is distinct from p_new.is_enabled then
    if p_new.is_enabled then
      return jsonb_build_array('template_activated');
    end if;
    return jsonb_build_array('template_disabled');
  end if;

  if p_old.active_version_id is distinct from p_new.active_version_id
     or p_old.section_order is distinct from p_new.section_order
     or p_old.display_name is distinct from p_new.display_name then
    return jsonb_build_array('template_updated');
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.prompt_template_version_audit_events(
  p_old public.prompt_template_versions,
  p_new public.prompt_template_versions,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('template_updated');
  end if;

  if p_old.sections is distinct from p_new.sections
     or p_old.output_contract is distinct from p_new.output_contract
     or p_old.version_label is distinct from p_new.version_label then
    return jsonb_build_array('template_updated');
  end if;

  if p_old.is_active is distinct from p_new.is_active and p_new.is_active then
    return jsonb_build_array('template_activated');
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.write_prompt_orchestrator_audit_log()
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

  if TG_TABLE_NAME = 'prompt_templates' then
    v_company_id := coalesce(new.company_id, old.company_id, public.current_company_id());
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'events', public.prompt_template_audit_events(old, new, TG_OP),
        'key', new.key,
        'display_name', new.display_name,
        'template_type', new.template_type,
        'is_enabled', new.is_enabled
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'events', public.prompt_template_audit_events(old, new, TG_OP),
        'key', new.key,
        'display_name', new.display_name,
        'template_type', new.template_type,
        'old', jsonb_build_object('is_enabled', old.is_enabled),
        'new', jsonb_build_object('is_enabled', new.is_enabled)
      );
    else
      v_metadata := jsonb_build_object('key', old.key, 'events', jsonb_build_array('template_disabled'));
    end if;
  elsif TG_TABLE_NAME = 'prompt_template_versions' then
    select pt.company_id into v_company_id
    from public.prompt_templates pt
    where pt.id = coalesce(new.template_id, old.template_id);

    v_metadata := jsonb_build_object(
      'events', public.prompt_template_version_audit_events(old, new, TG_OP),
      'template_id', coalesce(new.template_id, old.template_id),
      'version_number', coalesce(new.version_number, old.version_number),
      'version_label', coalesce(new.version_label, old.version_label),
      'is_active', coalesce(new.is_active, old.is_active)
    );
  elsif TG_TABLE_NAME = 'prompt_builds' then
    v_company_id := new.company_id;
    v_metadata := jsonb_build_object(
      'events', jsonb_build_array('prompt_built'),
      'template_key', new.template_key,
      'template_type', new.template_type,
      'conversation_id', new.conversation_id,
      'template_version_id', new.template_version_id
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

drop trigger if exists trg_audit_prompt_templates on public.prompt_templates;
create trigger trg_audit_prompt_templates
  after insert or update or delete on public.prompt_templates
  for each row execute procedure public.write_prompt_orchestrator_audit_log();

drop trigger if exists trg_audit_prompt_template_versions on public.prompt_template_versions;
create trigger trg_audit_prompt_template_versions
  after insert or update or delete on public.prompt_template_versions
  for each row execute procedure public.write_prompt_orchestrator_audit_log();

drop trigger if exists trg_audit_prompt_builds on public.prompt_builds;
create trigger trg_audit_prompt_builds
  after insert on public.prompt_builds
  for each row execute procedure public.write_prompt_orchestrator_audit_log();
