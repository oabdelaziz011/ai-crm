-- ============================================================
-- Vault OS – Billing: Payments (Phase 1)
-- Architecture: billing-subscriptions.md v4 §8.2
-- ============================================================

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.company_subscriptions(id) on delete set null,
  billing_invoice_id uuid references public.billing_invoices(id) on delete set null,
  receipt_id uuid references public.billing_receipts(id) on delete set null,
  payment_method_type_id uuid,
  payment_method_label text,
  provider text,
  provider_payment_id text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'canceled', 'refunded')),
  amount numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  failure_code text,
  failure_message text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_payments_company_id
  on public.billing_payments(company_id, created_at desc);
create index if not exists idx_billing_payments_status
  on public.billing_payments(status);
create index if not exists idx_billing_payments_provider_payment_id
  on public.billing_payments(provider, provider_payment_id);

drop trigger if exists billing_payments_updated_at on public.billing_payments;
create trigger billing_payments_updated_at
  before update on public.billing_payments
  for each row execute procedure public.set_updated_at();

-- Circular FKs resolved after tables exist
alter table public.billing_invoices
  drop constraint if exists billing_invoices_billing_payment_id_fkey;

alter table public.billing_invoices
  add column if not exists billing_payment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_invoices_billing_payment_id_fkey'
  ) then
    alter table public.billing_invoices
      add constraint billing_invoices_billing_payment_id_fkey
      foreign key (billing_payment_id)
      references public.billing_payments(id)
      on delete set null;
  end if;
exception when others then null;
end $$;

alter table public.billing_receipts
  add column if not exists billing_payment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_receipts_billing_payment_id_fkey'
  ) then
    alter table public.billing_receipts
      add constraint billing_receipts_billing_payment_id_fkey
      foreign key (billing_payment_id)
      references public.billing_payments(id)
      on delete set null;
  end if;
exception when others then null;
end $$;

alter table public.billing_payments
  drop constraint if exists billing_payments_receipt_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_payments_receipt_id_fkey'
  ) then
    alter table public.billing_payments
      add constraint billing_payments_receipt_id_fkey
      foreign key (receipt_id)
      references public.billing_receipts(id)
      on delete set null;
  end if;
exception when others then null;
end $$;

alter table public.billing_payments enable row level security;

drop policy if exists billing_payments_select on public.billing_payments;
create policy billing_payments_select
  on public.billing_payments for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists billing_payments_insert on public.billing_payments;
create policy billing_payments_insert
  on public.billing_payments for insert
  with check (false);

drop policy if exists billing_payments_update on public.billing_payments;
create policy billing_payments_update
  on public.billing_payments for update
  using (false)
  with check (false);

drop policy if exists billing_payments_delete on public.billing_payments;
create policy billing_payments_delete
  on public.billing_payments for delete
  using (false);
