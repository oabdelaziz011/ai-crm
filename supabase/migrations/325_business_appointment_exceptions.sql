-- Business Appointment Exception / Apology (batch cancel + notify)
-- Tenant-scoped record of a business apology that cancels matching bookings.

create table if not exists public.business_appointment_exceptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  service_id uuid not null references public.scheduling_services(id) on delete restrict,
  exception_date date not null,
  scope text not null check (scope in ('full_day', 'hours')),
  start_time time,
  end_time time,
  comment text not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  timezone text not null default 'UTC',
  window_start_at timestamptz not null,
  window_end_at timestamptz not null,
  idempotency_key text not null,
  affected_appointments_count integer not null default 0,
  cancelled_appointments_count integer not null default 0,
  notification_sent_count integer not null default 0,
  notification_failed_count integer not null default 0,
  notification_skipped_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint business_appointment_exceptions_window_check
    check (window_end_at > window_start_at),
  constraint business_appointment_exceptions_hours_check
    check (
      (scope = 'full_day' and start_time is null and end_time is null)
      or (scope = 'hours' and start_time is not null and end_time is not null and end_time > start_time)
    ),
  constraint business_appointment_exceptions_comment_check
    check (length(trim(comment)) > 0),
  constraint business_appointment_exceptions_idempotency_unique
    unique (company_id, idempotency_key)
);

create index if not exists idx_business_appointment_exceptions_company_created
  on public.business_appointment_exceptions(company_id, created_at desc);

create index if not exists idx_business_appointment_exceptions_company_service_date
  on public.business_appointment_exceptions(company_id, service_id, exception_date);

create table if not exists public.business_appointment_exception_items (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null
    references public.business_appointment_exceptions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null references public.scheduling_bookings(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  cancellation_status text not null default 'pending'
    check (cancellation_status in ('pending', 'cancelled', 'skipped', 'failed')),
  notification_channel text not null default 'whatsapp',
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint business_appointment_exception_items_unique_booking
    unique (exception_id, booking_id)
);

create index if not exists idx_business_appointment_exception_items_exception
  on public.business_appointment_exception_items(exception_id);

create index if not exists idx_business_appointment_exception_items_company_booking
  on public.business_appointment_exception_items(company_id, booking_id);

alter table public.business_appointment_exceptions enable row level security;
alter table public.business_appointment_exception_items enable row level security;

drop policy if exists business_appointment_exceptions_select on public.business_appointment_exceptions;
create policy business_appointment_exceptions_select
  on public.business_appointment_exceptions for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists business_appointment_exceptions_insert on public.business_appointment_exceptions;
create policy business_appointment_exceptions_insert
  on public.business_appointment_exceptions for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('scheduling.edit')
        and public.user_has_permission('bookings.edit')
      )
    )
  );

drop policy if exists business_appointment_exceptions_update on public.business_appointment_exceptions;
create policy business_appointment_exceptions_update
  on public.business_appointment_exceptions for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('scheduling.edit')
        and public.user_has_permission('bookings.edit')
      )
    )
  );

drop policy if exists business_appointment_exception_items_select on public.business_appointment_exception_items;
create policy business_appointment_exception_items_select
  on public.business_appointment_exception_items for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists business_appointment_exception_items_insert on public.business_appointment_exception_items;
create policy business_appointment_exception_items_insert
  on public.business_appointment_exception_items for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('scheduling.edit')
        and public.user_has_permission('bookings.edit')
      )
    )
  );

drop policy if exists business_appointment_exception_items_update on public.business_appointment_exception_items;
create policy business_appointment_exception_items_update
  on public.business_appointment_exception_items for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('scheduling.edit')
        and public.user_has_permission('bookings.edit')
      )
    )
  );

drop trigger if exists trg_audit_business_appointment_exceptions on public.business_appointment_exceptions;
create trigger trg_audit_business_appointment_exceptions
  after insert or update or delete on public.business_appointment_exceptions
  for each row execute procedure public.write_audit_log();

comment on table public.business_appointment_exceptions is
  'Business apology / appointment exception batches that cancel matching bookings and notify customers.';
comment on table public.business_appointment_exception_items is
  'Per-booking outcomes for a business appointment exception (cancel + WhatsApp notification tracking).';
