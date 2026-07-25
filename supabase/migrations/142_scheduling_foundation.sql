-- ============================================================
-- Vault OS – Enterprise Scheduling Foundation (S4.1)
-- Resources, availability config, booking rules, holidays
-- NO slot generation or availability engine in this sprint
-- ============================================================

-- ── Branches (multi-location foundation) ────────────────────

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  timezone text not null default 'UTC',
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  address_line1 text,
  address_line2 text,
  city text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_branches_company_id
  on public.branches(company_id)
  where deleted_at is null;

create unique index if not exists idx_branches_company_name_active
  on public.branches(company_id, lower(name))
  where deleted_at is null;

drop trigger if exists branches_updated_at on public.branches;
create trigger branches_updated_at
  before update on public.branches
  for each row execute procedure public.set_updated_at();

-- ── Scheduling resources ────────────────────────────────────

create table if not exists public.scheduling_resources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  resource_type text not null
    check (resource_type in (
      'doctor', 'employee', 'therapist', 'room', 'chair', 'equipment', 'other'
    )),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  timezone text not null default 'UTC',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_scheduling_resources_company_id
  on public.scheduling_resources(company_id)
  where deleted_at is null;

create index if not exists idx_scheduling_resources_branch_id
  on public.scheduling_resources(branch_id)
  where deleted_at is null;

create index if not exists idx_scheduling_resources_type
  on public.scheduling_resources(company_id, resource_type)
  where deleted_at is null;

create unique index if not exists idx_scheduling_resources_company_name_active
  on public.scheduling_resources(company_id, lower(name))
  where deleted_at is null;

drop trigger if exists scheduling_resources_updated_at on public.scheduling_resources;
create trigger scheduling_resources_updated_at
  before update on public.scheduling_resources
  for each row execute procedure public.set_updated_at();

-- ── Weekly availability (per resource, per day) ─────────────

create table if not exists public.scheduling_resource_weekly_hours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  resource_id uuid not null references public.scheduling_resources(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource_id, day_of_week),
  check (
    is_closed = true
    or (opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

create index if not exists idx_scheduling_weekly_hours_resource
  on public.scheduling_resource_weekly_hours(resource_id);

drop trigger if exists scheduling_resource_weekly_hours_updated_at on public.scheduling_resource_weekly_hours;
create trigger scheduling_resource_weekly_hours_updated_at
  before update on public.scheduling_resource_weekly_hours
  for each row execute procedure public.set_updated_at();

-- ── Breaks (multiple per day) ───────────────────────────────

create table if not exists public.scheduling_resource_breaks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  weekly_hours_id uuid not null references public.scheduling_resource_weekly_hours(id) on delete cascade,
  resource_id uuid not null references public.scheduling_resources(id) on delete cascade,
  starts_at time not null,
  ends_at time not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create index if not exists idx_scheduling_breaks_weekly_hours
  on public.scheduling_resource_breaks(weekly_hours_id);

create index if not exists idx_scheduling_breaks_resource
  on public.scheduling_resource_breaks(resource_id);

drop trigger if exists scheduling_resource_breaks_updated_at on public.scheduling_resource_breaks;
create trigger scheduling_resource_breaks_updated_at
  before update on public.scheduling_resource_breaks
  for each row execute procedure public.set_updated_at();

-- ── Special exceptions (vacation, training, etc.) ───────────

create table if not exists public.scheduling_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  resource_id uuid not null references public.scheduling_resources(id) on delete cascade,
  exception_type text not null
    check (exception_type in (
      'vacation', 'training', 'conference', 'unavailable', 'custom'
    )),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  check (starts_at < ends_at)
);

create index if not exists idx_scheduling_exceptions_resource
  on public.scheduling_availability_exceptions(resource_id, starts_at, ends_at)
  where deleted_at is null;

create index if not exists idx_scheduling_exceptions_company
  on public.scheduling_availability_exceptions(company_id, starts_at)
  where deleted_at is null;

drop trigger if exists scheduling_availability_exceptions_updated_at on public.scheduling_availability_exceptions;
create trigger scheduling_availability_exceptions_updated_at
  before update on public.scheduling_availability_exceptions
  for each row execute procedure public.set_updated_at();

-- ── Company booking rules (global scheduling policy) ────────

create table if not exists public.scheduling_booking_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  min_booking_notice_minutes integer not null default 60
    check (min_booking_notice_minutes >= 0),
  max_booking_window_days integer not null default 90
    check (max_booking_window_days >= 1),
  buffer_before_minutes integer not null default 0
    check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0
    check (buffer_after_minutes >= 0),
  allow_overbooking boolean not null default false,
  timezone text not null default 'UTC',
  week_start_day smallint not null default 1
    check (week_start_day between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id)
);

create index if not exists idx_scheduling_booking_rules_company
  on public.scheduling_booking_rules(company_id);

drop trigger if exists scheduling_booking_rules_updated_at on public.scheduling_booking_rules;
create trigger scheduling_booking_rules_updated_at
  before update on public.scheduling_booking_rules
  for each row execute procedure public.set_updated_at();

-- ── Company holidays ────────────────────────────────────────

create table if not exists public.scheduling_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  holiday_date date not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_scheduling_holidays_company_date
  on public.scheduling_holidays(company_id, holiday_date)
  where deleted_at is null;

create index if not exists idx_scheduling_holidays_branch
  on public.scheduling_holidays(branch_id)
  where deleted_at is null;

