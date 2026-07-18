-- ============================================================
-- Vault OS – Billing: Company Subscriptions (Phase 1)
-- Architecture: billing-subscriptions.md v4 §8.2
-- ============================================================

-- Allow grace_period on denormalized companies.subscription_status
alter table public.companies
  drop constraint if exists companies_subscription_status_check;

alter table public.companies
  add constraint companies_subscription_status_check
  check (subscription_status in ('active', 'trialing', 'past_due', 'grace_period', 'canceled', 'expired'));

-- ── company_subscriptions (authoritative) ───────────────────

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'grace_period', 'expired', 'canceled')),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'yearly')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_renewal_at timestamptz,
  trial_ends_at timestamptz,
  grace_period_ends_at timestamptz,
  auto_renewal boolean not null default true,
  payment_method_label text,
  default_payment_method_id uuid,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_subscriptions_plan_id
  on public.company_subscriptions(plan_id);
create index if not exists idx_company_subscriptions_status
  on public.company_subscriptions(status);
create index if not exists idx_company_subscriptions_next_renewal
  on public.company_subscriptions(next_renewal_at);

drop trigger if exists company_subscriptions_updated_at on public.company_subscriptions;
create trigger company_subscriptions_updated_at
  before update on public.company_subscriptions
  for each row execute procedure public.set_updated_at();

-- Backfill from existing companies rows
insert into public.company_subscriptions (
  company_id,
  plan_id,
  status,
  billing_cycle,
  current_period_end,
  next_renewal_at,
  trial_ends_at,
  auto_renewal
)
select
  c.id,
  c.plan_id,
  coalesce(c.subscription_status, 'trialing'),
  coalesce(c.billing_cycle, 'monthly'),
  c.subscription_expires_at,
  c.subscription_expires_at,
  case
    when coalesce(c.subscription_status, 'trialing') = 'trialing' then c.subscription_expires_at
    else null
  end,
  true
from public.companies c
on conflict (company_id) do nothing;

-- ── RLS ─────────────────────────────────────────────────────

alter table public.company_subscriptions enable row level security;

drop policy if exists company_subscriptions_select on public.company_subscriptions;
create policy company_subscriptions_select
  on public.company_subscriptions for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

-- Direct writes restricted; mutations go through SECURITY DEFINER RPCs (039)
drop policy if exists company_subscriptions_insert on public.company_subscriptions;
create policy company_subscriptions_insert
  on public.company_subscriptions for insert
  with check (false);

drop policy if exists company_subscriptions_update on public.company_subscriptions;
create policy company_subscriptions_update
  on public.company_subscriptions for update
  using (false)
  with check (false);

drop policy if exists company_subscriptions_delete on public.company_subscriptions;
create policy company_subscriptions_delete
  on public.company_subscriptions for delete
  using (false);
