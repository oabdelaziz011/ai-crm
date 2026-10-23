-- ============================================================
-- Product Demo Scheduling — independent of clinic/service scheduling.
-- Additive only. Does not alter scheduling_bookings or operational availability.
-- ============================================================

insert into public.permissions (code, category, module, action, description)
values
  ('product_demos.view', 'Sales', 'Product Demos', 'View', 'View product demo availability and bookings'),
  ('product_demos.manage', 'Sales', 'Product Demos', 'Manage', 'Publish and manage product demo offerings, presenters, and slots'),
  ('product_demos.book', 'Sales', 'Product Demos', 'Book', 'Create, cancel, or reschedule product demo bookings')
on conflict (code) do update
set category = excluded.category, module = excluded.module, action = excluded.action,
    description = excluded.description, updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'product_demos.view'), ('admin', 'product_demos.manage'), ('admin', 'product_demos.book'),
    ('manager', 'product_demos.view'), ('manager', 'product_demos.manage'), ('manager', 'product_demos.book'),
    ('employee', 'product_demos.view'), ('employee', 'product_demos.book')
) as v(template_key, permission_code)
on conflict do nothing;

-- One offering per company + catalog product (demo configuration root).
create table if not exists public.product_demo_offerings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
  title text not null default '',
  duration_minutes int not null default 30 check (duration_minutes > 0 and duration_minutes <= 24 * 60),
  buffer_minutes int not null default 0 check (buffer_minutes >= 0 and buffer_minutes <= 24 * 60),
  timezone text not null default 'UTC',
  capacity int not null default 1 check (capacity >= 1 and capacity <= 100),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists idx_product_demo_offerings_company_product_active
  on public.product_demo_offerings(company_id, catalog_product_id)
  where deleted_at is null;

create index if not exists idx_product_demo_offerings_company_status
  on public.product_demo_offerings(company_id, status)
  where deleted_at is null;

comment on table public.product_demo_offerings is
  'Company-scoped product demo configuration. Independent of scheduling_services.';

-- Eligible presenters (company users) for an offering.
create table if not exists public.product_demo_presenters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  offering_id uuid not null references public.product_demo_offerings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (offering_id, user_id)
);

create index if not exists idx_product_demo_presenters_company_user
  on public.product_demo_presenters(company_id, user_id)
  where is_active = true;

create index if not exists idx_product_demo_presenters_offering
  on public.product_demo_presenters(offering_id)
  where is_active = true;

comment on table public.product_demo_presenters is
  'Users authorized to present a product demo offering. Must belong to the same company.';

-- Optional recurring windows used to generate publishable slots (not customer-bookable alone).
create table if not exists public.product_demo_availability_windows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  offering_id uuid not null references public.product_demo_offerings(id) on delete cascade,
  presenter_user_id uuid references auth.users(id) on delete set null,
  weekday smallint not null check (weekday >= 0 and weekday <= 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists idx_product_demo_windows_offering
  on public.product_demo_availability_windows(offering_id)
  where is_active = true;

-- Explicit published inventory — the only customer/AI bookable surface.
create table if not exists public.product_demo_slots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  offering_id uuid not null references public.product_demo_offerings(id) on delete cascade,
  catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
  presenter_user_id uuid not null references auth.users(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'UTC',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'blocked', 'booked', 'cancelled')),
  capacity int not null default 1 check (capacity >= 1 and capacity <= 100),
  booked_count int not null default 0 check (booked_count >= 0),
  published_at timestamptz,
  blocked_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_at > start_at),
  check (booked_count <= capacity)
);

create index if not exists idx_product_demo_slots_bookable
  on public.product_demo_slots(company_id, catalog_product_id, start_at)
  where deleted_at is null and status = 'published';

create index if not exists idx_product_demo_slots_offering_start
  on public.product_demo_slots(offering_id, start_at)
  where deleted_at is null;

create index if not exists idx_product_demo_slots_presenter_start
  on public.product_demo_slots(company_id, presenter_user_id, start_at)
  where deleted_at is null and status in ('draft', 'published', 'booked', 'blocked');

comment on table public.product_demo_slots is
  'Explicitly published product demo slots. Unpublished/draft slots are never customer-bookable.';

-- Authoritative product demo bookings (separate from scheduling_bookings).
create table if not exists public.product_demo_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  slot_id uuid not null references public.product_demo_slots(id) on delete restrict,
  offering_id uuid not null references public.product_demo_offerings(id) on delete restrict,
  catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
  presenter_user_id uuid not null references auth.users(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'UTC',
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled')),
  client_request_id text,
  confirmation_number text,
  notes text,
  cancelled_at timestamptz,
  cancel_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_at > start_at)
);

