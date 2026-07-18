-- ============================================================
-- Vault OS – AI Platform Phase 2 Sprint 2.2: Channel Registry
-- ============================================================
-- Generic channel registry infrastructure. No provider implementations.

-- ── communication_channels (global catalog) ───────────────────

create table if not exists public.communication_channels (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  description text not null default '',
  icon text,
  supports_media boolean not null default false,
  supports_templates boolean not null default false,
  supports_reactions boolean not null default false,
  supports_typing boolean not null default false,
  supports_read_receipts boolean not null default false,
  supports_delivery_receipts boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists communication_channels_updated_at on public.communication_channels;
create trigger communication_channels_updated_at
  before update on public.communication_channels
  for each row execute procedure public.set_updated_at();

create index if not exists idx_communication_channels_key
  on public.communication_channels(key);

create index if not exists idx_communication_channels_is_active
  on public.communication_channels(is_active)
  where is_active = true;

-- ── company_channels (tenant connections) ───────────────────

create table if not exists public.company_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_id uuid not null references public.communication_channels(id) on delete restrict,
  display_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'disabled', 'error')),
  provider text not null default '',
  configuration jsonb not null default '{}'::jsonb,
  webhook_url text,
  webhook_secret text,
  external_account_id text,
  is_default boolean not null default false,
  is_enabled boolean not null default false,
  health_status text not null default 'unknown'
    check (health_status in ('connected', 'disconnected', 'warning', 'error', 'unknown')),
  last_health_check timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

drop trigger if exists company_channels_updated_at on public.company_channels;
create trigger company_channels_updated_at
  before update on public.company_channels
  for each row execute procedure public.set_updated_at();

create index if not exists idx_company_channels_company_id
  on public.company_channels(company_id)
  where deleted_at is null;

create index if not exists idx_company_channels_channel_id
  on public.company_channels(channel_id)
  where deleted_at is null;

create index if not exists idx_company_channels_company_enabled
  on public.company_channels(company_id, is_enabled)
  where deleted_at is null;

create index if not exists idx_company_channels_company_health
  on public.company_channels(company_id, health_status)
  where deleted_at is null;

create index if not exists idx_company_channels_external_account
  on public.company_channels(company_id, external_account_id)
  where deleted_at is null and external_account_id is not null;

create unique index if not exists idx_company_channels_one_default
  on public.company_channels(company_id)
  where is_default = true and deleted_at is null;

create index if not exists idx_company_channels_deleted_at
  on public.company_channels(deleted_at)
  where deleted_at is not null;

-- ── conversations: link to company channel (backward compatible) ─

alter table public.conversations
  add column if not exists company_channel_id uuid references public.company_channels(id) on delete restrict;

create index if not exists idx_conversations_company_channel_id
  on public.conversations(company_channel_id)
  where deleted_at is null and company_channel_id is not null;

-- Extend conversation channel types to align with registry catalog
alter table public.conversations
  drop constraint if exists conversations_channel_type_check;

alter table public.conversations
  add constraint conversations_channel_type_check
  check (channel_type in (
    'web_chat',
    'whatsapp',
    'messenger',
    'telegram',
    'instagram',
    'voice',
    'email',
    'sms'
  ));

-- ── integrity: company channel must belong to same company ────

create or replace function public.validate_conversation_company_integrity()
returns trigger
language plpgsql
as $$
declare
  v_assistant_company_id uuid;
  v_channel_company_id uuid;
  v_channel_key text;
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

  if new.company_channel_id is not null then
    select cc.company_id, ch.key
    into v_channel_company_id, v_channel_key
    from public.company_channels cc
    inner join public.communication_channels ch on ch.id = cc.channel_id
    where cc.id = new.company_channel_id
      and cc.deleted_at is null;

    if v_channel_company_id is null then
      raise exception 'Company channel not found or inactive for conversation.';
    end if;

    if v_channel_company_id is distinct from new.company_id then
      raise exception 'Company channel must belong to the same company as the conversation.';
    end if;

    if v_channel_key is distinct from new.channel_type then
      raise exception 'Conversation channel_type must match the registered company channel type.';
    end if;
  end if;

  return new;
end;
$$;

-- ── soft delete (block physical delete) ───────────────────────

create or replace function public.prevent_company_channel_physical_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Company channels cannot be physically deleted. Use soft delete instead.';
end;
$$;

drop trigger if exists trg_prevent_company_channels_physical_delete on public.company_channels;
create trigger trg_prevent_company_channels_physical_delete
  before delete on public.company_channels
  for each row execute procedure public.prevent_company_channel_physical_delete();

