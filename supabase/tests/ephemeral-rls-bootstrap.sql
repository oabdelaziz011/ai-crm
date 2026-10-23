-- Throwaway schema for PostgREST tests. Not applied to the development database.

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    session_user
  );
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.company_id', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'company_id'
  ), '')::uuid;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select false;
$$;

create or replace function public.company_has_permission(p_company_id uuid, p_permission text)
returns boolean
language sql
stable
as $$
  select auth.role() = 'authenticated'
    and p_company_id is not null
    and p_company_id = public.current_company_id()
    and coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_permissions' ? p_permission,
      false
    );
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'authenticator' noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  category_id uuid,
  product_type text not null default 'product',
  name text not null,
  sku text not null,
  brand text not null default '',
  description text not null default '',
  base_price numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  tax_class text not null default 'standard',
  price_tax_mode text not null default 'inclusive',
  tax_percent numeric(6, 3) not null default 0,
  cost numeric(14, 2),
  margin_percent numeric(8, 4),
  is_active boolean not null default true,
  subscription_interval text,
  subscription_price numeric(14, 2),
  track_inventory boolean not null default false,
  stock_quantity numeric(14, 2),
  unit text not null default 'each',
  tags text[] not null default '{}',
  aliases text[] not null default '{}',
  image_urls text[] not null default '{}',
  document_urls text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.catalog_products
  add column if not exists aliases text[] not null default '{}'::text[];

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null
);

create table if not exists public.product_regional_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  local_price numeric(14, 2) not null,
  currency_override text
);

create table if not exists public.product_bundle_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  bundle_product_id uuid not null,
  component_product_id uuid not null,
  quantity numeric not null default 1
);

create table if not exists public.product_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_id uuid not null,
  summary text not null default ''
);

create table if not exists public.tool_executions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  conversation_id uuid not null,
  tool_definition_id uuid not null,
  tool_key text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'pending',
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  triggered_by text not null default 'router',
  created_by uuid
);

alter table public.catalog_products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_regional_prices enable row level security;
alter table public.product_bundle_items enable row level security;
alter table public.product_history enable row level security;
alter table public.tool_executions enable row level security;

grant select, insert, update, delete on
  public.catalog_products,
  public.product_categories,
  public.product_regional_prices,
  public.product_bundle_items,
  public.product_history,
  public.tool_executions
to authenticated, service_role;

grant all on public.tool_executions to service_role;

-- Migration 015 policies, so 417 replaces the real company-wide update policy.
drop policy if exists tool_executions_select on public.tool_executions;
create policy tool_executions_select
  on public.tool_executions for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists tool_executions_insert on public.tool_executions;
create policy tool_executions_insert
  on public.tool_executions for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists tool_executions_update on public.tool_executions;
create policy tool_executions_update
  on public.tool_executions for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );
