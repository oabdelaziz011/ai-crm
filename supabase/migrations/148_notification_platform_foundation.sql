-- Sprint 6.1 — Notification Platform Foundation

alter table public.notifications
  add column if not exists archived_at timestamptz,
  add column if not exists priority text not null default 'normal',
  add column if not exists event_type text,
  add column if not exists channel text not null default 'in_app',
  add column if not exists delivery_status text not null default 'delivered';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notifications_priority_check'
  ) then
    alter table public.notifications
      add constraint notifications_priority_check
      check (priority in ('low', 'normal', 'high', 'urgent'));
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notifications_channel_check'
  ) then
    alter table public.notifications
      add constraint notifications_channel_check
      check (channel in ('in_app', 'email', 'whatsapp', 'sms', 'push', 'webhook'));
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notifications_delivery_status_check'
  ) then
    alter table public.notifications
      add constraint notifications_delivery_status_check
      check (delivery_status in ('pending', 'delivered', 'read', 'archived'));
  end if;
exception when others then null;
end $$;

create index if not exists idx_notifications_company_archived
  on public.notifications(company_id, archived_at);

create index if not exists idx_notifications_company_priority
  on public.notifications(company_id, priority, created_at desc);

create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'whatsapp', 'sms', 'push', 'webhook')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  retry_count integer not null default 0,
  scheduled_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_queue_company_status
  on public.notification_queue(company_id, status, scheduled_at);

create index if not exists idx_notification_queue_scheduled
  on public.notification_queue(scheduled_at)
  where status in ('pending', 'failed');

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  scope text not null check (scope in ('user', 'tenant')),
  channel text check (channel in ('in_app', 'email', 'whatsapp', 'sms', 'push', 'webhook')),
  min_priority text check (min_priority in ('low', 'normal', 'high', 'urgent')),
  muted boolean not null default false,
  working_hours jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_notification_preferences_unique
  on public.notification_preferences(company_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), scope, coalesce(channel, 'all'));

alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications
  add constraint notifications_category_check
  check (category in ('booking', 'invoice', 'subscription', 'whatsapp', 'system', 'customer', 'payment'));

alter table public.notification_queue enable row level security;
alter table public.notification_preferences enable row level security;

drop policy if exists notification_queue_select_company on public.notification_queue;
create policy notification_queue_select_company
  on public.notification_queue for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists notification_queue_insert_company on public.notification_queue;
create policy notification_queue_insert_company
  on public.notification_queue for insert
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists notification_preferences_select_company on public.notification_preferences;
create policy notification_preferences_select_company
  on public.notification_preferences for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists notification_preferences_upsert_company on public.notification_preferences;
create policy notification_preferences_upsert_company
  on public.notification_preferences for all
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  )
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );
