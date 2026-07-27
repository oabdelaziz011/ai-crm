-- S6.8: Enterprise Communication Center — customer preferences & reminder schedules

create table if not exists public.customer_communication_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  receive_whatsapp boolean not null default true,
  receive_email boolean not null default true,
  receive_sms boolean not null default true,
  receive_marketing boolean not null default false,
  language text not null default 'en',
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_customer_comm_prefs_company_customer
  on public.customer_communication_preferences (company_id, customer_id);

create index if not exists idx_customer_comm_prefs_company
  on public.customer_communication_preferences (company_id);

drop trigger if exists customer_communication_preferences_updated_at on public.customer_communication_preferences;
create trigger customer_communication_preferences_updated_at
  before update on public.customer_communication_preferences
  for each row execute function public.set_updated_at();

create table if not exists public.communication_reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_key text not null,
  offset_type text not null check (
    offset_type in ('24h_before', '3h_before', '1h_before', '30m_before', 'after_appointment', 'follow_up', 'birthday', 'recurring')
  ),
  channel text not null check (channel in ('whatsapp', 'email', 'sms', 'push')),
  enabled boolean not null default true,
  reference_type text not null,
  reference_id uuid not null,
  scheduled_at timestamptz not null,
  timezone text not null default 'UTC',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_comm_reminder_schedules_due
  on public.communication_reminder_schedules (company_id, status, scheduled_at)
  where status = 'pending';

create index if not exists idx_comm_reminder_schedules_reference
  on public.communication_reminder_schedules (company_id, reference_type, reference_id);

drop trigger if exists communication_reminder_schedules_updated_at on public.communication_reminder_schedules;
create trigger communication_reminder_schedules_updated_at
  before update on public.communication_reminder_schedules
  for each row execute function public.set_updated_at();

create table if not exists public.communication_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null,
  template_key text,
  recipient_hash text not null,
  status text not null,
  provider text,
  provider_response jsonb,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists idx_communication_audit_company_created
  on public.communication_audit_log (company_id, created_at desc);

create unique index if not exists idx_communication_audit_idempotency
  on public.communication_audit_log (company_id, idempotency_key)
  where idempotency_key is not null;

alter table public.customer_communication_preferences enable row level security;
alter table public.communication_reminder_schedules enable row level security;
alter table public.communication_audit_log enable row level security;

drop policy if exists customer_comm_prefs_select on public.customer_communication_preferences;
create policy customer_comm_prefs_select on public.customer_communication_preferences for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists customer_comm_prefs_write on public.customer_communication_preferences;
create policy customer_comm_prefs_write on public.customer_communication_preferences for all
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('customers.edit'))
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('customers.edit'))
    )
  );

drop policy if exists comm_reminder_schedules_select on public.communication_reminder_schedules;
create policy comm_reminder_schedules_select on public.communication_reminder_schedules for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists comm_reminder_schedules_write on public.communication_reminder_schedules;
create policy comm_reminder_schedules_write on public.communication_reminder_schedules for all
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  )
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists communication_audit_select on public.communication_audit_log;
create policy communication_audit_select on public.communication_audit_log for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

comment on table public.customer_communication_preferences is
  'Per-customer channel opt-in, language, and quiet hours for the communication platform.';
comment on table public.communication_reminder_schedules is
  'Timezone-aware scheduled reminders dispatched by the communication scheduler.';
comment on table public.communication_audit_log is
  'PII-safe audit trail for outbound communications (recipient stored as hash).';
