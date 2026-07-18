-- ============================================================
-- Fix company DELETE audit FK violation
--
-- trg_audit_companies is AFTER DELETE. write_audit_log() tried to
-- insert audit_logs.company_id = deleted company id, but the row is
-- already gone, violating audit_logs_company_id_fkey.
--
-- Minimal fix: NULL company_id on company DELETE; preserve identity in
-- entity_id + metadata.company_id. Existing ON DELETE SET NULL on the
-- FK continues to apply to prior audit rows.
-- ============================================================

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
  elsif TG_TABLE_NAME = 'conversations' then
    v_company_id := coalesce(new.company_id, old.company_id);
  elsif TG_TABLE_NAME = 'company_channels' then
    v_company_id := coalesce(new.company_id, old.company_id);
  elsif TG_TABLE_NAME in ('conversation_participants', 'conversation_messages') then
    v_company_id := public.conversation_audit_company_id(coalesce(new.conversation_id, old.conversation_id));
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
  elsif TG_TABLE_NAME = 'company_channels' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'events', jsonb_build_array('channel_connected'),
        'display_name', new.display_name,
        'channel_id', new.channel_id,
        'provider', new.provider,
        'status', new.status,
        'health_status', new.health_status
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'events', public.company_channel_audit_events(old, new, TG_OP),
        'display_name', new.display_name,
        'old', jsonb_build_object(
          'status', old.status,
          'is_enabled', old.is_enabled,
          'is_default', old.is_default,
          'health_status', old.health_status,
          'provider', old.provider
        ),
        'new', jsonb_build_object(
          'status', new.status,
          'is_enabled', new.is_enabled,
          'is_default', new.is_default,
          'health_status', new.health_status,
          'provider', new.provider
        )
      );
    else
      v_metadata := jsonb_build_object(
        'events', jsonb_build_array('channel_disabled'),
        'display_name', old.display_name,
        'channel_id', old.channel_id
      );
    end if;
  elsif TG_TABLE_NAME = 'conversations' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'events', jsonb_build_array('conversation_created'),
        'conversation_number', new.conversation_number,
        'channel_type', new.channel_type,
        'company_channel_id', new.company_channel_id,
        'state', new.state,
        'priority', new.priority,
        'ai_assistant_id', new.ai_assistant_id
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'events', public.conversation_audit_events(old, new, TG_OP),
        'conversation_number', new.conversation_number,
        'old', jsonb_build_object(
          'state', old.state,
          'assigned_user_id', old.assigned_user_id,
          'channel_type', old.channel_type,
          'company_channel_id', old.company_channel_id,
          'priority', old.priority,
          'locked_by', old.locked_by,
          'unread_count_employee', old.unread_count_employee,
          'unread_count_customer', old.unread_count_customer
        ),
        'new', jsonb_build_object(
          'state', new.state,
          'assigned_user_id', new.assigned_user_id,
          'channel_type', new.channel_type,
          'company_channel_id', new.company_channel_id,
          'priority', new.priority,
          'locked_by', new.locked_by,
          'unread_count_employee', new.unread_count_employee,
          'unread_count_customer', new.unread_count_customer
        )
      );
    else
      v_metadata := jsonb_build_object(
        'events', jsonb_build_array('conversation_closed'),
        'conversation_number', old.conversation_number,
        'channel_type', old.channel_type,
        'state', old.state
      );
    end if;
  elsif TG_TABLE_NAME = 'conversation_participants' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'events', jsonb_build_array('participant_added'),
        'conversation_id', new.conversation_id,
        'participant_type', new.participant_type,
        'display_name', new.display_name
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'events', case
          when old.deleted_at is null and new.deleted_at is not null
            then jsonb_build_array('participant_removed')
          else jsonb_build_array('participant_updated')
        end,
        'conversation_id', new.conversation_id,
        'participant_type', new.participant_type,
        'old', jsonb_build_object('display_name', old.display_name, 'deleted_at', old.deleted_at),
        'new', jsonb_build_object('display_name', new.display_name, 'deleted_at', new.deleted_at)
      );
    else
      v_metadata := jsonb_build_object(
        'events', jsonb_build_array('participant_removed'),
        'conversation_id', old.conversation_id,
        'participant_type', old.participant_type
      );
    end if;
  elsif TG_TABLE_NAME = 'conversation_messages' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'events', jsonb_build_array('message_added'),
        'conversation_id', new.conversation_id,
        'message_type', new.message_type,
        'content_type', new.content_type,
        'status', new.status,
        'sequence_number', new.sequence_number
      );
    else
      v_metadata := jsonb_build_object(
        'conversation_id', coalesce(new.conversation_id, old.conversation_id),
        'message_type', coalesce(new.message_type, old.message_type)
      );
    end if;
  end if;

  -- Company row is already gone on AFTER DELETE; FK requires NULL company_id.
  if TG_TABLE_NAME = 'companies' and TG_OP = 'DELETE' then
    v_company_id := null;
    v_metadata := v_metadata || jsonb_build_object('company_id', old.id);
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
