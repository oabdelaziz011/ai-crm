-- ============================================================
-- 299 — Company Feature Groups: feature_definition → permissions
--
-- Reuses feature_definitions + company_feature_overrides as the
-- company capability assignment SoT. Adds only a mapping table
-- from commercial feature codes to existing atomic permissions.
--
-- Does NOT replace RBAC or commercial entitlements.
-- Does NOT delete existing overrides, roles, or permissions.
-- Strengthens delegation: non-Super-Admin grants require the
-- permission to be available via an enabled company feature.
-- ============================================================

create table if not exists public.feature_definition_permissions (
  feature_code text not null
    references public.feature_definitions (code) on delete cascade,
  permission_code text not null
    references public.permissions (code) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (feature_code, permission_code)
);

create index if not exists idx_feature_definition_permissions_permission
  on public.feature_definition_permissions (permission_code)
  where is_active = true;

comment on table public.feature_definition_permissions is
  'Maps commercial feature_definitions.code (company capability groups) to atomic RBAC permission codes. Groups are not themselves authorization permissions.';

alter table public.feature_definition_permissions enable row level security;

drop policy if exists feature_definition_permissions_select on public.feature_definition_permissions;
create policy feature_definition_permissions_select
  on public.feature_definition_permissions
  for select
  to authenticated
  using (true);

drop policy if exists feature_definition_permissions_write_super_admin on public.feature_definition_permissions;
create policy feature_definition_permissions_write_super_admin
  on public.feature_definition_permissions
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select on public.feature_definition_permissions to authenticated;
grant select, insert, update, delete on public.feature_definition_permissions to service_role;

