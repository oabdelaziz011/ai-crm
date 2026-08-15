-- 277: Reports workspace — per-report permissions + saved views + schedules foundation
-- Does NOT implement the email worker; schedules are durable storage for the worker to consume later.

insert into public.permissions (code, category, module, action, description)
values
  ('reports.overview', 'Reports', 'Reports', 'Overview', 'View overview analytics report'),
  ('reports.bookings', 'Reports', 'Reports', 'Bookings', 'View bookings report'),
  ('reports.customers', 'Reports', 'Reports', 'Customers', 'View customers report'),
  ('reports.leads', 'Reports', 'Reports', 'Leads', 'View leads report'),
  ('reports.opportunities', 'Reports', 'Reports', 'Opportunities', 'View opportunities report'),
  ('reports.products', 'Reports', 'Reports', 'Products', 'View products report'),
  ('reports.quotes', 'Reports', 'Reports', 'Quotes', 'View quotes report'),
  ('reports.tickets', 'Reports', 'Reports', 'Tickets', 'View tickets report'),
  ('reports.operations', 'Reports', 'Reports', 'Operations', 'View operations report'),
  ('reports.invoices', 'Reports', 'Reports', 'Invoices', 'View invoices report'),
  ('reports.financial', 'Reports', 'Reports', 'Financial', 'View financial report'),
  ('reports.executive', 'Reports', 'Reports', 'Executive', 'View executive report'),
  ('reports.ai_operations', 'Reports', 'Reports', 'AI', 'View AI operations report'),
  ('reports.export', 'Reports', 'Reports', 'Export', 'Export reports (CSV/PDF)'),
  ('reports.schedule', 'Reports', 'Reports', 'Schedule', 'Create scheduled report deliveries')
on conflict (code) do nothing;

-- Grant new report permissions to roles that already have reports.view
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p.id
from public.role_permissions rp
join public.permissions existing on existing.id = rp.permission_id and existing.code = 'reports.view'
join public.permissions p on p.code like 'reports.%'
on conflict (role_id, permission_id) do nothing;

create table if not exists public.report_saved_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  report_id text not null,
  branch_id uuid null,
  date_from date null,
  date_to date null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_report_saved_views_company_user
  on public.report_saved_views (company_id, user_id);

alter table public.report_saved_views enable row level security;

drop policy if exists report_saved_views_select_own on public.report_saved_views;
create policy report_saved_views_select_own
  on public.report_saved_views for select
  using (
    company_id = public.current_company_id()
    and user_id = auth.uid()
  );

drop policy if exists report_saved_views_write_own on public.report_saved_views;
create policy report_saved_views_write_own
  on public.report_saved_views for all
  using (
    company_id = public.current_company_id()
    and user_id = auth.uid()
  )
  with check (
    company_id = public.current_company_id()
    and user_id = auth.uid()
  );

create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  report_id text not null,
  branch_id uuid null,
  date_from date null,
  date_to date null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  email text not null,
  enabled boolean not null default true,
  last_sent_at timestamptz null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_report_schedules_company_enabled
  on public.report_schedules (company_id, enabled);

alter table public.report_schedules enable row level security;

drop policy if exists report_schedules_select_own on public.report_schedules;
create policy report_schedules_select_own
  on public.report_schedules for select
  using (
    company_id = public.current_company_id()
    and user_id = auth.uid()
  );

drop policy if exists report_schedules_write_own on public.report_schedules;
create policy report_schedules_write_own
  on public.report_schedules for all
  using (
    company_id = public.current_company_id()
    and user_id = auth.uid()
  )
  with check (
    company_id = public.current_company_id()
    and user_id = auth.uid()
  );

comment on table public.report_saved_views is
  'User-saved Reports workspace filters (report + branch + dates).';
comment on table public.report_schedules is
  'Scheduled report email deliveries — consumed by a future reports email worker.';
