-- Extend ticket metrics RPC for enterprise inbox KPIs (real aggregates only).

create or replace function public.ticket_platform_company_metrics_v1(
  p_company_id uuid,
  p_today_start timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      id,
      status,
      priority,
      assigned_user_id,
      created_at,
      closed_at,
      resolved_at,
      first_response_at,
      sla_due_at
    from public.support_tickets
    where company_id = p_company_id
      and deleted_at is null
  ),
  priority_counts as (
    select coalesce(jsonb_object_agg(priority, cnt), '{}'::jsonb) as data
    from (
      select priority, count(*)::int as cnt
      from base
      group by priority
    ) s
  ),
  status_counts as (
    select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) as data
    from (
      select status, count(*)::int as cnt
      from base
      group by status
    ) s
  ),
  agent_counts as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'agentId', agent_id,
          'agentName', agent_name,
          'count', cnt
        )
        order by cnt desc
      ),
      '[]'::jsonb
    ) as data
    from (
      select
        b.assigned_user_id as agent_id,
        coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), b.assigned_user_id::text) as agent_name,
        count(*)::int as cnt
      from base b
      left join public.profiles p on p.id = b.assigned_user_id
      where b.assigned_user_id is not null
      group by b.assigned_user_id, p.full_name, p.email
    ) s
  ),
  aggregates as (
    select
      count(*)::int as total_tickets,
      count(*) filter (where status in ('open', 'in_progress', 'waiting_customer'))::int as open_tickets,
      count(*) filter (where closed_at is not null and closed_at >= p_today_start)::int as closed_today,
      count(*) filter (
        where status in ('open', 'in_progress', 'waiting_customer')
          and assigned_user_id is null
      )::int as unassigned_tickets,
      count(*) filter (where priority in ('high', 'urgent'))::int as high_urgent_tickets,
      coalesce(
        round(avg(
          extract(epoch from (coalesce(resolved_at, closed_at) - created_at)) / 60.0
        ) filter (where coalesce(resolved_at, closed_at) is not null))::int,
        0
      ) as average_resolution_minutes,
      coalesce(
        round(avg(
          extract(epoch from (first_response_at - created_at)) / 60.0
        ) filter (where first_response_at is not null))::int,
        0
      ) as average_response_minutes,
      count(*) filter (
        where status in ('resolved', 'closed')
          and sla_due_at is not null
          and coalesce(resolved_at, closed_at) > sla_due_at
      )::int as sla_breaches_closed,
      count(*) filter (
        where status in ('open', 'in_progress', 'waiting_customer')
          and sla_due_at is not null
          and sla_due_at < now()
      )::int as sla_breaches_open,
      count(*) filter (
        where status in ('open', 'in_progress', 'waiting_customer')
          and sla_due_at is not null
          and sla_due_at >= now()
          and sla_due_at <= (now() + interval '1 hour')
      )::int as sla_at_risk_open,
      count(*) filter (where status in ('resolved', 'closed'))::int as total_closed_for_sla
    from base
  )
  select jsonb_build_object(
    'totalTickets', a.total_tickets,
    'openTickets', a.open_tickets,
    'closedToday', a.closed_today,
    'unassignedTickets', a.unassigned_tickets,
    'highUrgentTickets', a.high_urgent_tickets,
    'averageResolutionMinutes', a.average_resolution_minutes,
    'averageResponseMinutes', a.average_response_minutes,
    'slaBreaches', a.sla_breaches_closed + a.sla_breaches_open,
    'slaBreachesOpen', a.sla_breaches_open,
    'slaBreachesClosed', a.sla_breaches_closed,
    'slaAtRiskOpen', a.sla_at_risk_open,
    'slaCompliancePercent',
      case
        when a.total_closed_for_sla = 0 then 100
        else round(((a.total_closed_for_sla - a.sla_breaches_closed)::numeric / a.total_closed_for_sla) * 1000) / 10
      end,
    'ticketsByPriority', pc.data,
    'ticketsByStatus', sc.data,
    'ticketsByAgent', ac.data
  )
  from aggregates a
  cross join priority_counts pc
  cross join status_counts sc
  cross join agent_counts ac;
$$;

grant execute on function public.ticket_platform_company_metrics_v1(uuid, timestamptz) to authenticated, service_role;