-- Concurrency for capacity is enforced in product_demo_reserve_slot (SELECT FOR UPDATE).
create unique index if not exists idx_product_demo_bookings_company_client_request
  on public.product_demo_bookings(company_id, client_request_id)
  where client_request_id is not null
    and btrim(client_request_id) <> ''
    and deleted_at is null;

create index if not exists idx_product_demo_bookings_company_start
  on public.product_demo_bookings(company_id, start_at desc)
  where deleted_at is null;

create index if not exists idx_product_demo_bookings_product
  on public.product_demo_bookings(company_id, catalog_product_id, start_at desc)
  where deleted_at is null;

create index if not exists idx_product_demo_bookings_customer
  on public.product_demo_bookings(company_id, customer_id, start_at desc)
  where deleted_at is null and customer_id is not null;

create index if not exists idx_product_demo_bookings_lead
  on public.product_demo_bookings(company_id, lead_id)
  where deleted_at is null and lead_id is not null;

comment on table public.product_demo_bookings is
  'Authoritative product demo bookings. Independent of scheduling_bookings / clinic appointments.';

-- History / audit for demo bookings (cancel, reschedule).
create table if not exists public.product_demo_booking_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null references public.product_demo_bookings(id) on delete cascade,
  event_type text not null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_demo_booking_history_booking
  on public.product_demo_booking_history(booking_id, created_at desc);

-- RLS
alter table public.product_demo_offerings enable row level security;
alter table public.product_demo_presenters enable row level security;
alter table public.product_demo_availability_windows enable row level security;
alter table public.product_demo_slots enable row level security;
alter table public.product_demo_bookings enable row level security;
alter table public.product_demo_booking_history enable row level security;

drop policy if exists product_demo_offerings_select on public.product_demo_offerings;
create policy product_demo_offerings_select on public.product_demo_offerings for select
  using (
    public.has_company_permission(company_id, 'product_demos.view')
    or public.has_company_permission(company_id, 'product_demos.manage')
  );

drop policy if exists product_demo_offerings_write on public.product_demo_offerings;
create policy product_demo_offerings_write on public.product_demo_offerings for all
  using (public.has_company_permission(company_id, 'product_demos.manage'))
  with check (public.has_company_permission(company_id, 'product_demos.manage'));

drop policy if exists product_demo_presenters_select on public.product_demo_presenters;
create policy product_demo_presenters_select on public.product_demo_presenters for select
  using (
    public.has_company_permission(company_id, 'product_demos.view')
    or public.has_company_permission(company_id, 'product_demos.manage')
  );

drop policy if exists product_demo_presenters_write on public.product_demo_presenters;
create policy product_demo_presenters_write on public.product_demo_presenters for all
  using (public.has_company_permission(company_id, 'product_demos.manage'))
  with check (public.has_company_permission(company_id, 'product_demos.manage'));

drop policy if exists product_demo_windows_select on public.product_demo_availability_windows;
create policy product_demo_windows_select on public.product_demo_availability_windows for select
  using (
    public.has_company_permission(company_id, 'product_demos.view')
    or public.has_company_permission(company_id, 'product_demos.manage')
  );

drop policy if exists product_demo_windows_write on public.product_demo_availability_windows;
create policy product_demo_windows_write on public.product_demo_availability_windows for all
  using (public.has_company_permission(company_id, 'product_demos.manage'))
  with check (public.has_company_permission(company_id, 'product_demos.manage'));

drop policy if exists product_demo_slots_select on public.product_demo_slots;
create policy product_demo_slots_select on public.product_demo_slots for select
  using (
    public.has_company_permission(company_id, 'product_demos.view')
    or public.has_company_permission(company_id, 'product_demos.manage')
    or public.has_company_permission(company_id, 'product_demos.book')
  );

drop policy if exists product_demo_slots_write on public.product_demo_slots;
create policy product_demo_slots_write on public.product_demo_slots for all
  using (public.has_company_permission(company_id, 'product_demos.manage'))
  with check (public.has_company_permission(company_id, 'product_demos.manage'));

drop policy if exists product_demo_bookings_select on public.product_demo_bookings;
create policy product_demo_bookings_select on public.product_demo_bookings for select
  using (
    public.has_company_permission(company_id, 'product_demos.view')
    or public.has_company_permission(company_id, 'product_demos.book')
    or public.has_company_permission(company_id, 'product_demos.manage')
  );

