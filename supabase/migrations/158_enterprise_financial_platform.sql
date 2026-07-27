-- ============================================================
-- Vault OS – Sprint 7.0 Enterprise Financial Platform
-- Customer invoice engine, ledger, payments, pricing, taxes, refunds
-- ============================================================

-- ── Extend CRM invoices for enterprise lifecycle ─────────────

alter table public.invoices
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists booking_id uuid references public.scheduling_bookings(id) on delete set null,
  add column if not exists invoice_number text,
  add column if not exists currency text not null default 'USD',
  add column if not exists subtotal_cents bigint not null default 0,
  add column if not exists tax_cents bigint not null default 0,
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists total_cents bigint not null default 0,
  add column if not exists paid_cents bigint not null default 0,
  add column if not exists version integer not null default 1,
  add column if not exists tax_mode text not null default 'exclusive'
    check (tax_mode in ('inclusive', 'exclusive', 'exempt')),
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists notes text,
  add column if not exists issued_at timestamptz,
  add column if not exists due_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists cancelled_at timestamptz;

-- Migrate legacy status to new lifecycle
update public.invoices
set total_cents = coalesce(round(amount * 100)::bigint, 0),
    subtotal_cents = coalesce(round(amount * 100)::bigint, 0)
where total_cents = 0 and amount is not null;

-- Normalize status values
alter table public.invoices drop constraint if exists invoices_status_check;
update public.invoices set status = 'issued' where status = 'Unpaid';
update public.invoices set status = 'paid' where status = 'Paid';
update public.invoices set status = 'issued' where status = 'Overdue';

alter table public.invoices
  alter column status set default 'draft';

alter table public.invoices
  add constraint invoices_status_check check (
    status in ('draft', 'pending', 'issued', 'partially_paid', 'paid', 'cancelled', 'refunded')
  );

create unique index if not exists idx_invoices_company_number
  on public.invoices(company_id, invoice_number)
  where invoice_number is not null and company_id is not null;

create index if not exists idx_invoices_booking_id on public.invoices(booking_id);
create index if not exists idx_invoices_company_status on public.invoices(company_id, status);

-- ── Invoice line items ───────────────────────────────────────

create table if not exists public.customer_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  description text not null,
  quantity numeric(12, 4) not null default 1,
  unit_price_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  total_cents bigint not null default 0,
  service_id uuid references public.scheduling_services(id) on delete set null,
  resource_id uuid references public.scheduling_resources(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_invoice_line_items_invoice
  on public.customer_invoice_line_items(invoice_id);

-- ── Invoice versions (credit/debit notes) ────────────────────

create table if not exists public.customer_invoice_versions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  version_number integer not null,
  document_type text not null default 'invoice'
    check (document_type in ('invoice', 'credit_note', 'debit_note')),
  snapshot jsonb not null default '{}'::jsonb,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (invoice_id, version_number, document_type)
);

-- ── Customer payments (operational) ──────────────────────────

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  payment_method text not null default 'online'
    check (payment_method in ('cash', 'card', 'bank_transfer', 'wallet', 'online', 'mixed')),
  provider_code text references public.payment_providers(code),
  provider_payment_id text,
  amount_cents bigint not null,
  currency text not null default 'USD',
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded')),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_customer_payments_idempotency
  on public.customer_payments(company_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_customer_payments_invoice
  on public.customer_payments(invoice_id);

-- ── Payment intents — link to customer invoices ──────────────

alter table public.payment_intents
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

-- ── Financial ledger (immutable) ─────────────────────────────

create table if not exists public.financial_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_type text not null
    check (entry_type in ('invoice', 'payment', 'refund', 'discount', 'tax', 'adjustment')),
  direction text not null check (direction in ('debit', 'credit')),
  amount_cents bigint not null,
  currency text not null default 'USD',
  reference_type text not null,
  reference_id uuid not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_ledger_company_created
  on public.financial_ledger_entries(company_id, created_at desc);
create index if not exists idx_financial_ledger_reference
  on public.financial_ledger_entries(reference_type, reference_id);

-- ── Refunds ──────────────────────────────────────────────────

create table if not exists public.financial_refunds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_id uuid references public.customer_payments(id) on delete set null,
  amount_cents bigint not null,
  currency text not null default 'USD',
  refund_type text not null default 'full'
    check (refund_type in ('full', 'partial', 'manual', 'automatic')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'processing', 'completed', 'rejected')),
  reason text,
  approval_required boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  processed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Pricing rules ────────────────────────────────────────────

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rule_type text not null
    check (rule_type in ('service', 'resource', 'branch', 'insurance', 'vip', 'package', 'bundle')),
  service_id uuid references public.scheduling_services(id) on delete cascade,
  resource_id uuid references public.scheduling_resources(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  price_cents bigint not null,
  currency text not null default 'USD',
  label text,
  is_active boolean not null default true,
  priority integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pricing_rules_company on public.pricing_rules(company_id, is_active);

-- ── Service base price ───────────────────────────────────────

alter table public.scheduling_services
  add column if not exists price_cents bigint not null default 0,
  add column if not exists currency text not null default 'USD';

-- ── Discount codes ───────────────────────────────────────────

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed', 'coupon', 'campaign', 'referral', 'membership', 'employee')),
  value numeric(12, 4) not null,
  max_uses integer,
  used_count integer not null default 0,
  requires_approval boolean not null default false,
  expires_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_discount_codes_company_code
on public.discount_codes (company_id, lower(code));


create table if not exists public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discount_codes(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  amount_cents bigint not null,
  created_at timestamptz not null default now()
);

-- ── Tax configuration ────────────────────────────────────────

create table if not exists public.tax_configurations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tax_code text not null default 'VAT',
  rate_percent numeric(8, 4) not null default 0,
  country_code text not null default 'EG',
  is_inclusive boolean not null default false,
  is_exempt boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, tax_code, country_code)
);

