-- ============================================================
-- Vault OS – AI Assistant Settings (Enterprise Enhancements)
-- ============================================================

-- ── New columns ─────────────────────────────────────────────

alter table public.ai_assistant_settings
  add column if not exists is_enabled boolean default true,
  add column if not exists provider text default 'openai',
  add column if not exists model text default 'gpt-5.5',
  add column if not exists temperature numeric(3, 2) default 0.3,
  add column if not exists max_tokens integer default 1000,
  add column if not exists response_language text default 'system',
  add column if not exists version integer default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

update public.ai_assistant_settings
set
  is_enabled = coalesce(is_enabled, true),
  provider = coalesce(provider, 'openai'),
  model = coalesce(model, 'gpt-5.5'),
  temperature = coalesce(temperature, 0.3),
  max_tokens = coalesce(max_tokens, 1000),
  response_language = coalesce(response_language, 'system'),
  version = coalesce(version, 1)
where
  is_enabled is null
  or provider is null
  or model is null
  or temperature is null
  or max_tokens is null
  or response_language is null
  or version is null;

alter table public.ai_assistant_settings
  alter column is_enabled set not null,
  alter column provider set not null,
  alter column model set not null,
  alter column temperature set not null,
  alter column max_tokens set not null,
  alter column response_language set not null,
  alter column version set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_assistant_settings_deleted_by_fkey'
      and conrelid = 'public.ai_assistant_settings'::regclass
  ) then
    alter table public.ai_assistant_settings
      add constraint ai_assistant_settings_deleted_by_fkey
      foreign key (deleted_by)
      references auth.users(id)
      on delete set null;
  end if;
exception
  when others then null;
end $$;

-- ── Data normalization before constraints ───────────────────

update public.ai_assistant_settings
set tone = 'friendly'
where tone = 'funny';

update public.ai_assistant_settings
set assistant_name = left(assistant_name, 100)
where char_length(assistant_name) > 100;

update public.ai_assistant_settings
set welcome_message = left(welcome_message, 1000)
where char_length(welcome_message) > 1000;

update public.ai_assistant_settings
set fallback_message = left(fallback_message, 1000)
where char_length(fallback_message) > 1000;

-- ── Validation constraints ──────────────────────────────────

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_tone_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_tone_check
  check (tone in ('friendly', 'professional', 'formal'));

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_language_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_language_check
  check (language in ('en', 'ar'));

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_response_language_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_response_language_check
  check (response_language in ('en', 'ar', 'system'));

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_provider_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_provider_check
  check (provider in ('openai', 'anthropic', 'google', 'azure'));

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_temperature_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_temperature_check
  check (temperature >= 0.0 and temperature <= 2.0);

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_assistant_name_length_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_assistant_name_length_check
  check (char_length(assistant_name) <= 100);

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_welcome_message_length_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_welcome_message_length_check
  check (char_length(welcome_message) <= 1000);

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_fallback_message_length_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_fallback_message_length_check
  check (char_length(fallback_message) <= 1000);

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_max_tokens_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_max_tokens_check
  check (max_tokens > 0);

create index if not exists idx_ai_assistant_settings_deleted_at
  on public.ai_assistant_settings(deleted_at)
  where deleted_at is not null;

-- ── Versioning ──────────────────────────────────────────────

