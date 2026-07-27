-- Sprint Platform-Observability — AI Operations Center
-- Super-admin RPCs + extended telemetry metadata

-- ── Extend platform usage with rich metadata ─────────────────

alter table public.platform_ai_usage
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.platform_ai_usage
  add column if not exists correlation_id text;

alter table public.platform_ai_usage
  add column if not exists module text;

create index if not exists idx_platform_ai_usage_correlation
  on public.platform_ai_usage(correlation_id)
  where correlation_id is not null;

create index if not exists idx_platform_ai_usage_recorded_at
  on public.platform_ai_usage(recorded_at desc);

-- ── Background task queue (platform-wide) ────────────────────

create table if not exists public.platform_ai_background_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  label text not null,
  task_type text not null default 'ai_request',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress numeric(5, 2) not null default 0 check (progress >= 0 and progress <= 100),
  retry_count integer not null default 0 check (retry_count >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_ai_background_tasks_updated_at on public.platform_ai_background_tasks;
create trigger platform_ai_background_tasks_updated_at
  before update on public.platform_ai_background_tasks
  for each row execute procedure public.set_updated_at();

create index if not exists idx_platform_ai_background_tasks_status
  on public.platform_ai_background_tasks(status, started_at desc);

alter table public.platform_ai_background_tasks enable row level security;

drop policy if exists platform_ai_background_tasks_select on public.platform_ai_background_tasks;
create policy platform_ai_background_tasks_select on public.platform_ai_background_tasks for select using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or company_id = public.current_company_id())
);

drop policy if exists platform_ai_background_tasks_write on public.platform_ai_background_tasks;
create policy platform_ai_background_tasks_write on public.platform_ai_background_tasks for all using (
  public.is_super_admin() or company_id = public.current_company_id()
) with check (
  public.is_super_admin() or company_id = public.current_company_id()
);

-- ── Ops alert events ─────────────────────────────────────────

create table if not exists public.platform_ai_ops_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_ai_ops_alerts_created
  on public.platform_ai_ops_alerts(created_at desc);

alter table public.platform_ai_ops_alerts enable row level security;

drop policy if exists platform_ai_ops_alerts_select on public.platform_ai_ops_alerts;
create policy platform_ai_ops_alerts_select on public.platform_ai_ops_alerts for select using (
  public.is_super_admin()
);

drop policy if exists platform_ai_ops_alerts_write on public.platform_ai_ops_alerts;
create policy platform_ai_ops_alerts_write on public.platform_ai_ops_alerts for all using (
  public.is_super_admin()
) with check (public.is_super_admin());

-- ── Helper: assert super admin ───────────────────────────────

create or replace function public.platform_ai_ops_assert_super_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Platform AI Operations requires super admin access';
  end if;
end;
$$;

-- ── KPI summary ──────────────────────────────────────────────

create or replace function public.platform_ai_ops_kpi_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_today_start timestamptz := date_trunc('day', now());
  v_result jsonb;
