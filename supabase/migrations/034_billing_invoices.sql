-- ============================================================
-- Vault OS – Billing: Platform Invoices (Phase 1)
-- Architecture: billing-subscriptions.md v4 §11
-- ============================================================

-- Future Invoice Center prep on CRM invoices (no behavior change)
alter table public.invoices
  add column if not exists invoice_type text not null default 'customer';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_invoice_type_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_invoice_type_check
      check (invoice_type in ('customer', 'platform_subscription'));
  end if;
exception
  when others then null;
end $$;

-- ── billing_invoices ────────────────────────────────────────

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_type text not null default 'platform_subscription'
    check (invoice_type in ('customer', 'platform_subscription')),
  invoice_number text not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.company_subscriptions(id) on delete set null,
  billing_payment_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'paid', 'void', 'overdue')),
  currency text not null default 'USD',
  subtotal_amount numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  period_start timestamptz,
  period_end timestamptz,
  line_items jsonb not null default '[]'::jsonb,
  billing_contact_snapshot jsonb not null default '{}'::jsonb,
  company_snapshot jsonb not null default '{}'::jsonb,
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_number)
);

create index if not exists idx_billing_invoices_company_id
  on public.billing_invoices(company_id, created_at desc);
create index if not exists idx_billing_invoices_subscription_id
  on public.billing_invoices(subscription_id);
create index if not exists idx_billing_invoices_status
  on public.billing_invoices(status);

drop trigger if exists billing_invoices_updated_at on public.billing_invoices;
create trigger billing_invoices_updated_at
  before update on public.billing_invoices
  for each row execute procedure public.set_updated_at();

alter table public.billing_invoices enable row level security;

drop policy if exists billing_invoices_select on public.billing_invoices;
create policy billing_invoices_select
  on public.billing_invoices for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists billing_invoices_insert on public.billing_invoices;
create policy billing_invoices_insert
  on public.billing_invoices for insert
  with check (false);

drop policy if exists billing_invoices_update on public.billing_invoices;
create policy billing_invoices_update
  on public.billing_invoices for update
  using (false)
  with check (false);

drop policy if exists billing_invoices_delete on public.billing_invoices;
create policy billing_invoices_delete
  on public.billing_invoices for delete
  using (false);
