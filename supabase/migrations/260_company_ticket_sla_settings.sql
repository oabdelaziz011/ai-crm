-- Company-level ticket SLA hours by priority (configurable from Settings).

create table if not exists public.company_ticket_sla_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  urgent_hours integer not null default 4
    check (urgent_hours > 0 and urgent_hours <= 720),
  high_hours integer not null default 8
    check (high_hours > 0 and high_hours <= 720),
  normal_hours integer not null default 24
    check (normal_hours > 0 and normal_hours <= 720),
  low_hours integer not null default 72
    check (low_hours > 0 and low_hours <= 720),
  warning_hours integer not null default 1
    check (warning_hours > 0 and warning_hours <= 168),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.company_ticket_sla_settings is
  'Per-company SLA resolution windows (hours) by ticket priority. Defaults match ticket-platform constants.';

drop trigger if exists set_company_ticket_sla_settings_updated_at on public.company_ticket_sla_settings;
create trigger set_company_ticket_sla_settings_updated_at
  before update on public.company_ticket_sla_settings
  for each row
  execute procedure public.set_updated_at();

alter table public.company_ticket_sla_settings enable row level security;

drop policy if exists company_ticket_sla_settings_select on public.company_ticket_sla_settings;
create policy company_ticket_sla_settings_select
  on public.company_ticket_sla_settings for select
  using (
    auth.role() = 'service_role'
    or public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and (
        public.company_has_permission(company_id, 'tickets.view')
        or public.company_has_permission(company_id, 'tickets.manage')
      )
    )
  );

drop policy if exists company_ticket_sla_settings_write on public.company_ticket_sla_settings;
create policy company_ticket_sla_settings_write
  on public.company_ticket_sla_settings for all
  using (
    auth.role() = 'service_role'
    or public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'tickets.manage')
    )
  )
  with check (
    auth.role() = 'service_role'
    or public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'tickets.manage')
    )
  );

grant select, insert, update, delete on public.company_ticket_sla_settings to authenticated;
grant all on public.company_ticket_sla_settings to service_role;
