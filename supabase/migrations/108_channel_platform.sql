-- ============================================================
-- Vault OS – Phase 6: Enterprise Channel Platform
-- Provider-independent messaging layer (no WhatsApp/provider SDKs).
-- ============================================================

-- ── channel_sessions (external thread → conversation binding) ─

create table if not exists public.channel_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_channel_id uuid not null references public.company_channels(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel_key text not null,
  external_thread_id text not null,
  sender_external_id text,
  session_status text not null default 'active'
    check (session_status in ('active', 'closed', 'transferred')),
  metadata jsonb not null default '{}'::jsonb,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_channel_id, external_thread_id)
);

drop trigger if exists channel_sessions_updated_at on public.channel_sessions;
create trigger channel_sessions_updated_at
  before update on public.channel_sessions
  for each row execute procedure public.set_updated_at();

create index if not exists idx_channel_sessions_company
  on public.channel_sessions(company_id, updated_at desc);

create index if not exists idx_channel_sessions_conversation
  on public.channel_sessions(conversation_id);

-- ── channel_inbound_events (idempotent inbound webhook/direct events) ─

create table if not exists public.channel_inbound_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_channel_id uuid not null references public.company_channels(id) on delete cascade,
  channel_key text not null,
  idempotency_key text not null,
  external_thread_id text not null,
  external_message_id text,
  sender_external_id text,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed', 'duplicate')),
  conversation_id uuid references public.conversations(id) on delete set null,
  channel_session_id uuid references public.channel_sessions(id) on delete set null,
  incoming_message_id uuid references public.conversation_messages(id) on delete set null,
  runtime_execution_id uuid references public.runtime_executions(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_channel_id, idempotency_key)
);

drop trigger if exists channel_inbound_events_updated_at on public.channel_inbound_events;
create trigger channel_inbound_events_updated_at
  before update on public.channel_inbound_events
  for each row execute procedure public.set_updated_at();

create index if not exists idx_channel_inbound_events_company
  on public.channel_inbound_events(company_id, received_at desc);

create index if not exists idx_channel_inbound_events_status
  on public.channel_inbound_events(processing_status, received_at desc);

-- ── channel_delivery_events (outbound delivery lifecycle) ─────

create table if not exists public.channel_delivery_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_channel_id uuid not null references public.company_channels(id) on delete cascade,
  channel_key text not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel_session_id uuid references public.channel_sessions(id) on delete set null,
  outbound_message_id uuid references public.conversation_messages(id) on delete set null,
  external_thread_id text not null,
  external_message_id text,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  payload jsonb not null default '{}'::jsonb,
  provider_response jsonb not null default '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists channel_delivery_events_updated_at on public.channel_delivery_events;
create trigger channel_delivery_events_updated_at
  before update on public.channel_delivery_events
  for each row execute procedure public.set_updated_at();

create index if not exists idx_channel_delivery_events_company
  on public.channel_delivery_events(company_id, created_at desc);

create index if not exists idx_channel_delivery_events_conversation
  on public.channel_delivery_events(conversation_id, created_at desc);

create index if not exists idx_channel_delivery_events_status
  on public.channel_delivery_events(delivery_status, created_at desc);

-- ── permissions ───────────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('channel.platform.view', 'Channel Platform', 'Channel Platform', 'View', 'View channel platform events and delivery status'),
  ('channel.platform.route', 'Channel Platform', 'Channel Platform', 'Route', 'Route inbound channel events through the platform'),
  ('channel.platform.dispatch', 'Channel Platform', 'Channel Platform', 'Dispatch', 'Dispatch outbound channel messages')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description;

-- ── RLS ───────────────────────────────────────────────────────

alter table public.channel_sessions enable row level security;
alter table public.channel_inbound_events enable row level security;
alter table public.channel_delivery_events enable row level security;

drop policy if exists channel_sessions_select on public.channel_sessions;
create policy channel_sessions_select
  on public.channel_sessions for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists channel_sessions_insert on public.channel_sessions;
create policy channel_sessions_insert
  on public.channel_sessions for insert
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists channel_sessions_update on public.channel_sessions;
create policy channel_sessions_update
  on public.channel_sessions for update
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists channel_inbound_events_select on public.channel_inbound_events;
create policy channel_inbound_events_select
  on public.channel_inbound_events for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists channel_inbound_events_insert on public.channel_inbound_events;
create policy channel_inbound_events_insert
  on public.channel_inbound_events for insert
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists channel_inbound_events_update on public.channel_inbound_events;
create policy channel_inbound_events_update
  on public.channel_inbound_events for update
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists channel_delivery_events_select on public.channel_delivery_events;
create policy channel_delivery_events_select
  on public.channel_delivery_events for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists channel_delivery_events_insert on public.channel_delivery_events;
create policy channel_delivery_events_insert
  on public.channel_delivery_events for insert
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists channel_delivery_events_update on public.channel_delivery_events;
create policy channel_delivery_events_update
  on public.channel_delivery_events for update
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );
