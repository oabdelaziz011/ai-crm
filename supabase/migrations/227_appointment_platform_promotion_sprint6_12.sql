-- Sprint 6.12: Appointment Platform promotion — identity links + metrics RPC.

alter table public.scheduling_bookings
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

create index if not exists idx_scheduling_bookings_company_lead
  on public.scheduling_bookings(company_id, lead_id)
  where deleted_at is null and lead_id is not null;

create index if not exists idx_scheduling_bookings_company_conversation
  on public.scheduling_bookings(company_id, conversation_id)
  where deleted_at is null and conversation_id is not null;

create index if not exists idx_scheduling_bookings_company_status_start
  on public.scheduling_bookings(company_id, status, start_at)
  where deleted_at is null;

create or replace function public.appointment_platform_company_metrics_v1(
  p_company_id uuid,
  p_period_start timestamptz default date_trunc('month', now())
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_prev_start timestamptz := p_period_start - (v_now - p_period_start);
  v_result jsonb;
begin
  if not (
    public.is_super_admin()
    or (p_company_id = public.current_company_id() and public.user_has_permission('bookings.view'))
  ) then
    raise exception 'permission denied';
  end if;

  select jsonb_build_object(
    'upcoming', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.start_at >= v_now
        and b.status in ('pending', 'confirmed', 'checked_in')
    ), 0),
    'completedInPeriod', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.status = 'completed'
        and b.updated_at >= p_period_start
    ), 0),
    'cancelledInPeriod', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.status = 'cancelled'
        and b.updated_at >= p_period_start
    ), 0),
    'noShowInPeriod', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.status = 'no_show'
        and b.updated_at >= p_period_start
    ), 0),
    'createdInPeriod', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.created_at >= p_period_start
    ), 0),
    'createdPreviousPeriod', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.created_at >= v_prev_start
        and b.created_at < p_period_start
    ), 0),
    'averageDurationMinutes', coalesce((
      select round(avg(extract(epoch from (b.end_at - b.start_at)) / 60.0))::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.status = 'completed'
        and b.updated_at >= p_period_start
    ), 0),
    'resourceUtilizationPercent', coalesce((
      select case
        when total_slots = 0 then 0
        else round((booked_minutes::numeric / total_slots) * 100)::int
      end
      from (
        select
          coalesce(sum(extract(epoch from (b.end_at - b.start_at)) / 60.0), 0) as booked_minutes,
          greatest(count(distinct b.resource_id), 1) * 480 as total_slots
        from public.scheduling_bookings b
        where b.company_id = p_company_id
          and b.deleted_at is null
          and b.start_at >= p_period_start
          and b.status in ('pending', 'confirmed', 'checked_in', 'completed')
      ) util
    ), 0)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.appointment_platform_company_metrics_v1(uuid, timestamptz) to authenticated, service_role;

comment on function public.appointment_platform_company_metrics_v1 is
  'Aggregated appointment metrics for dashboard — Sprint 6.12.';