create or replace function public.bump_ai_assistant_settings_version()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' then
    new.version := coalesce(old.version, 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_ai_assistant_settings_version on public.ai_assistant_settings;
create trigger trg_bump_ai_assistant_settings_version
  before update on public.ai_assistant_settings
  for each row execute procedure public.bump_ai_assistant_settings_version();

-- ── Soft delete (block physical delete) ─────────────────────

create or replace function public.prevent_ai_assistant_settings_physical_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'AI Assistant settings cannot be physically deleted. Use soft delete instead.';
end;
$$;

drop trigger if exists trg_prevent_ai_assistant_settings_physical_delete on public.ai_assistant_settings;
create trigger trg_prevent_ai_assistant_settings_physical_delete
  before delete on public.ai_assistant_settings
  for each row execute procedure public.prevent_ai_assistant_settings_physical_delete();

drop policy if exists ai_assistant_settings_delete on public.ai_assistant_settings;
create policy ai_assistant_settings_delete
  on public.ai_assistant_settings for delete
  using (false);

drop policy if exists ai_assistant_settings_select on public.ai_assistant_settings;
create policy ai_assistant_settings_select
  on public.ai_assistant_settings for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

-- ── Future AI permissions (seed only) ───────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('ai.conversations.view', 'AI', 'Conversations', 'View', 'View AI conversations'),
  ('ai.conversations.reply', 'AI', 'Conversations', 'Reply', 'Reply in AI conversations'),
  ('ai.conversations.takeover', 'AI', 'Conversations', 'Takeover', 'Take over AI conversations'),
  ('ai.conversations.release', 'AI', 'Conversations', 'Release', 'Release AI conversations'),
  ('ai.analytics.view', 'AI', 'Analytics', 'View', 'View AI analytics'),
  ('ai.knowledge.manage', 'AI', 'Knowledge', 'Manage', 'Manage AI knowledge base'),
  ('ai.whatsapp.manage', 'AI', 'WhatsApp', 'Manage', 'Manage AI WhatsApp integration')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── Audit metadata helpers ───────────────────────────────────

create or replace function public.snapshot_ai_assistant_settings(p_row public.ai_assistant_settings)
returns jsonb
language plpgsql
stable
as $$
begin
  return jsonb_build_object(
    'assistant_name', p_row.assistant_name,
    'assistant_avatar', p_row.assistant_avatar,
    'language', p_row.language,
    'personality', p_row.personality,
    'tone', p_row.tone,
    'welcome_message', p_row.welcome_message,
    'fallback_message', p_row.fallback_message,
    'working_hours_enabled', p_row.working_hours_enabled,
    'allow_auto_booking', p_row.allow_auto_booking,
    'allow_reschedule', p_row.allow_reschedule,
    'allow_cancellation', p_row.allow_cancellation,
    'handoff_to_human', p_row.handoff_to_human,
    'knowledge_enabled', p_row.knowledge_enabled,
    'remember_conversation', p_row.remember_conversation,
    'conversation_timeout_minutes', p_row.conversation_timeout_minutes,
    'max_conversation_age', p_row.max_conversation_age,
    'is_enabled', p_row.is_enabled,
    'provider', p_row.provider,
    'model', p_row.model,
    'temperature', p_row.temperature,
    'max_tokens', p_row.max_tokens,
    'response_language', p_row.response_language,
    'deleted_at', p_row.deleted_at
  );
end;
$$;

create or replace function public.ai_assistant_settings_changed_fields(
  p_old public.ai_assistant_settings,
  p_new public.ai_assistant_settings
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_changes jsonb := '[]'::jsonb;
begin
  if p_old.assistant_name is distinct from p_new.assistant_name then
    v_changes := v_changes || jsonb_build_array('assistant_name');
  end if;
  if p_old.assistant_avatar is distinct from p_new.assistant_avatar then
    v_changes := v_changes || jsonb_build_array('assistant_avatar');
  end if;
  if p_old.language is distinct from p_new.language then
    v_changes := v_changes || jsonb_build_array('language');
  end if;
  if p_old.personality is distinct from p_new.personality then
    v_changes := v_changes || jsonb_build_array('personality');
  end if;
  if p_old.tone is distinct from p_new.tone then
    v_changes := v_changes || jsonb_build_array('tone');
  end if;
  if p_old.welcome_message is distinct from p_new.welcome_message then
    v_changes := v_changes || jsonb_build_array('welcome_message');
  end if;
  if p_old.fallback_message is distinct from p_new.fallback_message then
    v_changes := v_changes || jsonb_build_array('fallback_message');
  end if;
  if p_old.working_hours_enabled is distinct from p_new.working_hours_enabled then
    v_changes := v_changes || jsonb_build_array('working_hours_enabled');
  end if;
  if p_old.allow_auto_booking is distinct from p_new.allow_auto_booking then
    v_changes := v_changes || jsonb_build_array('allow_auto_booking');
  end if;
  if p_old.allow_reschedule is distinct from p_new.allow_reschedule then
    v_changes := v_changes || jsonb_build_array('allow_reschedule');
  end if;
  if p_old.allow_cancellation is distinct from p_new.allow_cancellation then
    v_changes := v_changes || jsonb_build_array('allow_cancellation');
  end if;
  if p_old.handoff_to_human is distinct from p_new.handoff_to_human then
    v_changes := v_changes || jsonb_build_array('handoff_to_human');
  end if;
  if p_old.knowledge_enabled is distinct from p_new.knowledge_enabled then
    v_changes := v_changes || jsonb_build_array('knowledge_enabled');
  end if;
  if p_old.remember_conversation is distinct from p_new.remember_conversation then
    v_changes := v_changes || jsonb_build_array('remember_conversation');
  end if;
  if p_old.conversation_timeout_minutes is distinct from p_new.conversation_timeout_minutes then
    v_changes := v_changes || jsonb_build_array('conversation_timeout_minutes');
  end if;
  if p_old.max_conversation_age is distinct from p_new.max_conversation_age then
    v_changes := v_changes || jsonb_build_array('max_conversation_age');
  end if;
  if p_old.is_enabled is distinct from p_new.is_enabled then
    v_changes := v_changes || jsonb_build_array('is_enabled');
  end if;
  if p_old.provider is distinct from p_new.provider then
    v_changes := v_changes || jsonb_build_array('provider');
  end if;
  if p_old.model is distinct from p_new.model then
    v_changes := v_changes || jsonb_build_array('model');
  end if;
  if p_old.temperature is distinct from p_new.temperature then
    v_changes := v_changes || jsonb_build_array('temperature');
  end if;
  if p_old.max_tokens is distinct from p_new.max_tokens then
    v_changes := v_changes || jsonb_build_array('max_tokens');
  end if;
  if p_old.response_language is distinct from p_new.response_language then
    v_changes := v_changes || jsonb_build_array('response_language');
  end if;
  if p_old.deleted_at is distinct from p_new.deleted_at and p_new.deleted_at is not null then
    v_changes := v_changes || jsonb_build_array('soft_deleted');
  end if;

  return v_changes;
end;
$$;

-- ── Enhanced audit logging ──────────────────────────────────

create or replace function public.write_audit_log()
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

  if TG_TABLE_NAME = 'profiles' then
    v_company_id := coalesce(new.company_id, old.company_id);
  elsif TG_TABLE_NAME = 'companies' then
    v_company_id := coalesce(new.id, old.id);
  elsif TG_TABLE_NAME = 'roles' then
    v_company_id := coalesce(new.company_id, old.company_id);
  elsif TG_TABLE_NAME = 'ai_assistant_settings' then
    v_company_id := coalesce(new.company_id, old.company_id);
  else
    v_company_id := public.current_company_id();
  end if;

  if TG_TABLE_NAME = 'customers' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'email', new.email);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'email', old.email),
        'new', jsonb_build_object('name', new.name, 'email', new.email)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'email', old.email);
    end if;
  elsif TG_TABLE_NAME = 'bookings' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('service', new.service, 'status', new.status);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('service', old.service, 'status', old.status),
        'new', jsonb_build_object('service', new.service, 'status', new.status)
      );
    else
      v_metadata := jsonb_build_object('service', old.service, 'status', old.status);
    end if;
  elsif TG_TABLE_NAME = 'invoices' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('amount', new.amount, 'status', new.status);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('amount', old.amount, 'status', old.status),
        'new', jsonb_build_object('amount', new.amount, 'status', new.status)
      );
    else
      v_metadata := jsonb_build_object('amount', old.amount, 'status', old.status);
    end if;
  elsif TG_TABLE_NAME = 'companies' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'status', new.status);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'status', old.status),
        'new', jsonb_build_object('name', new.name, 'status', new.status)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'status', old.status);
    end if;
  elsif TG_TABLE_NAME = 'profiles' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('email', new.email, 'company_id', new.company_id);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('email', old.email, 'company_id', old.company_id),
        'new', jsonb_build_object('email', new.email, 'company_id', new.company_id)
      );
    else
      v_metadata := jsonb_build_object('email', old.email, 'company_id', old.company_id);
    end if;
  elsif TG_TABLE_NAME = 'roles' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'company_id', new.company_id);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'description', old.description),
        'new', jsonb_build_object('name', new.name, 'description', new.description)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'company_id', old.company_id);
    end if;
  elsif TG_TABLE_NAME = 'permissions' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('code', new.code);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('code', old.code),
        'new', jsonb_build_object('code', new.code)
      );
    else
      v_metadata := jsonb_build_object('code', old.code);
    end if;
  elsif TG_TABLE_NAME = 'plans' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'code', new.code);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'code', old.code),
        'new', jsonb_build_object('name', new.name, 'code', new.code)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'code', old.code);
    end if;
  elsif TG_TABLE_NAME = 'ai_assistant_settings' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'assistant_name', new.assistant_name,
        'changed_fields', jsonb_build_array('created'),
        'new', public.snapshot_ai_assistant_settings(new)
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', public.snapshot_ai_assistant_settings(old),
        'new', public.snapshot_ai_assistant_settings(new),
        'changed_fields', public.ai_assistant_settings_changed_fields(old, new)
      );
    else
      v_metadata := jsonb_build_object(
        'assistant_name', old.assistant_name,
        'changed_fields', jsonb_build_array('soft_deleted'),
        'old', public.snapshot_ai_assistant_settings(old)
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
