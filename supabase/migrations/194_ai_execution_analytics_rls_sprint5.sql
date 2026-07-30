-- Sprint 5: AI Analytics — align ai_execution_analytics SELECT RLS with ai_traces (permission-based).

drop policy if exists ai_execution_analytics_select on public.ai_execution_analytics;
create policy ai_execution_analytics_select on public.ai_execution_analytics for select using (
  public.company_has_permission(company_id, 'ai.analytics.view')
);

comment on policy ai_execution_analytics_select on public.ai_execution_analytics is
  'Tenant analytics reads require ai.analytics.view (Sprint 5). Inserts unchanged.';