insert into public.feature_definition_permissions (feature_code, permission_code)
values
  ('customers', 'customers.create'),
  ('customers', 'customers.delete'),
  ('customers', 'customers.edit'),
  ('customers', 'customers.import'),
  ('customers', 'customers.merge'),
  ('customers', 'customers.search'),
  ('customers', 'customers.update'),
  ('customers', 'customers.view'),
  ('customers', 'entity.contacts.delete'),
  ('customers', 'entity.contacts.read'),
  ('customers', 'entity.contacts.write'),
  ('leads', 'leads.archive'),
  ('leads', 'leads.assign'),
  ('leads', 'leads.convert'),
  ('leads', 'leads.create'),
  ('leads', 'leads.delete'),
  ('leads', 'leads.edit'),
  ('leads', 'leads.export'),
  ('leads', 'leads.manage'),
  ('leads', 'leads.merge'),
  ('leads', 'leads.pipeline.manage'),
  ('leads', 'leads.qualify'),
  ('leads', 'leads.view'),
  ('opportunities', 'opportunities.convert'),
  ('opportunities', 'opportunities.create'),
  ('opportunities', 'opportunities.delete'),
  ('opportunities', 'opportunities.edit'),
  ('opportunities', 'opportunities.view'),
  ('opportunities', 'products.create'),
  ('opportunities', 'products.delete'),
  ('opportunities', 'products.edit'),
  ('opportunities', 'products.pricing'),
  ('opportunities', 'products.view'),
  ('opportunities', 'quotes.approve'),
  ('opportunities', 'quotes.create'),
  ('opportunities', 'quotes.delete'),
  ('opportunities', 'quotes.edit'),
  ('opportunities', 'quotes.send'),
  ('opportunities', 'quotes.view'),
  ('bookings', 'availability.search'),
  ('bookings', 'bookings.create'),
  ('bookings', 'bookings.delete'),
  ('bookings', 'bookings.edit'),
  ('bookings', 'bookings.view'),
  ('bookings', 'scheduling.edit'),
  ('bookings', 'scheduling.view'),
  ('operations', 'branches.manage'),
  ('operations', 'collections.manage'),
  ('operations', 'departments.manage'),
  ('operations', 'employees.manage'),
  ('operations', 'entity.activities.read'),
  ('operations', 'entity.activities.write'),
  ('operations', 'entity.contacts.delete'),
  ('operations', 'entity.contacts.read'),
  ('operations', 'entity.contacts.write'),
  ('operations', 'entity.custom_fields.read'),
  ('operations', 'entity.custom_fields.write'),
  ('operations', 'entity.files.delete'),
  ('operations', 'entity.files.read'),
  ('operations', 'entity.files.write'),
  ('operations', 'entity.tags.read'),
  ('operations', 'entity.tags.write'),
  ('operations', 'executive.manage_alerts'),
  ('operations', 'executive.view'),
  ('operations', 'operations.configuration.manage'),
  ('operations', 'operations.queue.checkin'),
  ('operations', 'operations.queue.complete'),
  ('operations', 'operations.read'),
  ('operations', 'operations.universal.configure'),
  ('operations', 'operations.write'),
  ('operations', 'organization.manage'),
  ('operations', 'organization.transfer'),
  ('operations', 'organization.transfer.approve'),
  ('operations', 'organization.view'),
  ('operations', 'tasks.assign'),
  ('operations', 'tasks.read'),
  ('operations', 'tasks.write'),
  ('ticketing', 'tickets.assign'),
  ('ticketing', 'tickets.close'),
  ('ticketing', 'tickets.comment'),
  ('ticketing', 'tickets.create'),
  ('ticketing', 'tickets.edit'),
  ('ticketing', 'tickets.manage'),
  ('ticketing', 'tickets.view'),
  ('ai_employee', 'agents.create'),
  ('ai_employee', 'agents.delete'),
  ('ai_employee', 'agents.edit'),
  ('ai_employee', 'agents.execute'),
  ('ai_employee', 'agents.manage'),
  ('ai_employee', 'agents.publish'),
  ('ai_employee', 'agents.rollback'),
  ('ai_employee', 'agents.view'),
  ('ai_employee', 'ai.execution.manage'),
  ('ai_employee', 'ai.execution.view'),
  ('ai_employee', 'ai.knowledge.manage'),
  ('ai_employee', 'ai.providers.manage'),
  ('ai_employee', 'ai.providers.view'),
  ('ai_employee', 'configuration.ai.read'),
  ('ai_employee', 'configuration.ai.write'),
  ('ai_employee', 'embeddings.generate'),
  ('ai_employee', 'embeddings.manage'),
  ('ai_employee', 'embeddings.view'),
  ('ai_employee', 'intents.manage'),
  ('ai_employee', 'intents.view'),
  ('ai_employee', 'knowledge.import'),
  ('ai_employee', 'knowledge.manage'),
  ('ai_employee', 'knowledge.publish'),
  ('ai_employee', 'knowledge.read'),
  ('ai_employee', 'knowledge.view'),
  ('ai_employee', 'prompts.manage'),
  ('ai_employee', 'prompts.preview'),
  ('ai_employee', 'prompts.publish'),
  ('ai_employee', 'prompts.rollback'),
  ('ai_employee', 'prompts.view'),
  ('ai_employee', 'retrieval.execute'),
  ('ai_employee', 'retrieval.manage'),
  ('ai_employee', 'retrieval.view'),
  ('ai_employee', 'runtime.execute'),
  ('ai_employee', 'runtime.manage'),
  ('ai_employee', 'runtime.view'),
  ('ai_employee', 'skills.create'),
  ('ai_employee', 'skills.edit'),
  ('ai_employee', 'skills.manage'),
  ('ai_employee', 'skills.publish'),
  ('ai_employee', 'skills.rollback'),
  ('ai_employee', 'skills.view'),
  ('ai_employee', 'tools.execute'),
  ('ai_employee', 'tools.manage'),
  ('ai_employee', 'tools.view'),
  ('ai_employee', 'vectorquery.execute'),
  ('ai_employee', 'vectorquery.manage'),
  ('ai_employee', 'vectorquery.view'),
  ('ai_employee', 'vectorstores.manage'),
  ('ai_employee', 'vectorstores.view'),
  ('ai_assistant', 'ai_assistant.edit'),
  ('ai_assistant', 'ai_assistant.view'),
  ('ai_assistant', 'ai_chat.use'),
  ('ai_assistant', 'ai_chat.view'),
  ('ai_assistant', 'ai-chat.view'),
  ('ai_assistant', 'ai.conversations.release'),
  ('ai_assistant', 'ai.conversations.reply'),
  ('ai_assistant', 'ai.conversations.takeover'),
  ('ai_assistant', 'ai.conversations.view'),
  ('whatsapp_channel', 'ai.whatsapp.manage'),
  ('whatsapp_channel', 'whatsapp.run'),
  ('whatsapp_channel', 'whatsapp.view'),
  ('omnichannel', 'channel.platform.dispatch'),
  ('omnichannel', 'channel.platform.route'),
  ('omnichannel', 'channel.platform.view'),
  ('omnichannel', 'channels.manage'),
  ('omnichannel', 'channels.view'),
  ('omnichannel', 'collaboration.handover'),
  ('omnichannel', 'collaboration.manage'),
  ('omnichannel', 'collaboration.view'),
  ('omnichannel', 'conversation.assign'),
  ('omnichannel', 'conversation.close'),
  ('omnichannel', 'conversation.create_customer'),
  ('omnichannel', 'conversation.escalate'),
  ('omnichannel', 'conversation.internal_note'),
  ('omnichannel', 'conversation.internal_notes.manage'),
  ('omnichannel', 'conversation.link_customer'),
  ('omnichannel', 'conversation.reassign'),
  ('omnichannel', 'conversation.reopen'),
  ('omnichannel', 'conversation.reply'),
  ('omnichannel', 'conversation.resolve'),
  ('omnichannel', 'conversation.return_to_ai'),
  ('omnichannel', 'conversation.take_over'),
  ('omnichannel', 'conversation.view'),
  ('omnichannel', 'handoff.accept'),
  ('omnichannel', 'handoff.assign'),
  ('omnichannel', 'handoff.escalate'),
  ('omnichannel', 'handoff.manage'),
  ('omnichannel', 'handoff.presence'),
  ('omnichannel', 'handoff.queue'),
  ('omnichannel', 'handoff.reject'),
  ('omnichannel', 'handoff.return_to_ai'),
  ('omnichannel', 'handoff.transfer'),
  ('omnichannel', 'handoff.view'),
  ('workflow_automation', 'automation.archive'),
  ('workflow_automation', 'automation.create'),
  ('workflow_automation', 'automation.delete'),
  ('workflow_automation', 'automation.edit'),
  ('workflow_automation', 'automation.execute'),
  ('workflow_automation', 'automation.publish'),
  ('workflow_automation', 'automation.rollback'),
  ('workflow_automation', 'automation.simulate'),
  ('workflow_automation', 'automation.view'),
  ('workflow_automation', 'workflow.execute'),
  ('workflow_automation', 'workflow.read'),
  ('basic_reports', 'dashboard.view'),
  ('basic_reports', 'reports.view'),
  ('advanced_reports', 'ai.analytics.manage'),
  ('advanced_reports', 'ai.analytics.view'),
  ('advanced_reports', 'ai.costs.view'),
  ('advanced_reports', 'reports.ai_consumption'),
  ('advanced_reports', 'reports.ai_operations'),
  ('advanced_reports', 'reports.bookings'),
  ('advanced_reports', 'reports.companies'),
  ('advanced_reports', 'reports.company_revenue'),
  ('advanced_reports', 'reports.customers'),
  ('advanced_reports', 'reports.executive'),
  ('advanced_reports', 'reports.export'),
  ('advanced_reports', 'reports.financial'),
  ('advanced_reports', 'reports.invoices'),
  ('advanced_reports', 'reports.leads'),
  ('advanced_reports', 'reports.operations'),
  ('advanced_reports', 'reports.opportunities'),
  ('advanced_reports', 'reports.overview'),
  ('advanced_reports', 'reports.products'),
  ('advanced_reports', 'reports.quotes'),
  ('advanced_reports', 'reports.schedule'),
  ('advanced_reports', 'reports.subscriptions'),
  ('advanced_reports', 'reports.tickets'),
  ('advanced_reports', 'reports.view'),
  ('api_access', 'integrations.api_keys'),
  ('api_access', 'integrations.manage'),
  ('api_access', 'integrations.view'),
  ('api_access', 'integrations.webhooks'),
  ('api_access', 'marketplace.develop'),
  ('api_access', 'marketplace.install'),
  ('api_access', 'marketplace.manage'),
  ('api_access', 'marketplace.view'),
  ('core_crm', 'audit_logs.view'),
  ('core_crm', 'billing.audit.export'),
  ('core_crm', 'billing.audit.view'),
  ('core_crm', 'billing.contact.edit_own'),
  ('core_crm', 'billing.documents.download_own'),
  ('core_crm', 'billing.edit'),
  ('core_crm', 'billing.features.edit'),
  ('core_crm', 'billing.features.manage_catalog'),
  ('core_crm', 'billing.features.view'),
  ('core_crm', 'billing.health.manage'),
  ('core_crm', 'billing.health.view'),
  ('core_crm', 'billing.manage_own'),
  ('core_crm', 'billing.manage_plans'),
  ('core_crm', 'billing.payment_method.manage_own'),
  ('core_crm', 'billing.record_payment'),
  ('core_crm', 'billing.settings.edit'),
  ('core_crm', 'billing.settings.view'),
  ('core_crm', 'billing.view'),
  ('core_crm', 'billing.view_own'),
  ('core_crm', 'billing.view_reports'),
  ('core_crm', 'billing.webhooks.manage'),
  ('core_crm', 'billing.webhooks.view'),
  ('core_crm', 'companies.create'),
  ('core_crm', 'companies.delete'),
  ('core_crm', 'companies.edit'),
  ('core_crm', 'companies.view'),
  ('core_crm', 'company.branding'),
  ('core_crm', 'company.subscription'),
  ('core_crm', 'company.update'),
  ('core_crm', 'company.view'),
  ('core_crm', 'configuration.ai.read'),
  ('core_crm', 'configuration.ai.write'),
  ('core_crm', 'configuration.billing.read'),
  ('core_crm', 'configuration.billing.write'),
  ('core_crm', 'configuration.crm.read'),
  ('core_crm', 'configuration.crm.write'),
  ('core_crm', 'configuration.dashboard.read'),
  ('core_crm', 'configuration.dashboard.write'),
  ('core_crm', 'configuration.notifications.read'),
  ('core_crm', 'configuration.notifications.write'),
  ('core_crm', 'configuration.operations.read'),
  ('core_crm', 'configuration.operations.write'),
  ('core_crm', 'configuration.publish'),
  ('core_crm', 'configuration.read'),
  ('core_crm', 'configuration.workspace.read'),
  ('core_crm', 'configuration.workspace.write'),
  ('core_crm', 'configuration.write'),
  ('core_crm', 'feature_flags.publish'),
  ('core_crm', 'feature_flags.read'),
  ('core_crm', 'feature_flags.write'),
  ('core_crm', 'governance.approve'),
  ('core_crm', 'governance.create'),
  ('core_crm', 'governance.edit'),
  ('core_crm', 'governance.manage'),
  ('core_crm', 'governance.view'),
  ('core_crm', 'invoices.create'),
  ('core_crm', 'invoices.delete'),
  ('core_crm', 'invoices.edit'),
  ('core_crm', 'invoices.view'),
  ('core_crm', 'licenses.assign'),
  ('core_crm', 'licenses.read'),
  ('core_crm', 'licenses.write'),
  ('core_crm', 'permissions.edit'),
  ('core_crm', 'permissions.view'),
  ('core_crm', 'roles.create'),
  ('core_crm', 'roles.delete'),
  ('core_crm', 'roles.edit'),
  ('core_crm', 'roles.view'),
  ('core_crm', 'settings.edit'),
  ('core_crm', 'settings.view'),
  ('core_crm', 'subscriptions.edit'),
  ('core_crm', 'subscriptions.view'),
  ('core_crm', 'users.create'),
  ('core_crm', 'users.delete'),
  ('core_crm', 'users.edit'),
  ('core_crm', 'users.view'),
  ('core_crm', 'workspace.view')
