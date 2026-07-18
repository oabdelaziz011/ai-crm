-- ============================================================
-- Vault OS – Billing Phase B analytics foundation
-- Architecture: enterprise-billing-platform-v2.1 §5, §20
-- ============================================================

create table if not exists public.financial_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  granularity text not null default 'daily'
    check (granularity in ('daily', 'monthly')),
  metrics jsonb not null default '{}'::jsonb,
  dimensions jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (snapshot_date, granularity)
);

create index if not exists idx_financial_analytics_snapshots_date
  on public.financial_analytics_snapshots(snapshot_date desc);

alter table public.financial_analytics_snapshots enable row level security;

drop policy if exists financial_analytics_snapshots_select on public.financial_analytics_snapshots;
create policy financial_analytics_snapshots_select on public.financial_analytics_snapshots for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or public.is_platform_billing_operator())
  );

drop policy if exists financial_analytics_snapshots_write on public.financial_analytics_snapshots;
create policy financial_analytics_snapshots_write on public.financial_analytics_snapshots for all
  using (false) with check (false);

create or replace function public.financial_compute_analytics_snapshot_v1(p_snapshot_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metrics jsonb;
  v_mrr numeric := 0;
  v_active bigint := 0;
  v_trialing bigint := 0;
  v_failed bigint := 0;
  v_paying bigint;
begin
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'Authentication required';
  end if;

  if auth.role() = 'authenticated' and not public.is_platform_billing_operator() then
    raise exception 'Insufficient permissions';
  end if;

  select
    coalesce(sum(case cs.billing_cycle
      when 'yearly' then coalesce(p.price_yearly, 0) / 12.0
      else coalesce(p.price_monthly, 0) end), 0),
    count(*) filter (where cs.status = 'active'),
    count(*) filter (where cs.status = 'trialing')
  into v_mrr, v_active, v_trialing
  from public.company_subscriptions cs
  left join public.plans p on p.id = cs.plan_id
  where cs.status in ('active', 'trialing', 'past_due', 'grace_period');

  select count(*) into v_failed
  from public.billing_payments bp
  where bp.status = 'failed'
    and bp.created_at > now() - interval '30 days';

  v_paying := v_active;

  v_metrics := jsonb_build_object(
    'schema_version', 1,
    'mrr', v_mrr,
    'arr', round(v_mrr * 12, 2),
    'arpu', case when v_paying > 0 then round(v_mrr / v_paying, 2) else 0 end,
    'ltv_estimate', null,
    'logo_churn_rate', null,
    'revenue_churn_rate', null,
    'renewal_rate', null,
    'failed_payment_rate', case when v_paying + v_trialing > 0
      then round(v_failed::numeric / (v_paying + v_trialing) * 100, 2) else 0 end,
    'collection_rate', null,
    'active_subscriptions', v_paying,
    'trialing_subscriptions', v_trialing,
    'failed_payments_30d', v_failed
  );

  insert into public.financial_analytics_snapshots (snapshot_date, granularity, metrics, computed_at)
  values (coalesce(p_snapshot_date, current_date), 'daily', v_metrics, now())
  on conflict (snapshot_date, granularity) do update
    set metrics = excluded.metrics, computed_at = excluded.computed_at;

  return v_metrics;
end;
$$;

revoke all on function public.financial_compute_analytics_snapshot_v1(date) from public;
grant execute on function public.financial_compute_analytics_snapshot_v1(date) to authenticated;
grant execute on function public.financial_compute_analytics_snapshot_v1(date) to service_role;
