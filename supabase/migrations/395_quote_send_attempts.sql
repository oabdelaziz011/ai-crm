-- Quote sending through platform channels (Email Workspace / WhatsApp Cloud).
-- One row per send attempt: audit trail, idempotency and double-click protection.
-- Writes happen only from the API server (service role) after quotes.send authorization;
-- the browser can read attempts for quotes it can view.

create table if not exists public.quote_send_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  recipient text,
  company_channel_id uuid references public.company_channels(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  delivery_event_id uuid,
  external_message_id text,
  error_code text,
  error_message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint quote_send_attempts_idempotency_unique unique (company_id, idempotency_key)
);

comment on table public.quote_send_attempts is
  'Audit + idempotency record for each quote send through Email Workspace / WhatsApp Cloud. Service-role writes only.';

-- At most one in-flight send per quote (blocks double-click / parallel tabs across keys).
create unique index if not exists quote_send_attempts_one_pending_per_quote
  on public.quote_send_attempts (quote_id)
  where status = 'pending';

create index if not exists quote_send_attempts_quote_created_idx
  on public.quote_send_attempts (company_id, quote_id, created_at desc);

alter table public.quote_send_attempts enable row level security;

drop policy if exists quote_send_attempts_select on public.quote_send_attempts;
create policy quote_send_attempts_select on public.quote_send_attempts
  for select
  using (
    public.is_super_admin()
    or public.has_company_permission(company_id, 'quotes.view')
  );

revoke insert, update, delete on public.quote_send_attempts from anon, authenticated;
grant select on public.quote_send_attempts to authenticated;
grant all on public.quote_send_attempts to service_role;