on conflict (feature_code, permission_code) do update
set is_active = true;

-- True when the permission is available to the company via commercial entitlements.
-- Unmapped permissions remain available (fail-open). Super Admin always true.
create or replace function public.permission_available_to_company(
  p_company_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      p_company_id is not null
      and nullif(trim(p_permission_code), '') is not null
      and (
        not exists (
          select 1
          from public.feature_definition_permissions fdp
          where fdp.permission_code = p_permission_code
            and fdp.is_active = true
        )
        or exists (
          select 1
          from public.feature_definition_permissions fdp
          where fdp.permission_code = p_permission_code
            and fdp.is_active = true
            and public.is_feature_enabled(p_company_id, fdp.feature_code)
        )
      )
    );
$$;

comment on function public.permission_available_to_company(uuid, text) is
  'Company capability gate for a permission code. Mapped permissions require at least one enabled feature_definitions grant via is_feature_enabled.';

revoke all on function public.permission_available_to_company(uuid, text) from public;
grant execute on function public.permission_available_to_company(uuid, text) to authenticated, service_role;

-- List atomic permissions included in a feature group (catalog transparency).
create or replace function public.get_feature_definition_permission_codes(p_feature_code text)
returns table (permission_code text)
language sql
stable
security definer
set search_path = public
as $$
  select fdp.permission_code
  from public.feature_definition_permissions fdp
  where fdp.feature_code = p_feature_code
    and fdp.is_active = true
  order by fdp.permission_code;
$$;

revoke all on function public.get_feature_definition_permission_codes(text) from public;
grant execute on function public.get_feature_definition_permission_codes(text) to authenticated, service_role;

-- Strengthen delegation helpers: must hold permission AND company capability.
create or replace function public.actor_can_delegate_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      nullif(trim(p_code), '') is not null
      and public.user_has_permission(p_code)
      and public.permission_available_to_company(public.current_company_id(), p_code)
    );
$$;

create or replace function public.actor_can_delegate_permission_id(p_permission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.permissions p
      where p.id = p_permission_id
        and public.user_has_permission(p.code)
        and public.permission_available_to_company(public.current_company_id(), p.code)
    );
$$;