drop policy if exists product_demo_bookings_write on public.product_demo_bookings;
create policy product_demo_bookings_write on public.product_demo_bookings for all
  using (
    public.has_company_permission(company_id, 'product_demos.book')
    or public.has_company_permission(company_id, 'product_demos.manage')
  )
  with check (
    public.has_company_permission(company_id, 'product_demos.book')
    or public.has_company_permission(company_id, 'product_demos.manage')
  );

drop policy if exists product_demo_booking_history_select on public.product_demo_booking_history;
create policy product_demo_booking_history_select on public.product_demo_booking_history for select
  using (
    public.has_company_permission(company_id, 'product_demos.view')
    or public.has_company_permission(company_id, 'product_demos.manage')
  );

drop policy if exists product_demo_booking_history_insert on public.product_demo_booking_history;
create policy product_demo_booking_history_insert on public.product_demo_booking_history for insert
  with check (
    public.has_company_permission(company_id, 'product_demos.book')
    or public.has_company_permission(company_id, 'product_demos.manage')
  );

grant select, insert, update, delete on public.product_demo_offerings to authenticated, service_role;
grant select, insert, update, delete on public.product_demo_presenters to authenticated, service_role;
grant select, insert, update, delete on public.product_demo_availability_windows to authenticated, service_role;
grant select, insert, update, delete on public.product_demo_slots to authenticated, service_role;
grant select, insert, update, delete on public.product_demo_bookings to authenticated, service_role;
grant select, insert on public.product_demo_booking_history to authenticated, service_role;

-- Atomic reserve: only succeeds when slot is published, future, and has remaining capacity.
create or replace function public.product_demo_reserve_slot(
  p_company_id uuid,
  p_slot_id uuid,
  p_customer_id uuid,
  p_lead_id uuid,
  p_conversation_id uuid,
  p_notes text,
  p_client_request_id text,
  p_actor_user_id uuid
)
returns public.product_demo_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.product_demo_slots%rowtype;
  v_booking public.product_demo_bookings%rowtype;
  v_conf text;
begin
  if p_client_request_id is not null and btrim(p_client_request_id) <> '' then
    select * into v_booking
    from public.product_demo_bookings
    where company_id = p_company_id
      and client_request_id = p_client_request_id
      and deleted_at is null
    limit 1;
    if found then
      return v_booking;
    end if;
  end if;

  select * into v_slot
  from public.product_demo_slots
  where id = p_slot_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'PRODUCT_DEMO_SLOT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_slot.status <> 'published' then
    raise exception 'PRODUCT_DEMO_SLOT_NOT_BOOKABLE' using errcode = 'P0001';
  end if;

  if v_slot.start_at <= now() then
    raise exception 'PRODUCT_DEMO_SLOT_EXPIRED' using errcode = 'P0001';
  end if;

  if v_slot.booked_count >= v_slot.capacity then
    raise exception 'PRODUCT_DEMO_SLOT_FULL' using errcode = 'P0001';
  end if;

  v_conf := 'PD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.product_demo_bookings (
    company_id, slot_id, offering_id, catalog_product_id, presenter_user_id,
    customer_id, lead_id, conversation_id, start_at, end_at, timezone,
    status, client_request_id, confirmation_number, notes, created_by, updated_by
  ) values (
    v_slot.company_id, v_slot.id, v_slot.offering_id, v_slot.catalog_product_id, v_slot.presenter_user_id,
    p_customer_id, p_lead_id, p_conversation_id, v_slot.start_at, v_slot.end_at, v_slot.timezone,
    'confirmed', nullif(btrim(coalesce(p_client_request_id, '')), ''), v_conf, p_notes,
    p_actor_user_id, p_actor_user_id
  )
  returning * into v_booking;

  update public.product_demo_slots
  set booked_count = booked_count + 1,
      status = case when booked_count + 1 >= capacity then 'booked' else status end,
      updated_at = now(),
      updated_by = p_actor_user_id
  where id = v_slot.id;

  insert into public.product_demo_booking_history (
    company_id, booking_id, event_type, summary, payload, actor_user_id
  ) values (
    v_booking.company_id,
    v_booking.id,
    'created',
    'Product demo booking confirmed',
    jsonb_build_object('slotId', v_slot.id, 'productId', v_slot.catalog_product_id),
    p_actor_user_id
  );

  return v_booking;
end;
$$;

revoke all on function public.product_demo_reserve_slot(uuid, uuid, uuid, uuid, uuid, text, text, uuid) from public;
grant execute on function public.product_demo_reserve_slot(uuid, uuid, uuid, uuid, uuid, text, text, uuid)
  to authenticated, service_role;
