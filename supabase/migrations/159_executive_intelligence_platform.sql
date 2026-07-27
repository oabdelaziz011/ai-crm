-- ============================================================
-- Vault OS – Sprint 7.1 Executive Intelligence Platform
-- Alerts, access audit, forecast cache
-- ============================================================

insert into public.permissions (code, category, module, action, description)
values
  ('executive.view', 'Executive', 'Executive Intelligence', 'View', 'View executive intelligence dashboard'),
  ('executive.manage_alerts', 'Executive', 'Executive Intelligence', 'Manage', 'Dismiss and resolve executive alerts')
on conflict (code) do nothing;

-- ── Executive alerts ─────────────────────────────────────────

create table if not exists public.executive_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  alert_type text not null,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text not null,
  metric_key text,
  metric_value numeric(14, 4),
  threshold_value numeric(14, 4),
  status text not null default 'active'
    check (status in ('active', 'dismissed', 'resolved')),
  metadata jsonb not null default '{}'::jsonb,
  dismissed_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_executive_alerts_company_status
  on public.executive_alerts(company_id, status, created_at desc);

create index if not exists idx_executive_alerts_type
  on public.executive_alerts(company_id, alert_type);

drop trigger if exists executive_alerts_updated_at on public.executive_alerts;
create trigger executive_alerts_updated_at
  before update on public.executive_alerts
  for each row execute procedure public.set_updated_at();

-- ── Alert audit trail ────────────────────────────────────────

create table if not exists public.executive_alert_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  alert_id uuid not null references public.executive_alerts(id) on delete cascade,
  action text not null check (action in ('created', 'dismissed', 'resolved', 'escalated')),
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Dashboard access audit ───────────────────────────────────

create table if not exists public.executive_dashboard_access_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  section text not null default 'dashboard',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_executive_access_company
  on public.executive_dashboard_access_log(company_id, created_at desc);

-- ── Forecast cache ───────────────────────────────────────────

create table if not exists public.executive_forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  horizon_days integer not null check (horizon_days in (7, 30, 90)),
  forecast_type text not null
    check (forecast_type in ('revenue', 'bookings', 'occupancy', 'demand', 'cash_flow')),
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

create index if not exists idx_executive_forecast_company
  on public.executive_forecast_snapshots(company_id, forecast_type, horizon_days, generated_at desc);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.executive_alerts enable row level security;
alter table public.executive_alert_audit enable row level security;
alter table public.executive_dashboard_access_log enable row level security;
alter table public.executive_forecast_snapshots enable row level security;

drop policy if exists executive_alerts_select on public.executive_alerts;
create policy executive_alerts_select on public.executive_alerts for select using (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists executive_alerts_write on public.executive_alerts;
create policy executive_alerts_write on public.executive_alerts for all using (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
) with check (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists executive_alert_audit_select on public.executive_alert_audit;
create policy executive_alert_audit_select on public.executive_alert_audit for select using (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists executive_alert_audit_write on public.executive_alert_audit;
create policy executive_alert_audit_write on public.executive_alert_audit for all using (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
) with check (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists executive_access_log_select on public.executive_dashboard_access_log;
create policy executive_access_log_select on public.executive_dashboard_access_log for select using (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists executive_access_log_insert on public.executive_dashboard_access_log;
create policy executive_access_log_insert on public.executive_dashboard_access_log for insert with check (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists executive_forecast_select on public.executive_forecast_snapshots;
create policy executive_forecast_select on public.executive_forecast_snapshots for select using (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists executive_forecast_write on public.executive_forecast_snapshots;
create policy executive_forecast_write on public.executive_forecast_snapshots for all using (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
) with check (
  auth.role() = 'authenticated' and (public.is_super_admin() or company_id = public.current_company_id())
);

-- Grant executive.view to admin/manager roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name in ('admin', 'manager', 'owner')
  and p.code in ('executive.view', 'executive.manage_alerts')
on conflict do nothing;

-- ── RPC: record dashboard access ─────────────────────────────

create or replace function public.executive_record_access(
  p_company_id uuid,
  p_section text default 'dashboard',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.executive_dashboard_access_log (company_id, user_id, section, metadata)
  values (p_company_id, auth.uid(), p_section, p_metadata)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.executive_record_access(uuid, text, jsonb) to authenticated;
