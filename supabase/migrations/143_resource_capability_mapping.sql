-- ============================================================
-- Vault OS – Resource Capability Mapping (S4.2)
-- Services catalog + resource_services junction
-- ============================================================

create table if not exists public.scheduling_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_scheduling_services_company_id
  on public.scheduling_services(company_id)
  where deleted_at is null;

create unique index if not exists idx_scheduling_services_company_name_active
  on public.scheduling_services(company_id, lower(name))
  where deleted_at is null;

drop trigger if exists scheduling_services_updated_at on public.scheduling_services;
create trigger scheduling_services_updated_at
  before update on public.scheduling_services
  for each row execute procedure public.set_updated_at();

-- ── Resource ↔ Service capability junction ────────────────────

create table if not exists public.resource_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  resource_id uuid not null references public.scheduling_resources(id) on delete cascade,
  service_id uuid not null references public.scheduling_services(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_resource_services_resource
  on public.resource_services(resource_id)
  where deleted_at is null;

create index if not exists idx_resource_services_service
  on public.resource_services(service_id)
  where deleted_at is null;

create index if not exists idx_resource_services_company
  on public.resource_services(company_id)
  where deleted_at is null;

create unique index if not exists idx_resource_services_pair
  on public.resource_services(resource_id, service_id);

-- ── Row Level Security ────────────────────────────────────────

alter table public.scheduling_services enable row level security;
alter table public.resource_services enable row level security;

drop policy if exists scheduling_services_select on public.scheduling_services;
create policy scheduling_services_select on public.scheduling_services for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists scheduling_services_insert on public.scheduling_services;
create policy scheduling_services_insert on public.scheduling_services for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_services_update on public.scheduling_services;
create policy scheduling_services_update on public.scheduling_services for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_services_delete on public.scheduling_services;
create policy scheduling_services_delete on public.scheduling_services for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists resource_services_select on public.resource_services;
create policy resource_services_select on public.resource_services for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists resource_services_insert on public.resource_services;
create policy resource_services_insert on public.resource_services for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists resource_services_update on public.resource_services;
create policy resource_services_update on public.resource_services for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists resource_services_delete on public.resource_services;
create policy resource_services_delete on public.resource_services for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

comment on table public.scheduling_services is
  'Bookable service catalog per company. Capability mapping via resource_services.';
comment on table public.resource_services is
  'Many-to-many capability mapping: which resources can perform which services.';
