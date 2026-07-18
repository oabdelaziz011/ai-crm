-- ============================================================
-- Vault OS – RBAC AI platform RLS bulk completion
-- Applies company_has_permission to remaining AI platform tables
-- ============================================================

-- Macro-style updates for company-scoped AI tables

-- AI Executions (019)
drop policy if exists ai_executions_select on public.ai_executions;
create policy ai_executions_select on public.ai_executions for select using (
  public.company_has_permission(company_id, 'ai.execution.view')
);
drop policy if exists ai_executions_insert on public.ai_executions;
create policy ai_executions_insert on public.ai_executions for insert with check (
  public.company_has_permission(company_id, 'ai.execution.manage')
);
drop policy if exists ai_executions_update on public.ai_executions;
create policy ai_executions_update on public.ai_executions for update
using (public.company_has_permission(company_id, 'ai.execution.manage'))
with check (public.company_has_permission(company_id, 'ai.execution.manage'));

-- AI Provider connections (017)
drop policy if exists ai_provider_connections_select on public.ai_provider_connections;
create policy ai_provider_connections_select on public.ai_provider_connections for select using (
  public.company_has_permission(company_id, 'ai.providers.view')
);
drop policy if exists ai_provider_connections_insert on public.ai_provider_connections;
create policy ai_provider_connections_insert on public.ai_provider_connections for insert with check (
  public.company_has_permission(company_id, 'ai.providers.manage')
);
drop policy if exists ai_provider_connections_update on public.ai_provider_connections;
create policy ai_provider_connections_update on public.ai_provider_connections for update
using (public.company_has_permission(company_id, 'ai.providers.manage'))
with check (public.company_has_permission(company_id, 'ai.providers.manage'));

-- Runtime (027)
drop policy if exists runtime_sessions_select on public.runtime_sessions;
create policy runtime_sessions_select on public.runtime_sessions for select using (
  public.company_has_permission(company_id, 'runtime.view')
);
drop policy if exists runtime_sessions_insert on public.runtime_sessions;
create policy runtime_sessions_insert on public.runtime_sessions for insert with check (
  public.company_has_permission(company_id, 'runtime.execute')
);
drop policy if exists runtime_sessions_update on public.runtime_sessions;
create policy runtime_sessions_update on public.runtime_sessions for update
using (public.company_has_permission(company_id, 'runtime.execute'))
with check (public.company_has_permission(company_id, 'runtime.execute'));

drop policy if exists runtime_executions_select on public.runtime_executions;
create policy runtime_executions_select on public.runtime_executions for select using (
  public.company_has_permission(company_id, 'runtime.view')
);
drop policy if exists runtime_executions_insert on public.runtime_executions;
create policy runtime_executions_insert on public.runtime_executions for insert with check (
  public.company_has_permission(company_id, 'runtime.execute')
);
drop policy if exists runtime_executions_update on public.runtime_executions;
create policy runtime_executions_update on public.runtime_executions for update
using (public.company_has_permission(company_id, 'runtime.execute'))
with check (public.company_has_permission(company_id, 'runtime.execute'));

-- Knowledge chunks (021)
drop policy if exists knowledge_chunks_select on public.knowledge_chunks;
create policy knowledge_chunks_select on public.knowledge_chunks for select using (
  exists (
    select 1 from public.knowledge_documents kd
    join public.knowledge_sources ks on ks.id = kd.source_id
    where kd.id = knowledge_chunks.document_id
      and public.company_has_permission(ks.company_id, 'knowledge.view')
  )
);
drop policy if exists knowledge_chunks_insert on public.knowledge_chunks;
create policy knowledge_chunks_insert on public.knowledge_chunks for insert with check (
  exists (
    select 1 from public.knowledge_documents kd
    join public.knowledge_sources ks on ks.id = kd.source_id
    where kd.id = knowledge_chunks.document_id
      and public.company_has_permission(ks.company_id, 'knowledge.import')
  )
);
drop policy if exists knowledge_chunks_update on public.knowledge_chunks;
create policy knowledge_chunks_update on public.knowledge_chunks for update
using (
  exists (
    select 1 from public.knowledge_documents kd
    join public.knowledge_sources ks on ks.id = kd.source_id
    where kd.id = knowledge_chunks.document_id
      and public.company_has_permission(ks.company_id, 'knowledge.manage')
  )
)
with check (
  exists (
    select 1 from public.knowledge_documents kd
    join public.knowledge_sources ks on ks.id = kd.source_id
    where kd.id = knowledge_chunks.document_id
      and public.company_has_permission(ks.company_id, 'knowledge.manage')
  )
);

-- Channel registry sessions (013) — company_channels already in 111

-- Webhook events (billing)
drop policy if exists webhook_events_select on public.webhook_events;
create policy webhook_events_select on public.webhook_events for select using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('billing.webhooks.view'))
);

drop policy if exists webhook_events_insert on public.webhook_events;
create policy webhook_events_insert on public.webhook_events for insert with check (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('billing.webhooks.manage'))
);

drop policy if exists webhook_events_update on public.webhook_events;
create policy webhook_events_update on public.webhook_events for update
using (auth.role() = 'authenticated' and (public.is_super_admin() or public.user_has_permission('billing.webhooks.manage')))
with check (auth.role() = 'authenticated' and (public.is_super_admin() or public.user_has_permission('billing.webhooks.manage')));

drop policy if exists webhook_events_delete on public.webhook_events;
create policy webhook_events_delete on public.webhook_events for delete using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('billing.webhooks.manage'))
);

-- Financial analytics / health snapshots
drop policy if exists financial_analytics_snapshots_select on public.financial_analytics_snapshots;
create policy financial_analytics_snapshots_select on public.financial_analytics_snapshots for select using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('billing.view_reports'))
);

drop policy if exists payment_provider_health_snapshots_select on public.payment_provider_health_snapshots;
create policy payment_provider_health_snapshots_select on public.payment_provider_health_snapshots for select using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('billing.health.view'))
);

-- Billing profiles (workspace)
drop policy if exists company_billing_profiles_select on public.company_billing_profiles;
create policy company_billing_profiles_select on public.company_billing_profiles for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('billing.view')
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.view_own')
    )
  )
);

drop policy if exists company_billing_profiles_update on public.company_billing_profiles;
create policy company_billing_profiles_update on public.company_billing_profiles for update
using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('billing.edit')
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.contact.edit_own')
    )
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('billing.edit')
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.contact.edit_own')
    )
  )
);

-- Receipts/invoices download own (via billing_invoices already has can_view_billing_company)
-- Grant billing.documents.download_own to employee roles in 112 already for workspace
