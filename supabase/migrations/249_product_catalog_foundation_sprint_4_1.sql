-- Sprint 4.1: Product & Service Catalog — reusable sellable catalog for Opportunities / Quotes / future Orders.

insert into public.permissions (code, category, module, action, description)
values
  ('products.view', 'Products', 'Products', 'View', 'View product and service catalog'),
  ('products.create', 'Products', 'Products', 'Create', 'Create catalog products'),
  ('products.edit', 'Products', 'Products', 'Edit', 'Update catalog products'),
  ('products.delete', 'Products', 'Products', 'Delete', 'Archive catalog products'),
  ('products.pricing', 'Products', 'Products', 'Pricing', 'Manage global and regional pricing')
on conflict (code) do update
set category = excluded.category, module = excluded.module, action = excluded.action,
    description = excluded.description, updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'products.view'), ('admin', 'products.create'), ('admin', 'products.edit'),
    ('admin', 'products.delete'), ('admin', 'products.pricing'),
    ('manager', 'products.view'), ('manager', 'products.create'), ('manager', 'products.edit'),
    ('manager', 'products.pricing'),
    ('employee', 'products.view')
) as v(template_key, permission_code)
on conflict do nothing;

-- Hierarchical categories
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid references public.product_categories(id) on delete set null,
  name text not null check (char_length(trim(name)) > 0),
  slug text not null,
  description text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, slug)
);

create index if not exists idx_product_categories_company
  on public.product_categories(company_id, sort_order) where deleted_at is null;

create index if not exists idx_product_categories_parent
  on public.product_categories(parent_id) where deleted_at is null;

-- Canonical catalog products (reusable across opportunities, quotes, invoices later)
create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  product_type text not null default 'product'
    check (product_type in ('product', 'service', 'subscription', 'bundle', 'addon')),
  name text not null check (char_length(trim(name)) > 0),
  sku text not null,
  brand text not null default '',
  description text not null default '',
  base_price numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  tax_class text not null default 'standard',
  cost numeric(14, 2),
  margin_percent numeric(8, 4),
  is_active boolean not null default true,
  -- Subscription pricing (when product_type = subscription)
  subscription_interval text
    check (subscription_interval is null or subscription_interval in ('month', 'year', 'quarter')),
  subscription_price numeric(14, 2),
  -- Inventory placeholders
  track_inventory boolean not null default false,
  stock_quantity numeric(14, 2),
  unit text not null default 'each',
  tags text[] not null default '{}',
  image_urls text[] not null default '{}',
  document_urls text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, sku)
);

create index if not exists idx_catalog_products_company_active
  on public.catalog_products(company_id, is_active) where deleted_at is null;

create index if not exists idx_catalog_products_category
  on public.catalog_products(category_id) where deleted_at is null;

create index if not exists idx_catalog_products_type
  on public.catalog_products(company_id, product_type) where deleted_at is null;

-- Regional / market pricing overrides
create table if not exists public.product_regional_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  country text,
  market text,
  region text,
  local_price numeric(14, 2) not null,
  currency_override text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_product_regional_prices_product
  on public.product_regional_prices(product_id) where deleted_at is null;

-- Bundle composition
create table if not exists public.product_bundle_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bundle_product_id uuid not null references public.catalog_products(id) on delete cascade,
  component_product_id uuid not null references public.catalog_products(id) on delete restrict,
  quantity numeric(14, 4) not null default 1 check (quantity > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (bundle_product_id, component_product_id),
  check (bundle_product_id <> component_product_id)
);

create index if not exists idx_product_bundle_items_bundle
  on public.product_bundle_items(bundle_product_id);

-- Opportunity line items — references catalog, does not duplicate product master data
create table if not exists public.opportunity_line_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  product_name_snapshot text not null,
  sku_snapshot text not null default '',
  quantity numeric(14, 4) not null default 1 check (quantity > 0),
  unit_price numeric(14, 2) not null default 0,
  discount_percent numeric(8, 4) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  tax_percent numeric(8, 4) not null default 0
    check (tax_percent >= 0 and tax_percent <= 100),
  currency text not null default 'USD',
  subtotal numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  sort_order int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_opportunity_line_items_opp
  on public.opportunity_line_items(opportunity_id, sort_order) where deleted_at is null;

-- Product history / audit trail
create table if not exists public.product_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  event_type text not null,
  field_name text,
  previous_value text,
  new_value text,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_history_product
  on public.product_history(product_id, created_at desc);

alter table public.product_categories enable row level security;
alter table public.catalog_products enable row level security;
alter table public.product_regional_prices enable row level security;
alter table public.product_bundle_items enable row level security;
alter table public.opportunity_line_items enable row level security;
alter table public.product_history enable row level security;

create policy product_categories_tenant on public.product_categories
  for all using (public.company_has_permission(company_id, 'products.view'));

create policy catalog_products_tenant on public.catalog_products
  for all using (public.company_has_permission(company_id, 'products.view'));

create policy product_regional_prices_tenant on public.product_regional_prices
  for all using (public.company_has_permission(company_id, 'products.view'));

create policy product_bundle_items_tenant on public.product_bundle_items
  for all using (public.company_has_permission(company_id, 'products.view'));

create policy opportunity_line_items_tenant on public.opportunity_line_items
  for all using (
    public.company_has_permission(company_id, 'opportunities.view')
    or public.company_has_permission(company_id, 'products.view')
  );

create policy product_history_tenant on public.product_history
  for all using (public.company_has_permission(company_id, 'products.view'));