-- ── Row Level Security ────────────────────────────────────────

alter table public.communication_channels enable row level security;
alter table public.company_channels enable row level security;

drop policy if exists communication_channels_select on public.communication_channels;
create policy communication_channels_select
  on public.communication_channels for select
  using (
    auth.role() = 'authenticated'
    and is_active = true
  );

drop policy if exists communication_channels_write on public.communication_channels;
create policy communication_channels_write
  on public.communication_channels for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists company_channels_select on public.company_channels;
create policy company_channels_select
  on public.company_channels for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists company_channels_insert on public.company_channels;
create policy company_channels_insert
  on public.company_channels for insert
  with check (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists company_channels_update on public.company_channels;
create policy company_channels_update
  on public.company_channels for update
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

drop policy if exists company_channels_delete on public.company_channels;
create policy company_channels_delete
  on public.company_channels for delete
  using (false);

-- ── RBAC permissions ──────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('channels.view', 'Channels', 'Channels', 'View', 'View company communication channels'),
  ('channels.manage', 'Channels', 'Channels', 'Manage', 'Manage company communication channels')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── seed communication channel catalog ────────────────────────

insert into public.communication_channels (
  key,
  display_name,
  description,
  icon,
  supports_media,
  supports_templates,
  supports_reactions,
  supports_typing,
  supports_read_receipts,
  supports_delivery_receipts,
  is_active
)
values
  (
    'whatsapp',
    'WhatsApp',
    'WhatsApp Business and Cloud API messaging.',
    'message-circle',
    true,
    true,
    true,
    true,
    true,
    true,
    true
  ),
  (
    'telegram',
    'Telegram',
    'Telegram Bot API messaging.',
    'send',
    true,
    false,
    true,
    false,
    false,
    true,
    true
  ),
  (
    'messenger',
    'Messenger',
    'Meta Messenger messaging.',
    'messages-square',
    true,
    true,
    true,
    true,
    true,
    true,
    true
  ),
  (
    'instagram',
    'Instagram',
    'Instagram Direct messaging.',
    'instagram',
    true,
    false,
    true,
    true,
    true,
    true,
    true
  ),
  (
    'web_chat',
    'Web Chat',
    'Embedded web chat widget and dashboard chat.',
    'globe',
    true,
    false,
    false,
    true,
    true,
    false,
    true
  ),
  (
    'email',
    'Email',
    'Email communication channel.',
    'mail',
    true,
    true,
    false,
    false,
    true,
    true,
    true
  ),
  (
    'sms',
    'SMS',
    'SMS text messaging.',
    'smartphone',
    false,
    true,
    false,
    false,
    false,
    true,
    true
  ),
  (
    'voice',
    'Voice AI',
    'Voice and telephony communication.',
    'phone',
    false,
    false,
    false,
    false,
    false,
    false,
    true
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  icon = excluded.icon,
  supports_media = excluded.supports_media,
  supports_templates = excluded.supports_templates,
  supports_reactions = excluded.supports_reactions,
  supports_typing = excluded.supports_typing,
  supports_read_receipts = excluded.supports_read_receipts,
  supports_delivery_receipts = excluded.supports_delivery_receipts,
  is_active = excluded.is_active,
  updated_at = now();

-- ── audit helpers ─────────────────────────────────────────────

create or replace function public.company_channel_audit_events(
  p_old public.company_channels,
  p_new public.company_channels,
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
    return jsonb_build_array('channel_connected');
  end if;

  if p_old.is_enabled is distinct from p_new.is_enabled then
    if p_new.is_enabled then
      v_events := v_events || jsonb_build_array('channel_enabled');
    else
      v_events := v_events || jsonb_build_array('channel_disabled');
    end if;
  end if;

  if p_old.configuration is distinct from p_new.configuration then
    v_events := v_events || jsonb_build_array('configuration_updated');
  end if;

  if p_old.health_status is distinct from p_new.health_status then
    v_events := v_events || jsonb_build_array('health_status_changed');
  end if;

  if p_old.is_default is distinct from p_new.is_default and p_new.is_default then
    v_events := v_events || jsonb_build_array('default_channel_changed');
  end if;

  if p_old.deleted_at is distinct from p_new.deleted_at and p_new.deleted_at is not null then
    v_events := v_events || jsonb_build_array('channel_disabled');
  end if;

  return v_events;
end;
$$;

-- ── Enhanced audit logging (channel registry) ─────────────────

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

drop trigger if exists trg_audit_company_channels on public.company_channels;
create trigger trg_audit_company_channels
  after insert or update or delete on public.company_channels
  for each row execute procedure public.write_audit_log();
