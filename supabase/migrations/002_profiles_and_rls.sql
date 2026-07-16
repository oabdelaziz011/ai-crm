-- ============================================================
-- Vault OS – Multi-tenant profile layer and hardened RLS
-- ============================================================

-- 1) Profiles table: one row per auth user, linked to auth.users
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'member'
    check (role in ('member', 'admin', 'owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create index if not exists idx_profiles_email on public.profiles (email);
create index if not exists idx_customers_user_id on public.customers(user_id);
create index if not exists idx_bookings_user_id on public.bookings(user_id);
create index if not exists idx_bookings_customer_id on public.bookings(customer_id);
create index if not exists idx_invoices_user_id on public.invoices(user_id);
create index if not exists idx_invoices_customer_id on public.invoices(customer_id);

-- 2) Automatic profile creation for every new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      nullif(split_part(new.email, '@', 1), '')
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill any existing users who do not yet have a profile row
insert into public.profiles (user_id, email)
select id, email
from auth.users
where email is not null
on conflict (user_id) do nothing;

-- 3) Updated-at trigger for profiles
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- 4) Hardened RLS policies for profiles and existing tenant-owned tables
-- Profiles policies: users can only access their own profile

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select
  on public.profiles
  for select
  using (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert
  on public.profiles
  for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update
  on public.profiles
  for update
  using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists profiles_owner_delete on public.profiles;
create policy profiles_owner_delete
  on public.profiles
  for delete
  using (auth.role() = 'authenticated' and user_id = auth.uid());

-- Customers policies: maintain same app behavior while tightening access

drop policy if exists customers_own on public.customers;
drop policy if exists customers_owner_select on public.customers;
create policy customers_owner_select
  on public.customers
  for select
  using (auth.role() = 'authenticated' and user_id = auth.uid());

create policy customers_owner_insert
  on public.customers
  for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy customers_owner_update
  on public.customers
  for update
  using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy customers_owner_delete
  on public.customers
  for delete
  using (auth.role() = 'authenticated' and user_id = auth.uid());

-- Bookings policies

drop policy if exists bookings_own on public.bookings;
drop policy if exists bookings_owner_select on public.bookings;
create policy bookings_owner_select
  on public.bookings
  for select
  using (auth.role() = 'authenticated' and user_id = auth.uid());

create policy bookings_owner_insert
  on public.bookings
  for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy bookings_owner_update
  on public.bookings
  for update
  using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy bookings_owner_delete
  on public.bookings
  for delete
  using (auth.role() = 'authenticated' and user_id = auth.uid());

-- Invoices policies

drop policy if exists invoices_own on public.invoices;
drop policy if exists invoices_owner_select on public.invoices;
create policy invoices_owner_select
  on public.invoices
  for select
  using (auth.role() = 'authenticated' and user_id = auth.uid());

create policy invoices_owner_insert
  on public.invoices
  for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy invoices_owner_update
  on public.invoices
  for update
  using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

create policy invoices_owner_delete
  on public.invoices
  for delete
  using (auth.role() = 'authenticated' and user_id = auth.uid());