create unique index if not exists idx_scheduling_holidays_company_branch_date
  on public.scheduling_holidays(company_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), holiday_date)
  where deleted_at is null;

drop trigger if exists scheduling_holidays_updated_at on public.scheduling_holidays;
create trigger scheduling_holidays_updated_at
  before update on public.scheduling_holidays
  for each row execute procedure public.set_updated_at();

-- ── Permissions ─────────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('scheduling.view', 'Scheduling', 'Scheduling', 'View', 'View scheduling settings and resources'),
  ('scheduling.edit', 'Scheduling', 'Scheduling', 'Edit', 'Manage scheduling resources, availability, rules, and holidays')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── Row Level Security ────────────────────────────────────────

alter table public.branches enable row level security;
alter table public.scheduling_resources enable row level security;
alter table public.scheduling_resource_weekly_hours enable row level security;
alter table public.scheduling_resource_breaks enable row level security;
alter table public.scheduling_availability_exceptions enable row level security;
alter table public.scheduling_booking_rules enable row level security;
alter table public.scheduling_holidays enable row level security;

-- Branches
drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists branches_insert on public.branches;
create policy branches_insert on public.branches for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists branches_update on public.branches;
create policy branches_update on public.branches for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists branches_delete on public.branches;
create policy branches_delete on public.branches for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

-- Scheduling resources
drop policy if exists scheduling_resources_select on public.scheduling_resources;
create policy scheduling_resources_select on public.scheduling_resources for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists scheduling_resources_insert on public.scheduling_resources;
create policy scheduling_resources_insert on public.scheduling_resources for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_resources_update on public.scheduling_resources;
create policy scheduling_resources_update on public.scheduling_resources for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_resources_delete on public.scheduling_resources;
create policy scheduling_resources_delete on public.scheduling_resources for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

-- Weekly hours
drop policy if exists scheduling_weekly_hours_select on public.scheduling_resource_weekly_hours;
create policy scheduling_weekly_hours_select on public.scheduling_resource_weekly_hours for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists scheduling_weekly_hours_insert on public.scheduling_resource_weekly_hours;
create policy scheduling_weekly_hours_insert on public.scheduling_resource_weekly_hours for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_weekly_hours_update on public.scheduling_resource_weekly_hours;
create policy scheduling_weekly_hours_update on public.scheduling_resource_weekly_hours for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_weekly_hours_delete on public.scheduling_resource_weekly_hours;
create policy scheduling_weekly_hours_delete on public.scheduling_resource_weekly_hours for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

-- Breaks
drop policy if exists scheduling_breaks_select on public.scheduling_resource_breaks;
create policy scheduling_breaks_select on public.scheduling_resource_breaks for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists scheduling_breaks_insert on public.scheduling_resource_breaks;
create policy scheduling_breaks_insert on public.scheduling_resource_breaks for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_breaks_update on public.scheduling_resource_breaks;
create policy scheduling_breaks_update on public.scheduling_resource_breaks for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_breaks_delete on public.scheduling_resource_breaks;
create policy scheduling_breaks_delete on public.scheduling_resource_breaks for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

-- Exceptions
drop policy if exists scheduling_exceptions_select on public.scheduling_availability_exceptions;
create policy scheduling_exceptions_select on public.scheduling_availability_exceptions for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists scheduling_exceptions_insert on public.scheduling_availability_exceptions;
create policy scheduling_exceptions_insert on public.scheduling_availability_exceptions for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_exceptions_update on public.scheduling_availability_exceptions;
create policy scheduling_exceptions_update on public.scheduling_availability_exceptions for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_exceptions_delete on public.scheduling_availability_exceptions;
create policy scheduling_exceptions_delete on public.scheduling_availability_exceptions for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

-- Booking rules
drop policy if exists scheduling_booking_rules_select on public.scheduling_booking_rules;
create policy scheduling_booking_rules_select on public.scheduling_booking_rules for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists scheduling_booking_rules_insert on public.scheduling_booking_rules;
create policy scheduling_booking_rules_insert on public.scheduling_booking_rules for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_booking_rules_update on public.scheduling_booking_rules;
create policy scheduling_booking_rules_update on public.scheduling_booking_rules for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

-- Holidays
drop policy if exists scheduling_holidays_select on public.scheduling_holidays;
create policy scheduling_holidays_select on public.scheduling_holidays for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists scheduling_holidays_insert on public.scheduling_holidays;
create policy scheduling_holidays_insert on public.scheduling_holidays for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_holidays_update on public.scheduling_holidays;
create policy scheduling_holidays_update on public.scheduling_holidays for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

drop policy if exists scheduling_holidays_delete on public.scheduling_holidays;
create policy scheduling_holidays_delete on public.scheduling_holidays for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.user_has_permission('scheduling.edit'))
    )
  );

comment on table public.scheduling_resources is
  'Bookable resources (staff, rooms, equipment). No scheduling logic — configuration only.';
comment on table public.scheduling_resource_weekly_hours is
  'Weekly recurring hours per resource. Slot generation deferred to S4.2+.';
comment on table public.scheduling_booking_rules is
  'Company-wide booking policy. One row per company.';

-- Grant scheduling permissions to tenant company admin roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.template_key = 'company_admin'
  and r.company_id is not null
  and p.code in ('scheduling.view', 'scheduling.edit')
on conflict do nothing;
