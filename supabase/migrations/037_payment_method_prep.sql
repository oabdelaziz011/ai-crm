-- ============================================================
-- Vault OS – Billing: Payment Method Prep & Inbound Webhooks (Phase 1)
-- Architecture: billing-subscriptions.md v4 §1.8, §5 (inbound only)
-- ============================================================

-- ── payment_method_types ────────────────────────────────────

create table if not exists public.payment_method_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  category text not null default 'card'
    check (category in ('card', 'wallet', 'bank', 'provider', 'manual')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.payment_method_types (code, display_name, category, sort_order)
values
  ('visa', 'Visa', 'card', 1),
  ('mastercard', 'MasterCard', 'card', 2),
  ('meeza', 'Meeza', 'card', 3),
  ('apple_pay', 'Apple Pay', 'wallet', 4),
  ('google_pay', 'Google Pay', 'wallet', 5),
  ('paypal', 'PayPal', 'wallet', 6),
  ('stripe', 'Stripe', 'provider', 7),
  ('paymob', 'Paymob', 'provider', 8),
  ('fawry', 'Fawry', 'provider', 9),
  ('manual', 'Manual', 'manual', 10)
on conflict (code) do update
set
  display_name = excluded.display_name,
  category = excluded.category,
  sort_order = excluded.sort_order;

-- ── company_payment_methods ─────────────────────────────────

create table if not exists public.company_payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payment_method_type_id uuid not null references public.payment_method_types(id) on delete restrict,
  label text not null,
  provider_token text,
  is_default boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_payment_methods_company_id
  on public.company_payment_methods(company_id);

drop trigger if exists company_payment_methods_updated_at on public.company_payment_methods;
create trigger company_payment_methods_updated_at
  before update on public.company_payment_methods
  for each row execute procedure public.set_updated_at();

alter table public.company_subscriptions
  drop constraint if exists company_subscriptions_default_payment_method_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_subscriptions_default_payment_method_id_fkey'
  ) then
    alter table public.company_subscriptions
      add constraint company_subscriptions_default_payment_method_id_fkey
      foreign key (default_payment_method_id)
      references public.company_payment_methods(id)
      on delete set null;
  end if;
exception when others then null;
end $$;

alter table public.billing_payments
  drop constraint if exists billing_payments_payment_method_type_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_payments_payment_method_type_id_fkey'
  ) then
    alter table public.billing_payments
      add constraint billing_payments_payment_method_type_id_fkey
      foreign key (payment_method_type_id)
      references public.payment_method_types(id)
      on delete set null;
  end if;
exception when others then null;
end $$;

-- ── payment_providers ───────────────────────────────────────

create table if not exists public.payment_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  is_active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payment_providers (code, display_name, is_active)
values
  ('manual', 'Manual Payment', true),
  ('stripe', 'Stripe', false),
  ('paymob', 'Paymob', false),
  ('fawry', 'Fawry', false)
on conflict (code) do nothing;

-- ── payment_intents ─────────────────────────────────────────

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.company_subscriptions(id) on delete set null,
  provider_code text not null references public.payment_providers(code),
  provider_intent_id text,
  amount numeric(12, 2) not null,
  currency text not null default 'USD',
  status text not null default 'requires_payment_method'
    check (status in ('requires_payment_method', 'processing', 'succeeded', 'failed', 'canceled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_intents_company_id
  on public.payment_intents(company_id, created_at desc);

drop trigger if exists payment_intents_updated_at on public.payment_intents;
create trigger payment_intents_updated_at
  before update on public.payment_intents
  for each row execute procedure public.set_updated_at();

-- ── webhook_events (inbound payment provider) ───────────────

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed')),
  error_message text,
  processed_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_webhook_events_idempotency
  on public.webhook_events(provider_code, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_webhook_events_status_created
  on public.webhook_events(status, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────

alter table public.payment_method_types enable row level security;
alter table public.company_payment_methods enable row level security;
alter table public.payment_providers enable row level security;
alter table public.payment_intents enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists payment_method_types_select on public.payment_method_types;
create policy payment_method_types_select
  on public.payment_method_types for select
  using (auth.role() = 'authenticated');

drop policy if exists payment_method_types_write on public.payment_method_types;
create policy payment_method_types_write
  on public.payment_method_types for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists company_payment_methods_select on public.company_payment_methods;
create policy company_payment_methods_select
  on public.company_payment_methods for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists company_payment_methods_write on public.company_payment_methods;
create policy company_payment_methods_write
  on public.company_payment_methods for all
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  );

drop policy if exists payment_providers_select on public.payment_providers;
create policy payment_providers_select
  on public.payment_providers for select
  using (auth.role() = 'authenticated');

drop policy if exists payment_providers_write on public.payment_providers;
create policy payment_providers_write
  on public.payment_providers for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists payment_intents_select on public.payment_intents;
create policy payment_intents_select
  on public.payment_intents for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists payment_intents_write on public.payment_intents;
create policy payment_intents_write
  on public.payment_intents for all
  using (false)
  with check (false);

drop policy if exists webhook_events_select on public.webhook_events;
create policy webhook_events_select
  on public.webhook_events for select
  using (public.is_super_admin());

drop policy if exists webhook_events_write on public.webhook_events;
create policy webhook_events_write
  on public.webhook_events for all
  using (false)
  with check (false);
