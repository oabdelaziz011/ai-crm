-- ============================================================
-- Vault OS – AI Platform Phase 2 Sprint 2.1.1: Conversation Hardening
-- ============================================================
-- Extends conversations / conversation_messages only. No breaking changes.

-- ── Conversation number sequence registry ─────────────────────

create table if not exists public.conversation_number_sequences (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ── conversations: hardening columns ──────────────────────────

alter table public.conversations
  add column if not exists conversation_number text,
  add column if not exists last_message_preview text,
  add column if not exists last_participant_type text,
  add column if not exists unread_count_employee integer not null default 0,
  add column if not exists unread_count_customer integer not null default 0,
  add column if not exists priority text not null default 'normal',
  add column if not exists locked_by uuid references auth.users(id) on delete set null,
  add column if not exists locked_at timestamptz,
  add column if not exists next_message_sequence bigint not null default 0,
  add column if not exists search_text text not null default '';

update public.conversations
set
  unread_count_employee = coalesce(unread_count_employee, 0),
  unread_count_customer = coalesce(unread_count_customer, 0),
  priority = coalesce(priority, 'normal'),
  next_message_sequence = coalesce(next_message_sequence, 0),
  search_text = coalesce(search_text, '')
where
  unread_count_employee is null
  or unread_count_customer is null
  or priority is null
  or next_message_sequence is null
  or search_text is null;

alter table public.conversations
  drop constraint if exists conversations_priority_check;

alter table public.conversations
  add constraint conversations_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));

alter table public.conversations
  drop constraint if exists conversations_unread_count_employee_check;

alter table public.conversations
  add constraint conversations_unread_count_employee_check
  check (unread_count_employee >= 0);

alter table public.conversations
  drop constraint if exists conversations_unread_count_customer_check;

alter table public.conversations
  add constraint conversations_unread_count_customer_check
  check (unread_count_customer >= 0);

alter table public.conversations
  drop constraint if exists conversations_last_participant_type_check;

alter table public.conversations
  add constraint conversations_last_participant_type_check
  check (
    last_participant_type is null
    or last_participant_type in ('customer', 'employee', 'assistant', 'system')
  );

-- Backfill conversation numbers for existing rows
do $$
declare
  v_company record;
  v_conversation record;
  v_next bigint;
begin
  for v_company in
    select distinct company_id
    from public.conversations
    where conversation_number is null
  loop
    v_next := 0;

    for v_conversation in
      select id
      from public.conversations
      where company_id = v_company.company_id
        and conversation_number is null
      order by created_at asc, id asc
    loop
      v_next := v_next + 1;

      update public.conversations
      set conversation_number = 'CNV-' || lpad(v_next::text, 6, '0')
      where id = v_conversation.id;
    end loop;

    insert into public.conversation_number_sequences (company_id, last_value)
    values (v_company.company_id, v_next)
    on conflict (company_id) do update
      set
        last_value = greatest(conversation_number_sequences.last_value, excluded.last_value),
        updated_at = now();
  end loop;
end $$;

alter table public.conversations
  alter column conversation_number set not null;

create unique index if not exists idx_conversations_company_number
  on public.conversations(company_id, conversation_number)
  where deleted_at is null;

create index if not exists idx_conversations_company_priority
  on public.conversations(company_id, priority, last_message_at desc nulls last)
  where deleted_at is null;

create index if not exists idx_conversations_company_unread_employee
  on public.conversations(company_id, unread_count_employee desc, last_message_at desc nulls last)
  where deleted_at is null and unread_count_employee > 0;

create index if not exists idx_conversations_company_unread_customer
  on public.conversations(company_id, unread_count_customer desc, last_message_at desc nulls last)
  where deleted_at is null and unread_count_customer > 0;

create index if not exists idx_conversations_locked_by
  on public.conversations(locked_by, locked_at desc nulls last)
  where deleted_at is null and locked_by is not null;

create index if not exists idx_conversations_search_text
  on public.conversations(company_id, search_text)
  where deleted_at is null;

-- ── conversation_messages: hardening columns ────────────────

alter table public.conversation_messages
  add column if not exists sequence_number bigint,
  add column if not exists attachment_type text,
  add column if not exists attachment_url text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists search_text text not null default '';

update public.conversation_messages
set search_text = coalesce(search_text, left(content, 2000))
where search_text is null or search_text = '';

-- Backfill sequence numbers per conversation
with ordered_messages as (
  select
    id,
    row_number() over (
      partition by conversation_id
      order by created_at asc, id asc
    ) as seq
  from public.conversation_messages
  where sequence_number is null
)
update public.conversation_messages m
set sequence_number = o.seq
from ordered_messages o
where m.id = o.id;

update public.conversations c
set next_message_sequence = coalesce(x.max_seq, 0)
from (
  select conversation_id, max(sequence_number) as max_seq
  from public.conversation_messages
  group by conversation_id
) x
where c.id = x.conversation_id
  and c.next_message_sequence < x.max_seq;

alter table public.conversation_messages
  alter column sequence_number set not null;

alter table public.conversation_messages
  drop constraint if exists conversation_messages_content_type_check;

