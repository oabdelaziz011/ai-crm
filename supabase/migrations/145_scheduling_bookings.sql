-- S4.5: First-class scheduling-aware bookings domain
-- Legacy public.bookings remains for backward compatibility; new writes use scheduling_bookings.

create table if not exists public.scheduling_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  resource_id uuid not null references public.scheduling_resources(id) on delete restrict,
  service_id uuid not null references public.scheduling_services(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled')),
  source text not null default 'crm'
    check (source in ('crm', 'whatsapp', 'ai_assistant', 'call_center', 'public_booking', 'api')),
  notes text,
  rescheduled_from_id uuid references public.scheduling_bookings(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint scheduling_bookings_end_after_start check (end_at > start_at)
);

create index if not exists idx_scheduling_bookings_company_start
  on public.scheduling_bookings(company_id, start_at)
  where deleted_at is null;

create index if not exists idx_scheduling_bookings_company_customer
  on public.scheduling_bookings(company_id, customer_id)
  where deleted_at is null;

create index if not exists idx_scheduling_bookings_resource_start
  on public.scheduling_bookings(resource_id, start_at)
  where deleted_at is null;

create index if not exists idx_scheduling_bookings_active_resource_range
  on public.scheduling_bookings(resource_id, start_at, end_at)
  where deleted_at is null
    and status in ('pending', 'confirmed');

drop trigger if exists scheduling_bookings_updated_at on public.scheduling_bookings;
create trigger scheduling_bookings_updated_at
  before update on public.scheduling_bookings
  for each row execute function public.set_updated_at();

alter table public.scheduling_bookings enable row level security;

drop policy if exists scheduling_bookings_select on public.scheduling_bookings;
create policy scheduling_bookings_select on public.scheduling_bookings for select
  using (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('bookings.view')
      )
    )
  );

drop policy if exists scheduling_bookings_insert on public.scheduling_bookings;
create policy scheduling_bookings_insert on public.scheduling_bookings for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('bookings.create')
      )
    )
  );

drop policy if exists scheduling_bookings_update on public.scheduling_bookings;
create policy scheduling_bookings_update on public.scheduling_bookings for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('bookings.edit')
      )
    )
  );

drop policy if exists scheduling_bookings_delete on public.scheduling_bookings;
create policy scheduling_bookings_delete on public.scheduling_bookings for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('bookings.delete')
      )
    )
  );

comment on table public.scheduling_bookings is
  'Scheduling-aware bookings linked to company, branch, customer, resource, and service.';
