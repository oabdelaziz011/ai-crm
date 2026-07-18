-- ============================================================
-- Vault OS – Profiles + Auth
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  company_id uuid,
  email text,
  full_name text,
  avatar_url text,
  role text,
  is_super_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Legacy-safe column alignment (existing profiles tables may predate this schema)
alter table public.profiles
  add column if not exists id uuid,
  add column if not exists user_id uuid,
  add column if not exists company_id uuid,
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists role text,
  add column if not exists is_super_admin boolean default false,
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.profiles
set id = user_id
where id is null and user_id is not null;

update public.profiles
set user_id = id
where user_id is null and id is not null;

update public.profiles
set is_super_admin = false
where is_super_admin is null;

update public.profiles
set is_active = true
where is_active is null;

update public.profiles
set created_at = now()
where created_at is null;

update public.profiles
set updated_at = now()
where updated_at is null;

update public.profiles p
set email = u.email
from auth.users u
where (p.id = u.id or p.user_id = u.id)
  and (p.email is null or p.email = '');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id)
      references auth.users(id)
      on delete cascade;
  end if;
exception
  when others then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_user_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
exception
  when others then null;
end $$;

create unique index if not exists idx_profiles_user_id on public.profiles(user_id);
create unique index if not exists idx_profiles_id on public.profiles(id);
create index if not exists idx_profiles_company_id on public.profiles(company_id);
create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_is_active on public.profiles(is_active);
create index if not exists idx_profiles_is_super_admin on public.profiles(is_super_admin);

create index if not exists idx_customers_user_id on public.customers(user_id);
create index if not exists idx_bookings_user_id on public.bookings(user_id);
create index if not exists idx_bookings_customer_id on public.bookings(customer_id);
create index if not exists idx_invoices_user_id on public.invoices(user_id);
create index if not exists idx_invoices_customer_id on public.invoices(customer_id);

-- ── Helper functions ────────────────────────────────────────

create or replace function public.sync_profile_ids()
returns trigger
language plpgsql
as $$
begin
  new.id := coalesce(new.id, new.user_id);
  new.user_id := coalesce(new.user_id, new.id);
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, user_id, email, full_name, role)
  values (
    new.id,
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      nullif(split_part(new.email, '@', 1), '')
    ),
    coalesce(new.raw_user_meta_data->>'role', null)
  )
  on conflict (id) do update
  set
    user_id = excluded.user_id,
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    updated_at = now();

  update public.profiles
  set
    id = new.id,
    email = coalesce(email, new.email),
    full_name = coalesce(full_name, coalesce(
      new.raw_user_meta_data->>'full_name',
      nullif(split_part(new.email, '@', 1), '')
    )),
    updated_at = now()
  where user_id = new.id
    and id is distinct from new.id;

  return new;
end;
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  where p.id = auth.uid() or p.user_id = auth.uid()
  order by case when p.id = auth.uid() then 0 else 1 end
  limit 1;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where (p.id = auth.uid() or p.user_id = auth.uid())
      and p.is_super_admin = true
  );
$$;

-- ── Triggers ────────────────────────────────────────────────

drop trigger if exists trg_sync_profile_ids on public.profiles;
create trigger trg_sync_profile_ids
  before insert or update on public.profiles
  for each row execute procedure public.sync_profile_ids();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Backfill profiles for existing auth users (never overwrite existing rows)
insert into public.profiles (id, user_id, email)
select u.id, u.id, u.email
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id or p.user_id = u.id
)
on conflict (id) do nothing;

-- ── Profiles RLS ────────────────────────────────────────────

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select
  on public.profiles for select
  using (
    auth.role() = 'authenticated'
    and (id = auth.uid() or user_id = auth.uid())
  );

drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert
  on public.profiles for insert
  with check (
    auth.role() = 'authenticated'
    and (id = auth.uid() or user_id = auth.uid())
  );

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update
  on public.profiles for update
  using (
    auth.role() = 'authenticated'
    and (id = auth.uid() or user_id = auth.uid())
  )
  with check (
    auth.role() = 'authenticated'
    and (id = auth.uid() or user_id = auth.uid())
  );

drop policy if exists profiles_owner_delete on public.profiles;
create policy profiles_owner_delete
  on public.profiles for delete
  using (
    auth.role() = 'authenticated'
    and (id = auth.uid() or user_id = auth.uid())
  );

-- ── Core table RLS (split from 001 monolithic policies) ─────

drop policy if exists customers_own on public.customers;
drop policy if exists customers_owner_select on public.customers;
create policy customers_owner_select
  on public.customers for select
  using (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists customers_owner_insert on public.customers;
create policy customers_owner_insert
  on public.customers for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists customers_owner_update on public.customers;
create policy customers_owner_update
  on public.customers for update
  using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists customers_owner_delete on public.customers;
create policy customers_owner_delete
  on public.customers for delete
  using (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists bookings_own on public.bookings;
drop policy if exists bookings_owner_select on public.bookings;
create policy bookings_owner_select
  on public.bookings for select
  using (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists bookings_owner_insert on public.bookings;
create policy bookings_owner_insert
  on public.bookings for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists bookings_owner_update on public.bookings;
create policy bookings_owner_update
  on public.bookings for update
  using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists bookings_owner_delete on public.bookings;
create policy bookings_owner_delete
  on public.bookings for delete
  using (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists invoices_own on public.invoices;
drop policy if exists invoices_owner_select on public.invoices;
create policy invoices_owner_select
  on public.invoices for select
  using (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists invoices_owner_insert on public.invoices;
create policy invoices_owner_insert
  on public.invoices for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists invoices_owner_update on public.invoices;
create policy invoices_owner_update
  on public.invoices for update
  using (auth.role() = 'authenticated' and user_id = auth.uid())
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

drop policy if exists invoices_owner_delete on public.invoices;
create policy invoices_owner_delete
  on public.invoices for delete
  using (auth.role() = 'authenticated' and user_id = auth.uid());
