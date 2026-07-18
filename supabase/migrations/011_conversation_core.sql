-- ============================================================
-- Vault OS – AI Platform Phase 2 Sprint 2.1: Conversation Core
-- ============================================================
-- Channel-agnostic, multi-tenant conversation infrastructure.
-- Tables: conversations, conversation_participants, conversation_messages

-- ── conversations ───────────────────────────────────────────

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ai_assistant_id uuid not null references public.ai_assistant_settings(id) on delete restrict,
  channel_type text not null
    check (channel_type in ('web_chat', 'whatsapp', 'messenger', 'telegram', 'instagram', 'voice')),
  channel_instance_id uuid,
  state text not null default 'idle'
    check (state in (
      'idle',
      'greeting',
      'collecting_information',
      'waiting_user',
      'waiting_api',
      'completed',
      'cancelled',
      'transferred_to_human',
      'closed'
    )),
  external_thread_id text,
  customer_id uuid references public.customers(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_conversations_company_id
  on public.conversations(company_id);

create index if not exists idx_conversations_company_state
  on public.conversations(company_id, state)
  where deleted_at is null;

create index if not exists idx_conversations_ai_assistant_id
  on public.conversations(ai_assistant_id);

create index if not exists idx_conversations_channel_type
  on public.conversations(company_id, channel_type)
  where deleted_at is null;

create index if not exists idx_conversations_assigned_user_id
  on public.conversations(assigned_user_id)
  where assigned_user_id is not null and deleted_at is null;

create index if not exists idx_conversations_last_message_at
  on public.conversations(company_id, last_message_at desc nulls last)
  where deleted_at is null;

create index if not exists idx_conversations_deleted_at
  on public.conversations(deleted_at)
  where deleted_at is not null;

create index if not exists idx_conversations_external_thread_id
  on public.conversations(company_id, channel_type, external_thread_id)
  where external_thread_id is not null and deleted_at is null;

-- ── conversation_participants ───────────────────────────────

create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  participant_type text not null
    check (participant_type in ('customer', 'employee', 'assistant', 'system')),
  display_name text,
  profile_ref uuid,
  external_participant_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_conversation_participants_conversation_id
  on public.conversation_participants(conversation_id)
  where deleted_at is null;

create index if not exists idx_conversation_participants_type
  on public.conversation_participants(conversation_id, participant_type)
  where deleted_at is null;

create unique index if not exists idx_conversation_participants_active_external
  on public.conversation_participants(conversation_id, participant_type, external_participant_id)
  where deleted_at is null and external_participant_id is not null;

-- ── conversation_messages ───────────────────────────────────

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  participant_id uuid references public.conversation_participants(id) on delete set null,
  message_type text not null
    check (message_type in ('incoming', 'outgoing', 'system', 'internal_note')),
  content_type text not null default 'text'
    check (content_type in ('text', 'audio', 'image', 'template', 'tool_result', 'system')),
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivered', 'failed', 'read')),
  external_message_id text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_conversation_messages_conversation_created_at
  on public.conversation_messages(conversation_id, created_at asc);

create unique index if not exists idx_conversation_messages_external_id
  on public.conversation_messages(conversation_id, external_message_id)
  where external_message_id is not null;

-- ── updated_at triggers ─────────────────────────────────────

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at
  before update on public.conversations
  for each row execute procedure public.set_updated_at();

drop trigger if exists conversation_participants_updated_at on public.conversation_participants;
create trigger conversation_participants_updated_at
  before update on public.conversation_participants
  for each row execute procedure public.set_updated_at();

-- ── company / assistant integrity ───────────────────────────

create or replace function public.validate_conversation_company_integrity()
returns trigger
language plpgsql
as $$
declare
  v_assistant_company_id uuid;
begin
  select company_id
  into v_assistant_company_id
  from public.ai_assistant_settings
  where id = new.ai_assistant_id
    and deleted_at is null;

  if v_assistant_company_id is null then
    raise exception 'AI Assistant settings not found or inactive for conversation.';
  end if;

  if v_assistant_company_id is distinct from new.company_id then
    raise exception 'AI Assistant must belong to the same company as the conversation.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_conversation_company_integrity on public.conversations;
create trigger trg_validate_conversation_company_integrity
  before insert or update on public.conversations
  for each row execute procedure public.validate_conversation_company_integrity();

-- ── soft delete (block physical delete) ─────────────────────

create or replace function public.prevent_conversation_physical_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Conversations cannot be physically deleted. Use soft delete instead.';
end;
$$;

drop trigger if exists trg_prevent_conversations_physical_delete on public.conversations;
create trigger trg_prevent_conversations_physical_delete
  before delete on public.conversations
  for each row execute procedure public.prevent_conversation_physical_delete();

create or replace function public.prevent_conversation_participant_physical_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Conversation participants cannot be physically deleted. Use soft delete instead.';
end;
$$;

drop trigger if exists trg_prevent_conversation_participants_physical_delete on public.conversation_participants;
create trigger trg_prevent_conversation_participants_physical_delete
  before delete on public.conversation_participants
  for each row execute procedure public.prevent_conversation_participant_physical_delete();

create or replace function public.prevent_conversation_message_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Conversation messages are append-only and cannot be modified or deleted.';
end;
$$;

drop trigger if exists trg_prevent_conversation_messages_update on public.conversation_messages;
create trigger trg_prevent_conversation_messages_update
  before update on public.conversation_messages
  for each row execute procedure public.prevent_conversation_message_mutation();

drop trigger if exists trg_prevent_conversation_messages_delete on public.conversation_messages;
create trigger trg_prevent_conversation_messages_delete
  before delete on public.conversation_messages
  for each row execute procedure public.prevent_conversation_message_mutation();

-- ── RLS helpers ─────────────────────────────────────────────

create or replace function public.conversation_belongs_to_current_company(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and c.deleted_at is null
      and (
        public.is_super_admin()
        or c.company_id = public.current_company_id()
      )
  );
$$;

-- ── Row Level Security ──────────────────────────────────────

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.conversation_messages enable row level security;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select
  on public.conversations for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert
  on public.conversations for insert
  with check (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists conversations_update on public.conversations;
create policy conversations_update
  on public.conversations for update
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

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete
  on public.conversations for delete
  using (false);

drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select
  on public.conversation_participants for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and public.conversation_belongs_to_current_company(conversation_id)
  );

drop policy if exists conversation_participants_insert on public.conversation_participants;
create policy conversation_participants_insert
  on public.conversation_participants for insert
  with check (
    auth.role() = 'authenticated'
    and deleted_at is null
    and public.conversation_belongs_to_current_company(conversation_id)
  );

drop policy if exists conversation_participants_update on public.conversation_participants;
create policy conversation_participants_update
  on public.conversation_participants for update
  using (
    auth.role() = 'authenticated'
    and public.conversation_belongs_to_current_company(conversation_id)
  )
  with check (
    auth.role() = 'authenticated'
    and public.conversation_belongs_to_current_company(conversation_id)
  );

drop policy if exists conversation_participants_delete on public.conversation_participants;
create policy conversation_participants_delete
  on public.conversation_participants for delete
  using (false);

drop policy if exists conversation_messages_select on public.conversation_messages;
create policy conversation_messages_select
  on public.conversation_messages for select
  using (
    auth.role() = 'authenticated'
    and public.conversation_belongs_to_current_company(conversation_id)
  );

drop policy if exists conversation_messages_insert on public.conversation_messages;
create policy conversation_messages_insert
  on public.conversation_messages for insert
  with check (
    auth.role() = 'authenticated'
    and public.conversation_belongs_to_current_company(conversation_id)
  );

drop policy if exists conversation_messages_update on public.conversation_messages;
create policy conversation_messages_update
  on public.conversation_messages for update
  using (false);

drop policy if exists conversation_messages_delete on public.conversation_messages;
create policy conversation_messages_delete
  on public.conversation_messages for delete
  using (false);

-- ── Audit helpers ───────────────────────────────────────────

create or replace function public.conversation_audit_company_id(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.conversations
  where id = p_conversation_id;
$$;

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

  if p_old.deleted_at is distinct from p_new.deleted_at and p_new.deleted_at is not null then
    v_events := v_events || jsonb_build_array('conversation_closed');
  end if;

  return v_events;
end;
$$;

-- ── Enhanced audit logging (conversation domain) ──────────────

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
        'channel_type', new.channel_type,
        'state', new.state,
        'ai_assistant_id', new.ai_assistant_id
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'events', public.conversation_audit_events(old, new, TG_OP),
        'old', jsonb_build_object(
          'state', old.state,
          'assigned_user_id', old.assigned_user_id,
          'channel_type', old.channel_type
        ),
        'new', jsonb_build_object(
          'state', new.state,
          'assigned_user_id', new.assigned_user_id,
          'channel_type', new.channel_type
        )
      );
    else
      v_metadata := jsonb_build_object(
        'events', jsonb_build_array('conversation_closed'),
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
        'status', new.status
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

drop trigger if exists trg_audit_conversations on public.conversations;
create trigger trg_audit_conversations
  after insert or update or delete on public.conversations
  for each row execute procedure public.write_audit_log();

drop trigger if exists trg_audit_conversation_participants on public.conversation_participants;
create trigger trg_audit_conversation_participants
  after insert or update or delete on public.conversation_participants
  for each row execute procedure public.write_audit_log();

drop trigger if exists trg_audit_conversation_messages on public.conversation_messages;
create trigger trg_audit_conversation_messages
  after insert or update or delete on public.conversation_messages
  for each row execute procedure public.write_audit_log();
