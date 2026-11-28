-- =============================================================================
-- 475 — Delivery workers, zone assignment, order ETA/secondary phone, customer
-- delivery fields, and orders.assign_delivery permission.
-- Additive only. Apply local/dev from agent tooling — never production here.
-- =============================================================================

-- Permissions
insert into public.permissions (code, category, module, action, description)
values
  ('orders.assign_delivery', 'Orders', 'Orders', 'Assign', 'Assign delivery workers to confirmed sales orders')
on conflict (code) do update
set category = excluded.category, module = excluded.module, action = excluded.action,
    description = excluded.description, updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'orders.assign_delivery'),
    ('manager', 'orders.assign_delivery')
) as v(template_key, permission_code)
on conflict do nothing;

-- Backfill DEFAULT company roles that already have orders.edit
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and r.template_key in ('admin', 'manager')
  and p.code = 'orders.assign_delivery'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );

-- Delivery workers (external contacts: name + phone)
create table if not exists public.company_delivery_workers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  phone_e164 text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_delivery_workers_name_nonempty
    check (char_length(trim(full_name)) > 0),
  constraint company_delivery_workers_phone_nonempty
    check (char_length(trim(phone_e164)) > 0)
);

create unique index if not exists company_delivery_workers_company_phone_uidx
  on public.company_delivery_workers (company_id, phone_e164);

create index if not exists company_delivery_workers_company_active_idx
  on public.company_delivery_workers (company_id, is_active);

create table if not exists public.company_delivery_worker_zones (
  worker_id uuid not null references public.company_delivery_workers(id) on delete cascade,
  delivery_zone_id uuid not null references public.company_delivery_zones(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (worker_id, delivery_zone_id)
);

create index if not exists company_delivery_worker_zones_zone_idx
  on public.company_delivery_worker_zones (delivery_zone_id);

alter table public.company_delivery_workers enable row level security;
alter table public.company_delivery_worker_zones enable row level security;

drop policy if exists company_delivery_workers_company on public.company_delivery_workers;
create policy company_delivery_workers_company
  on public.company_delivery_workers
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists company_delivery_worker_zones_company on public.company_delivery_worker_zones;
create policy company_delivery_worker_zones_company
  on public.company_delivery_worker_zones
  for all
  using (
    exists (
      select 1 from public.company_delivery_workers w
      where w.id = worker_id
        and (w.company_id = public.current_company_id() or public.is_super_admin())
    )
  )
  with check (
    exists (
      select 1 from public.company_delivery_workers w
      where w.id = worker_id
        and (w.company_id = public.current_company_id() or public.is_super_admin())
    )
    and exists (
      select 1 from public.company_delivery_zones z
      where z.id = delivery_zone_id
        and (z.company_id = public.current_company_id() or public.is_super_admin())
    )
  );

revoke all on table public.company_delivery_workers from anon, public;
revoke all on table public.company_delivery_worker_zones from anon, public;
grant select, insert, update, delete on table public.company_delivery_workers to authenticated, service_role;
grant select, insert, update, delete on table public.company_delivery_worker_zones to authenticated, service_role;

-- Sales order enrichment
alter table public.sales_orders
  add column if not exists assigned_delivery_worker_id uuid null
    references public.company_delivery_workers(id) on delete set null,
  add column if not exists assigned_at timestamptz null,
  add column if not exists assigned_by uuid null
    references public.profiles(id) on delete set null,
  add column if not exists customer_secondary_phone text not null default '',
  add column if not exists eta_min_snapshot integer null,
  add column if not exists eta_max_snapshot integer null,
  add column if not exists eta_unit_snapshot text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_orders_eta_unit_snapshot_check'
  ) then
    alter table public.sales_orders
      add constraint sales_orders_eta_unit_snapshot_check
      check (eta_unit_snapshot is null or eta_unit_snapshot in ('hours', 'days'));
  end if;
end $$;

create index if not exists sales_orders_company_assigned_worker_idx
  on public.sales_orders (company_id, assigned_delivery_worker_id)
  where assigned_delivery_worker_id is not null;

-- Customer delivery fields (CRM persistence)
alter table public.customers
  add column if not exists secondary_phone text null,
  add column if not exists secondary_phone_e164 text null,
  add column if not exists delivery_address text null,
  add column if not exists delivery_governorate text null,
  add column if not exists delivery_city_area text null,
  add column if not exists delivery_lat double precision null,
  add column if not exists delivery_lng double precision null,
  add column if not exists delivery_location_url text null;
