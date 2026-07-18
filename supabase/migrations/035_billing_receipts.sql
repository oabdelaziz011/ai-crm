-- ============================================================
-- Vault OS – Billing: Payment Receipts (Phase 1)
-- Architecture: billing-subscriptions.md v4 §1.7
-- ============================================================

create table if not exists public.billing_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.company_subscriptions(id) on delete set null,
  billing_invoice_id uuid references public.billing_invoices(id) on delete set null,
  billing_payment_id uuid,
  amount numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  payment_method_label text,
  company_snapshot jsonb not null default '{}'::jsonb,
  billing_contact_snapshot jsonb not null default '{}'::jsonb,
  document_url text,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_receipts_company_id
  on public.billing_receipts(company_id, issued_at desc);
create index if not exists idx_billing_receipts_invoice_id
  on public.billing_receipts(billing_invoice_id);

alter table public.billing_receipts enable row level security;

drop policy if exists billing_receipts_select on public.billing_receipts;
create policy billing_receipts_select
  on public.billing_receipts for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists billing_receipts_insert on public.billing_receipts;
create policy billing_receipts_insert
  on public.billing_receipts for insert
  with check (false);

drop policy if exists billing_receipts_update on public.billing_receipts;
create policy billing_receipts_update
  on public.billing_receipts for update
  using (false)
  with check (false);

drop policy if exists billing_receipts_delete on public.billing_receipts;
create policy billing_receipts_delete
  on public.billing_receipts for delete
  using (false);
