-- ============================================================
-- Vault OS – Initial Schema Migration
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ── CUSTOMERS ───────────────────────────────────────────────
create table if not exists public.customers (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  email       text,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.customers enable row level security;

drop policy if exists "customers_own" on public.customers;
create policy "customers_own"
  on public.customers for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── BOOKINGS ────────────────────────────────────────────────
create table if not exists public.bookings (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  customer_id  uuid        references public.customers(id) on delete set null,
  service      text        not null,
  booking_date timestamptz not null,
  status       text        not null default 'Pending'
                           check (status in ('Pending','Confirmed','Cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.bookings enable row level security;

drop policy if exists "bookings_own" on public.bookings;
create policy "bookings_own"
  on public.bookings for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── INVOICES ────────────────────────────────────────────────
create table if not exists public.invoices (
  id           uuid           primary key default gen_random_uuid(),
  user_id      uuid           not null references auth.users(id) on delete cascade,
  customer_id  uuid           references public.customers(id) on delete set null,
  amount       numeric(10,2)  not null default 0,
  status       text           not null default 'Unpaid'
                              check (status in ('Unpaid','Paid','Overdue')),
  invoice_date timestamptz    not null default now(),
  created_at   timestamptz    not null default now(),
  updated_at   timestamptz    not null default now()
);

alter table public.invoices enable row level security;

drop policy if exists "invoices_own" on public.invoices;
create policy "invoices_own"
  on public.invoices for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── updated_at triggers ─────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at
  before update on public.customers
  for each row execute procedure public.set_updated_at();

drop trigger if exists bookings_updated_at on public.bookings;
create trigger bookings_updated_at
  before update on public.bookings
  for each row execute procedure public.set_updated_at();

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at
  before update on public.invoices
  for each row execute procedure public.set_updated_at();