alter table public.conversation_messages
  add constraint conversation_messages_content_type_check
  check (content_type in (
    'text',
    'audio',
    'image',
    'template',
    'tool_result',
    'system',
    'media',
    'json'
  ));

alter table public.conversation_messages
  drop constraint if exists conversation_messages_file_size_check;

alter table public.conversation_messages
  add constraint conversation_messages_file_size_check
  check (file_size is null or file_size >= 0);

create unique index if not exists idx_conversation_messages_conversation_sequence
  on public.conversation_messages(conversation_id, sequence_number);

create index if not exists idx_conversation_messages_search_text
  on public.conversation_messages(conversation_id, search_text)
  where search_text <> '';

-- ── conversation number assignment ──────────────────────────

create or replace function public.assign_conversation_number()
returns trigger
language plpgsql
as $$
declare
  v_next bigint;
begin
  if new.conversation_number is not null and btrim(new.conversation_number) <> '' then
    return new;
  end if;

  insert into public.conversation_number_sequences (company_id, last_value)
  values (new.company_id, 1)
  on conflict (company_id) do update
    set
      last_value = conversation_number_sequences.last_value + 1,
      updated_at = now()
  returning last_value into v_next;

  new.conversation_number := 'CNV-' || lpad(v_next::text, 6, '0');
  new.search_text := coalesce(nullif(btrim(new.search_text), ''), new.conversation_number);

  return new;
end;
$$;

drop trigger if exists trg_assign_conversation_number on public.conversations;
create trigger trg_assign_conversation_number
  before insert on public.conversations
  for each row execute procedure public.assign_conversation_number();

-- ── message sequence assignment ───────────────────────────────

create or replace function public.assign_conversation_message_sequence()
returns trigger
language plpgsql
as $$
declare
  v_next bigint;
begin
  if new.sequence_number is not null then
    return new;
  end if;

  update public.conversations
  set next_message_sequence = next_message_sequence + 1
  where id = new.conversation_id
    and deleted_at is null
  returning next_message_sequence into v_next;

  if v_next is null then
    raise exception 'Conversation not found for message sequence assignment.';
  end if;

  new.sequence_number := v_next;

  if new.search_text is null or btrim(new.search_text) = '' then
    new.search_text := left(coalesce(new.content, ''), 2000);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_conversation_message_sequence on public.conversation_messages;
create trigger trg_assign_conversation_message_sequence
  before insert on public.conversation_messages
  for each row execute procedure public.assign_conversation_message_sequence();

-- ── hardened audit event detection ────────────────────────────

create or replace function public.conversation_audit_events(
  p_old public.conversations,
  p_new public.conversations,
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
    return jsonb_build_array('conversation_created');
  end if;

  if p_old.state is distinct from p_new.state then
    if p_new.state = 'closed' then
      v_events := v_events || jsonb_build_array('conversation_closed');
    end if;
    v_events := v_events || jsonb_build_array('state_changed');
  end if;

  if p_old.assigned_user_id is distinct from p_new.assigned_user_id then
    v_events := v_events || jsonb_build_array('assignment_changed');
  end if;

  if p_old.priority is distinct from p_new.priority then
    v_events := v_events || jsonb_build_array('priority_changed');
  end if;

  if p_old.locked_by is distinct from p_new.locked_by and p_new.locked_by is not null then
    v_events := v_events || jsonb_build_array('conversation_locked');
  end if;

  if (
    p_old.unread_count_employee is distinct from p_new.unread_count_employee
    and p_new.unread_count_employee = 0
    and p_old.unread_count_employee > 0
  ) or (
    p_old.unread_count_customer is distinct from p_new.unread_count_customer
    and p_new.unread_count_customer = 0
    and p_old.unread_count_customer > 0
  ) then
    v_events := v_events || jsonb_build_array('unread_reset');
  end if;

  if p_old.metadata is distinct from p_new.metadata
    and v_events = '[]'::jsonb
    and p_old.state is not distinct from p_new.state
    and p_old.assigned_user_id is not distinct from p_new.assigned_user_id
    and p_old.priority is not distinct from p_new.priority
    and p_old.locked_by is not distinct from p_new.locked_by
    and p_old.unread_count_employee is not distinct from p_new.unread_count_employee
    and p_old.unread_count_customer is not distinct from p_new.unread_count_customer
  then
    v_events := v_events || jsonb_build_array('metadata_updated');
  elsif p_old.metadata is distinct from p_new.metadata then
    v_events := v_events || jsonb_build_array('metadata_updated');
  end if;

  if p_old.deleted_at is distinct from p_new.deleted_at and p_new.deleted_at is not null then
    v_events := v_events || jsonb_build_array('conversation_closed');
  end if;

  return v_events;
end;
$$;

-- ── Enhanced audit logging (conversation hardening) ───────────

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
  elsif TG_TABLE_NAME = 'conversations' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'events', jsonb_build_array('conversation_created'),
        'conversation_number', new.conversation_number,
        'channel_type', new.channel_type,
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
          'priority', old.priority,
          'locked_by', old.locked_by,
          'unread_count_employee', old.unread_count_employee,
          'unread_count_customer', old.unread_count_customer
        ),
        'new', jsonb_build_object(
          'state', new.state,
          'assigned_user_id', new.assigned_user_id,
          'channel_type', new.channel_type,
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