-- ── Company financial settings ───────────────────────────────

create table if not exists public.company_financial_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  default_payment_provider text references public.payment_providers(code),
  invoice_prefix text not null default 'INV',
  next_invoice_sequence integer not null default 1,
  default_currency text not null default 'USD',
  auto_invoice_on_booking boolean not null default true,
  auto_invoice_on_completion boolean not null default false,
  refund_approval_required boolean not null default false,
  encrypted_provider_credentials jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Booking invoice link ─────────────────────────────────────

alter table public.scheduling_bookings
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

-- ── Financial audit log ──────────────────────────────────────

create table if not exists public.financial_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_audit_company
  on public.financial_audit_log(company_id, created_at desc);

-- ── RPC: next invoice number ─────────────────────────────────

create or replace function public.financial_next_invoice_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_seq integer;
  v_number text;
begin
  insert into public.company_financial_settings (company_id)
  values (p_company_id)
  on conflict (company_id) do nothing;

  update public.company_financial_settings
  set next_invoice_sequence = next_invoice_sequence + 1
  where company_id = p_company_id
  returning invoice_prefix, next_invoice_sequence - 1 into v_prefix, v_seq;

  v_number := v_prefix || '-' || lpad(v_seq::text, 6, '0');
  return v_number;
end;
$$;

-- ── RPC: append ledger entry (immutable) ─────────────────────

create or replace function public.financial_append_ledger(
  p_company_id uuid,
  p_entry_type text,
  p_direction text,
  p_amount_cents bigint,
  p_currency text,
  p_reference_type text,
  p_reference_id uuid,
  p_description text,
  p_metadata jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.financial_ledger_entries (
    company_id, entry_type, direction, amount_cents, currency,
    reference_type, reference_id, description, metadata, created_by
  ) values (
    p_company_id, p_entry_type, p_direction, p_amount_cents, p_currency,
    p_reference_type, p_reference_id, p_description, p_metadata, p_created_by
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ── RLS ──────────────────────────────────────────────────────

alter table public.customer_invoice_line_items enable row level security;
alter table public.customer_invoice_versions enable row level security;
alter table public.customer_payments enable row level security;
alter table public.financial_ledger_entries enable row level security;
alter table public.financial_refunds enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.discount_codes enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.tax_configurations enable row level security;
alter table public.company_financial_settings enable row level security;
alter table public.financial_audit_log enable row level security;

-- Tenant-scoped policies (company isolation)
do $$
declare
  t text;
begin
  foreach t in array array[
    'customer_invoice_line_items',
    'customer_invoice_versions',
    'customer_payments',
    'financial_ledger_entries',
    'financial_refunds',
    'pricing_rules',
    'discount_codes',
    'discount_redemptions',
    'tax_configurations',
    'company_financial_settings',
    'financial_audit_log'
  ] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select using (
        auth.role() = ''authenticated'' and (
          public.is_super_admin() or company_id = public.current_company_id()
        )
      )', t, t
    );
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (
        auth.role() = ''authenticated'' and (
          public.is_super_admin() or company_id = public.current_company_id()
        )
      ) with check (
        auth.role() = ''authenticated'' and (
          public.is_super_admin() or company_id = public.current_company_id()
        )
      )', t, t
    );
  end loop;
end $$;

-- Insert sandbox provider if missing
insert into public.payment_providers (code, display_name, is_active)
values ('sandbox', 'Sandbox', true)
on conflict (code) do nothing;

grant execute on function public.financial_next_invoice_number(uuid) to authenticated;
grant execute on function public.financial_append_ledger(uuid, text, text, bigint, text, text, uuid, text, jsonb, uuid) to authenticated;