begin
  perform public.platform_ai_ops_assert_super_admin();

  select jsonb_build_object(
    'requestsToday', coalesce((
      select count(*)::int from public.ai_execution_analytics where recorded_at >= v_today_start
    ), 0) + coalesce((
      select count(*)::int from public.platform_ai_usage where recorded_at >= v_today_start
    ), 0),
    'successfulRequests', coalesce((
      select count(*)::int from public.ai_execution_analytics
      where recorded_at >= v_today_start and execution_status = 'succeeded'
    ), 0),
    'failedRequests', coalesce((
      select count(*)::int from public.ai_execution_analytics
      where recorded_at >= v_today_start and execution_status = 'failed'
    ), 0) + coalesce((
      select count(*)::int from public.runtime_executions
      where created_at >= v_today_start and execution_status = 'failed'
    ), 0),
    'avgLatencyMs', coalesce((
      select round(avg(latency_ms))::int from public.ai_execution_analytics
      where recorded_at >= v_today_start and latency_ms is not null
    ), 0),
    'avgTokens', coalesce((
      select round(avg(total_tokens))::int from public.ai_execution_analytics
      where recorded_at >= v_today_start
    ), 0),
    'estimatedCostUsd', coalesce((
      select round(sum(estimated_cost)::numeric, 4) from public.ai_execution_analytics
      where recorded_at >= v_today_start
    ), 0),
    'activeCompanies', coalesce((
      select count(distinct company_id)::int from public.ai_execution_analytics
      where recorded_at >= v_today_start
    ), 0),
    'backgroundTasks', coalesce((
      select count(*)::int from public.platform_ai_background_tasks
      where status in ('queued', 'running')
    ), 0)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.platform_ai_ops_kpi_summary() to authenticated;

-- ── Provider health ──────────────────────────────────────────

create or replace function public.platform_ai_ops_provider_health(p_provider_key text default 'openai')
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_window timestamptz := now() - interval '1 hour';
  v_total int;
  v_failed int;
  v_avg_latency int;
  v_last_error text;
  v_rate_429 int;
  v_queue int;
  v_status text;
begin
  perform public.platform_ai_ops_assert_super_admin();

  select count(*)::int,
         count(*) filter (where execution_status = 'failed')::int,
         round(avg(latency_ms))::int
  into v_total, v_failed, v_avg_latency
  from public.ai_execution_analytics
  where provider_key = p_provider_key and recorded_at >= v_window;

  select human_message into v_last_error
  from public.runtime_execution_errors re
  join public.runtime_executions e on e.id = re.execution_id
  where e.provider_key = p_provider_key
  order by re.created_at desc
  limit 1;

  select count(*)::int into v_rate_429
  from public.runtime_execution_errors re
  where re.error_code ilike '%429%' and re.created_at >= v_window;

  select count(*)::int into v_queue
  from public.runtime_executions
  where execution_status in ('queued', 'running');

  if v_total = 0 then
    v_status := 'unknown';
  elsif v_failed::numeric / greatest(v_total, 1) > 0.15 or v_rate_429 > 5 then
    v_status := 'red';
  elsif v_failed::numeric / greatest(v_total, 1) > 0.05 or v_avg_latency > 8000 then
    v_status := 'yellow';
  else
    v_status := 'green';
  end if;

  return jsonb_build_object(
    'providerKey', p_provider_key,
    'status', v_status,
    'latencyMs', coalesce(v_avg_latency, 0),
    'lastError', v_last_error,
    'successRate', case when v_total > 0 then round((1 - v_failed::numeric / v_total) * 100, 1) else 100 end,
    'rate429', v_rate_429,
    'rate5xx', coalesce((
      select count(*)::int from public.runtime_execution_errors
      where error_code ilike '%5%' and created_at >= v_window
    ), 0),
    'queueDepth', v_queue
  );
end;
$$;

grant execute on function public.platform_ai_ops_provider_health(text) to authenticated;

-- ── Request feed (paginated) ─────────────────────────────────

create or replace function public.platform_ai_ops_request_feed(
  p_limit int default 50,
  p_offset int default 0,
  p_search text default null
)
returns table (
  id uuid,
  recorded_at timestamptz,
  company_id uuid,
  company_name text,
  user_id uuid,
  module text,
  prompt_type text,
  conversation_id uuid,
  tool_calling boolean,
  knowledge_used boolean,
  automation_used boolean,
  model text,
  provider_key text,
  total_tokens int,
  latency_ms int,
  estimated_cost numeric,
  result_status text,
  correlation_id text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    a.id,
    a.recorded_at,
    a.company_id,
    c.name as company_name,
    null::uuid as user_id,
    coalesce(u.module, a.template_key, 'unknown') as module,
    coalesce(a.template_key, 'conversation') as prompt_type,
    a.conversation_id,
    false as tool_calling,
    (a.prompt_build_id is not null) as knowledge_used,
    false as automation_used,
    a.model,
    a.provider_key,
    a.total_tokens,
    a.latency_ms,
    a.estimated_cost,
    a.execution_status as result_status,
    a.correlation_id::text
  from public.ai_execution_analytics a
  join public.companies c on c.id = a.company_id
  left join lateral (
    select pu.module from public.platform_ai_usage pu
    where pu.execution_id = a.execution_id
    limit 1
  ) u on true
  where (
    p_search is null
    or c.name ilike '%' || p_search || '%'
    or a.model ilike '%' || p_search || '%'
    or a.correlation_id::text ilike '%' || p_search || '%'
    or a.conversation_id::text ilike '%' || p_search || '%'
  )
  order by a.recorded_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
end;
$$;

grant execute on function public.platform_ai_ops_request_feed(int, int, text) to authenticated;

-- ── Tool statistics ──────────────────────────────────────────

create or replace function public.platform_ai_ops_tool_stats()
returns table (
  tool_name text,
  call_count bigint,
  success_count bigint,
  failure_count bigint,
  avg_duration_ms numeric,
  error_rate numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    coalesce(s.metadata->>'tool_name', s.metadata->>'matched_tool', s.stage) as tool_name,
    count(*)::bigint as call_count,
    count(*) filter (where s.step_status = 'completed')::bigint as success_count,
    count(*) filter (where s.step_status = 'failed')::bigint as failure_count,
    round(avg(s.duration_ms)::numeric, 1) as avg_duration_ms,
    round(
      count(*) filter (where s.step_status = 'failed')::numeric / greatest(count(*), 1) * 100,
      1
    ) as error_rate
  from public.runtime_execution_steps s
  where s.stage in ('intent', 'execution', 'retrieval')
    and s.created_at >= now() - interval '7 days'
  group by 1
  order by call_count desc
  limit 20;
end;
$$;

grant execute on function public.platform_ai_ops_tool_stats() to authenticated;

-- ── Error groups ─────────────────────────────────────────────

create or replace function public.platform_ai_ops_error_groups(p_limit int default 25)
returns table (
  error_code text,
  error_category text,
  source_layer text,
  human_message text,
  first_seen timestamptz,
  last_seen timestamptz,
  occurrences bigint,
  affected_companies bigint,
  sample_correlation_id text,
  sample_stack text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    re.error_code,
    re.error_category,
    case
      when re.error_category ilike '%provider%' then 'OpenAI'
      when re.error_category ilike '%tool%' then 'Tool Router'
      when re.error_category ilike '%prompt%' then 'Prompt'
      when re.error_category ilike '%knowledge%' or re.error_category ilike '%retrieval%' then 'Knowledge'
      when re.error_category ilike '%automation%' then 'Automation'
      else 'Runtime'
    end as source_layer,
    min(re.human_message) as human_message,
    min(re.created_at) as first_seen,
    max(re.created_at) as last_seen,
    count(*)::bigint as occurrences,
    count(distinct e.company_id)::bigint as affected_companies,
    min(re.correlation_id) as sample_correlation_id,
    min(re.developer_message) as sample_stack
  from public.runtime_execution_errors re
  join public.runtime_executions e on e.id = re.execution_id
  group by re.error_code, re.error_category, source_layer
  order by last_seen desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.platform_ai_ops_error_groups(int) to authenticated;

-- ── Token / cost trends ──────────────────────────────────────

create or replace function public.platform_ai_ops_cost_trends(p_days int default 30)
returns table (
  day date,
  total_tokens bigint,
  estimated_cost numeric,
  request_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    date_trunc('day', a.recorded_at)::date as day,
    sum(a.total_tokens)::bigint,
    round(sum(a.estimated_cost)::numeric, 4),
    count(*)::bigint
  from public.ai_execution_analytics a
  where a.recorded_at >= now() - (p_days || ' days')::interval
  group by 1
  order by 1 asc;
end;
$$;

grant execute on function public.platform_ai_ops_cost_trends(int) to authenticated;

create or replace function public.platform_ai_ops_cost_by_company(p_limit int default 10)
returns table (
  company_id uuid,
  company_name text,
  total_tokens bigint,
  estimated_cost numeric,
  request_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    a.company_id,
    c.name,
    sum(a.total_tokens)::bigint,
    round(sum(a.estimated_cost)::numeric, 4),
    count(*)::bigint
  from public.ai_execution_analytics a
  join public.companies c on c.id = a.company_id
  where a.recorded_at >= now() - interval '30 days'
  group by a.company_id, c.name
  order by estimated_cost desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.platform_ai_ops_cost_by_company(int) to authenticated;

-- ── Feature flags matrix ─────────────────────────────────────

create or replace function public.platform_ai_ops_feature_matrix()
returns table (
  company_id uuid,
  company_name text,
  ai_chat boolean,
  tool_calling boolean,
  knowledge boolean,
  automation boolean,
  voice boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    c.id,
    c.name,
    coalesce(max(f.is_enabled) filter (where f.feature_key = 'ai_chat'), true),
    coalesce(max(f.is_enabled) filter (where f.feature_key = 'tool_calling'), true),
    coalesce(max(f.is_enabled) filter (where f.feature_key = 'knowledge'), true),
    coalesce(max(f.is_enabled) filter (where f.feature_key = 'automation'), true),
    coalesce(max(f.is_enabled) filter (where f.feature_key = 'voice'), false)
  from public.companies c
  left join public.platform_ai_feature_flags f on f.company_id = c.id
  group by c.id, c.name
  order by c.name asc;
end;
$$;

grant execute on function public.platform_ai_ops_feature_matrix() to authenticated;

-- ── Platform admin audit (AI-related) ──────────────────────────

create or replace function public.platform_ai_ops_admin_audit(p_limit int default 50)
returns table (
  id uuid,
  created_at timestamptz,
  action text,
  entity text,
  company_id uuid,
  user_id uuid,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    al.id,
    al.created_at,
    al.action,
    al.entity,
    al.company_id,
    al.user_id,
    al.metadata
  from public.audit_logs al
  where al.entity like '%platform_ai%'
     or al.entity like '%runtime%'
     or al.entity like '%ai_provider%'
     or al.entity like '%ai_execution%'
  order by al.created_at desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.platform_ai_ops_admin_audit(int) to authenticated;

-- ── Evaluate alerts (called by UI refresh) ───────────────────

create or replace function public.platform_ai_ops_evaluate_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health jsonb;
  v_kpis jsonb;
  v_new_alerts jsonb := '[]'::jsonb;
begin
  perform public.platform_ai_ops_assert_super_admin();

  v_health := public.platform_ai_ops_provider_health('openai');
  v_kpis := public.platform_ai_ops_kpi_summary();

  if (v_health->>'status') = 'red' then
    insert into public.platform_ai_ops_alerts(alert_type, severity, title, message, metadata)
    values ('provider_down', 'critical', 'AI provider degraded', 'OpenAI health is RED', v_health);
    v_new_alerts := v_new_alerts || jsonb_build_array('provider_down');
  end if;

  if (v_kpis->>'avgLatencyMs')::int > 10000 then
    insert into public.platform_ai_ops_alerts(alert_type, severity, title, message, metadata)
    values ('latency_spike', 'warning', 'High AI latency', 'Average latency exceeds 10s threshold', v_kpis);
    v_new_alerts := v_new_alerts || jsonb_build_array('latency_spike');
  end if;

  if (v_kpis->>'backgroundTasks')::int > 50 then
    insert into public.platform_ai_ops_alerts(alert_type, severity, title, message, metadata)
    values ('queue_backlog', 'warning', 'Task queue backlog', 'Background task queue exceeds 50', v_kpis);
    v_new_alerts := v_new_alerts || jsonb_build_array('queue_backlog');
  end if;

  return jsonb_build_object('triggered', v_new_alerts);
end;
$$;

grant execute on function public.platform_ai_ops_evaluate_alerts() to authenticated;
