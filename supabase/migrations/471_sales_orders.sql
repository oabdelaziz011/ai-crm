-- Sales Orders foundation (CRM listing/details). Isolated from sales_follow_up_* and settings-only 470 tables.
-- No seed/demo orders. Human-approval-friendly statuses. Apply local/dev only from agent tooling.

insert into public.permissions (code, category, module, action, description)
values
  ('orders.view', 'Orders', 'Orders', 'View', 'View sales orders'),
  ('orders.create', 'Orders', 'Orders', 'Create', 'Create sales orders'),
  ('orders.edit', 'Orders', 'Orders', 'Edit', 'Update sales orders and status'),
  ('orders.delete', 'Orders', 'Orders', 'Delete', 'Delete draft sales orders')
on conflict (code) do update
set category = excluded.category, module = excluded.module, action = excluded.action,
    description = excluded.description, updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'orders.view'), ('admin', 'orders.create'), ('admin', 'orders.edit'), ('admin', 'orders.delete'),
    ('manager', 'orders.view'), ('manager', 'orders.create'), ('manager', 'orders.edit'),
    ('employee', 'orders.view')
) as v(template_key, permission_code)
on conflict do nothing;

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_number text not null,
  status text not null default 'draft',
  payment_method text not null default 'cash_on_delivery',
  customer_id uuid null references public.customers(id) on delete set null,
  customer_name text not null default '',
  customer_phone text not null default '',
  conversation_id uuid null references public.conversations(id) on delete set null,
  delivery_zone_id uuid null references public.company_delivery_zones(id) on delete set null,
  delivery_governorate text not null default '',
  delivery_city_area text not null default '',
  delivery_address text not null default '',
  delivery_notes text not null default '',
  delivery_fee numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  currency text not null default 'EGP',
  require_human_approval boolean not null default true,
  approved_at timestamptz null,
  approved_by uuid null references public.profiles(id) on delete set null,
  cancelled_at timestamptz null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_orders_status_check check (
    status in (
      'draft',
      'pending_approval',
      'confirmed',
      'processing',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )
  ),
  constraint sales_orders_payment_method_check check (payment_method in ('cash_on_delivery')),
  constraint sales_orders_delivery_fee_nonnegative check (delivery_fee >= 0),
  constraint sales_orders_subtotal_nonnegative check (subtotal >= 0),
  constraint sales_orders_total_nonnegative check (total_amount >= 0),
  constraint sales_orders_number_nonempty check (char_length(trim(order_number)) > 0)
);

create unique index if not exists sales_orders_company_number_uidx
  on public.sales_orders (company_id, lower(trim(order_number)));

create index if not exists sales_orders_company_created_idx
  on public.sales_orders (company_id, created_at desc);

create index if not exists sales_orders_company_status_idx
  on public.sales_orders (company_id, status, created_at desc);

create index if not exists sales_orders_company_phone_idx
  on public.sales_orders (company_id, customer_phone);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid null references public.catalog_products(id) on delete set null,
  product_name text not null,
  product_sku text not null default '',
  quantity numeric(12, 3) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_order_items_name_nonempty check (char_length(trim(product_name)) > 0),
  constraint sales_order_items_quantity_positive check (quantity > 0),
  constraint sales_order_items_unit_price_nonnegative check (unit_price >= 0),
  constraint sales_order_items_line_total_nonnegative check (line_total >= 0)
);

create index if not exists sales_order_items_order_idx
  on public.sales_order_items (order_id, sort_order);

create index if not exists sales_order_items_company_idx
  on public.sales_order_items (company_id, order_id);

create table if not exists public.sales_order_status_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  from_status text null,
  to_status text not null,
  note text not null default '',
  changed_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sales_order_status_events_to_status_check check (
    to_status in (
      'draft',
      'pending_approval',
      'confirmed',
      'processing',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )
  )
);

create index if not exists sales_order_status_events_order_idx
  on public.sales_order_status_events (order_id, created_at desc);

alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.sales_order_status_events enable row level security;

drop policy if exists sales_orders_company on public.sales_orders;
create policy sales_orders_company
  on public.sales_orders
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists sales_order_items_company on public.sales_order_items;
create policy sales_order_items_company
  on public.sales_order_items
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists sales_order_status_events_company on public.sales_order_status_events;
create policy sales_order_status_events_company
  on public.sales_order_status_events
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

revoke all on table public.sales_orders from anon, public;
revoke all on table public.sales_order_items from anon, public;
revoke all on table public.sales_order_status_events from anon, public;

grant select, insert, update, delete on table public.sales_orders to authenticated;
grant select, insert, update, delete on table public.sales_order_items to authenticated;
grant select, insert, update on table public.sales_order_status_events to authenticated;

grant select, insert, update, delete on table public.sales_orders to service_role;
grant select, insert, update, delete on table public.sales_order_items to service_role;
grant select, insert, update on table public.sales_order_status_events to service_role;
