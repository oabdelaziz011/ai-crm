-- Company-level AI order collection + delivery zone settings.
-- Isolated from sales_follow_up_* tables. Settings only — no orders/AI tools in this migration.
-- Existing companies stay safe: no auto-inserted rows; app defaults keep AI collection off and human approval on.
-- Apply only against local/dev databases — never production from agent tooling.

create table if not exists public.company_order_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  ai_order_collection_enabled boolean not null default false,
  payment_methods text[] not null default '{cash_on_delivery}'::text[],
  required_fields jsonb not null default '{
    "customerName": true,
    "mobileNumber": true,
    "governorate": true,
    "cityArea": true,
    "detailedAddress": true,
    "deliveryNotes": false
  }'::jsonb,
  require_human_approval boolean not null default true,
  default_reviewer_profile_id uuid null references public.profiles(id) on delete set null,
  notify_on_pending_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_order_settings_payment_methods_nonempty
    check (cardinality(payment_methods) >= 1),
  constraint company_order_settings_payment_methods_allowed
    check (payment_methods <@ array['cash_on_delivery']::text[]),
  constraint company_order_settings_required_fields_object
    check (jsonb_typeof(required_fields) = 'object')
);

create table if not exists public.company_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  governorate text not null,
  zone_name text not null,
  enabled boolean not null default true,
  delivery_fee numeric(12, 2) not null default 0,
  eta_min integer not null,
  eta_max integer not null,
  eta_unit text not null default 'days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_delivery_zones_governorate_nonempty
    check (char_length(trim(governorate)) > 0),
  constraint company_delivery_zones_zone_name_nonempty
    check (char_length(trim(zone_name)) > 0),
  constraint company_delivery_zones_fee_nonnegative
    check (delivery_fee >= 0),
  constraint company_delivery_zones_eta_min_positive
    check (eta_min >= 1),
  constraint company_delivery_zones_eta_range
    check (eta_max >= eta_min),
  constraint company_delivery_zones_eta_unit_check
    check (eta_unit in ('hours', 'days'))
);

create unique index if not exists company_delivery_zones_company_gov_zone_uidx
  on public.company_delivery_zones (company_id, lower(trim(governorate)), lower(trim(zone_name)));

create index if not exists company_delivery_zones_company_idx
  on public.company_delivery_zones (company_id, enabled);

alter table public.company_order_settings enable row level security;
alter table public.company_delivery_zones enable row level security;

drop policy if exists company_order_settings_company on public.company_order_settings;
create policy company_order_settings_company
  on public.company_order_settings
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists company_delivery_zones_company on public.company_delivery_zones;
create policy company_delivery_zones_company
  on public.company_delivery_zones
  for all
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

revoke all on table public.company_order_settings from anon, public;
revoke all on table public.company_delivery_zones from anon, public;

grant select, insert, update on table public.company_order_settings to authenticated;
grant select, insert, update, delete on table public.company_delivery_zones to authenticated;

grant select, insert, update on table public.company_order_settings to service_role;
grant select, insert, update, delete on table public.company_delivery_zones to service_role;
