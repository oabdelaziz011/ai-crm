-- ============================================================
-- Vault OS – Billing: Subscription Events (Phase 1)
-- Architecture: billing-subscriptions.md v4 §2.5
-- ============================================================

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid not null references public.company_subscriptions(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_events_company_occurred
  on public.subscription_events(company_id, occurred_at desc);
create index if not exists idx_subscription_events_subscription_occurred
  on public.subscription_events(subscription_id, occurred_at desc);
create index if not exists idx_subscription_events_type
  on public.subscription_events(event_type);

alter table public.subscription_events enable row level security;

drop policy if exists subscription_events_select on public.subscription_events;
create policy subscription_events_select
  on public.subscription_events for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists subscription_events_insert on public.subscription_events;
create policy subscription_events_insert
  on public.subscription_events for insert
  with check (false);

drop policy if exists subscription_events_update on public.subscription_events;
create policy subscription_events_update
  on public.subscription_events for update
  using (false)
  with check (false);

drop policy if exists subscription_events_delete on public.subscription_events;
create policy subscription_events_delete
  on public.subscription_events for delete
  using (false);

-- Seed creation events for backfilled subscriptions
insert into public.subscription_events (
  company_id,
  subscription_id,
  event_type,
  title,
  description,
  metadata,
  occurred_at
)
select
  cs.company_id,
  cs.id,
  'subscription_created',
  'Subscription Created',
  'Migrated from existing company subscription state',
  jsonb_build_object('source', 'migration_backfill', 'plan_id', cs.plan_id),
  cs.created_at
from public.company_subscriptions cs
where not exists (
  select 1
  from public.subscription_events se
  where se.subscription_id = cs.id
    and se.event_type = 'subscription_created'
);
