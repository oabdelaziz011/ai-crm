-- Bilingual (ar/en) idle timeout WhatsApp message templates.
-- Prefer JSON maps; migrate any existing single-language text columns.

alter table public.ai_assistant_settings
  add column if not exists session_idle_warning_messages jsonb not null default jsonb_build_object(
    'ar', 'تنبيه: جلسة المحادثة ستنتهي قريباً. يرجى الرد سريعاً لاستكمال المحادثة.',
    'en', 'Reminder: this conversation session will end soon. Please reply quickly to continue.'
  );

alter table public.ai_assistant_settings
  add column if not exists session_ended_messages jsonb not null default jsonb_build_object(
    'ar', 'انتهت جلسة المحادثة بسبب عدم الرد. يمكنك إرسال رسالة جديدة لبدء جلسة جديدة.',
    'en', 'This conversation session has ended due to inactivity. Send a new message to start again.'
  );

-- Backfill from legacy single-text columns when present.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_assistant_settings'
      and column_name = 'session_idle_warning_message'
  ) then
    update public.ai_assistant_settings
    set session_idle_warning_messages = jsonb_build_object(
      'ar', coalesce(nullif(trim(session_idle_warning_message), ''), session_idle_warning_messages->>'ar'),
      'en', coalesce(
        nullif(session_idle_warning_messages->>'en', ''),
        'Reminder: this conversation session will end soon. Please reply quickly to continue.'
      )
    )
    where coalesce(trim(session_idle_warning_message), '') <> '';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_assistant_settings'
      and column_name = 'session_ended_message'
  ) then
    update public.ai_assistant_settings
    set session_ended_messages = jsonb_build_object(
      'ar', coalesce(nullif(trim(session_ended_message), ''), session_ended_messages->>'ar'),
      'en', coalesce(
        nullif(session_ended_messages->>'en', ''),
        'This conversation session has ended due to inactivity. Send a new message to start again.'
      )
    )
    where coalesce(trim(session_ended_message), '') <> '';
  end if;
end $$;

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_session_idle_warning_messages_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_session_idle_warning_messages_check
  check (
    jsonb_typeof(session_idle_warning_messages) = 'object'
    and coalesce(char_length(session_idle_warning_messages->>'ar'), 0) <= 1000
    and coalesce(char_length(session_idle_warning_messages->>'en'), 0) <= 1000
  );

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_session_ended_messages_check;

alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_session_ended_messages_check
  check (
    jsonb_typeof(session_ended_messages) = 'object'
    and coalesce(char_length(session_ended_messages->>'ar'), 0) <= 1000
    and coalesce(char_length(session_ended_messages->>'en'), 0) <= 1000
  );

-- Keep legacy text columns in sync for older readers (best-effort Arabic/default).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_assistant_settings'
      and column_name = 'session_idle_warning_message'
  ) then
    update public.ai_assistant_settings
    set session_idle_warning_message = coalesce(
      nullif(session_idle_warning_messages->>'ar', ''),
      nullif(session_idle_warning_messages->>'en', ''),
      session_idle_warning_message
    );
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_assistant_settings'
      and column_name = 'session_ended_message'
  ) then
    update public.ai_assistant_settings
    set session_ended_message = coalesce(
      nullif(session_ended_messages->>'ar', ''),
      nullif(session_ended_messages->>'en', ''),
      session_ended_message
    );
  end if;
end $$;

create or replace function public.snapshot_ai_assistant_settings(p_row public.ai_assistant_settings)
returns jsonb
language plpgsql
stable
set search_path = public
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
    'session_idle_warning_message', p_row.session_idle_warning_message,
    'session_ended_message', p_row.session_ended_message,
    'session_idle_warning_messages', p_row.session_idle_warning_messages,
    'session_ended_messages', p_row.session_ended_messages,
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
set search_path = public
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
  if p_old.session_idle_warning_message is distinct from p_new.session_idle_warning_message then
    v_changes := v_changes || jsonb_build_array('session_idle_warning_message');
  end if;
  if p_old.session_ended_message is distinct from p_new.session_ended_message then
    v_changes := v_changes || jsonb_build_array('session_ended_message');
  end if;
  if p_old.session_idle_warning_messages is distinct from p_new.session_idle_warning_messages then
    v_changes := v_changes || jsonb_build_array('session_idle_warning_messages');
  end if;
  if p_old.session_ended_messages is distinct from p_new.session_ended_messages then
    v_changes := v_changes || jsonb_build_array('session_ended_messages');
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
  return v_changes;
end;
$$;
