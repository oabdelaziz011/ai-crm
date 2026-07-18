-- ============================================================
-- Vault OS – RBAC RLS completion + permission aliases
-- Replaces is_company_admin() role-name checks with permission codes
-- ============================================================

-- ── Permission alias resolution (no new codes) ──────────────

create or replace function public.resolve_permission_code(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when 'users.create' then 'users.edit'
    when 'users.delete' then 'users.edit'
    when 'ai-chat.view' then 'ai_chat.view'
    when 'ai.knowledge.manage' then 'knowledge.manage'
    when 'ai.whatsapp.manage' then 'channels.manage'
    when 'whatsapp.run' then 'whatsapp.view'
    when 'permissions.view' then 'roles.view'
    when 'permissions.edit' then 'roles.edit'
    else p_code
  end;
$$;

create or replace function public.user_has_permission(p_code text)
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
      from public.user_permissions up
      join public.permissions p on p.id = up.permission_id
      where up.user_id = auth.uid()
        and p.code = public.resolve_permission_code(p_code)
    )
    or exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = auth.uid()
        and p.code = public.resolve_permission_code(p_code)
    );
$$;

grant execute on function public.resolve_permission_code(text) to authenticated;
grant execute on function public.user_has_permission(text) to authenticated;

-- Mark deprecated permission descriptions (codes retained for migration safety)
update public.permissions set
  description = coalesce(description, '') || ' [DEPRECATED: use ' ||
    case code
      when 'ai-chat.view' then 'ai_chat.view]'
      when 'ai.knowledge.manage' then 'knowledge.manage]'
      when 'ai.whatsapp.manage' then 'channels.manage]'
      when 'whatsapp.run' then 'whatsapp.view]'
      when 'users.create' then 'users.edit]'
      when 'users.delete' then 'users.edit]'
      when 'permissions.view' then 'roles.view]'
      when 'permissions.edit' then 'roles.edit]'
      else code || ']'
    end,
  updated_at = now()
where code in (
  'ai-chat.view', 'ai.knowledge.manage', 'ai.whatsapp.manage', 'whatsapp.run',
  'users.create', 'users.delete', 'permissions.view', 'permissions.edit'
)
and description not like '%[DEPRECATED:%';

-- ── Shared helpers ──────────────────────────────────────────

create or replace function public.company_has_permission(p_company_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        p_company_id is not null
        and p_company_id = public.current_company_id()
        and public.user_has_permission(p_permission)
      )
    );
$$;

create or replace function public.crm_same_company(p_owner_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles owner_p
    inner join public.profiles me on me.id = auth.uid()
    where owner_p.user_id = p_owner_user_id
      and owner_p.company_id is not null
      and me.company_id is not null
      and owner_p.company_id = me.company_id
  );
$$;

grant execute on function public.company_has_permission(uuid, text) to authenticated;
grant execute on function public.crm_same_company(uuid) to authenticated;

-- ── CRM ─────────────────────────────────────────────────────

drop policy if exists customers_owner_select on public.customers;
create policy customers_owner_select on public.customers for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or user_id = auth.uid()
    or (public.user_has_permission('customers.view') and public.crm_same_company(user_id))
  )
);

drop policy if exists customers_owner_insert on public.customers;
create policy customers_owner_insert on public.customers for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (public.user_has_permission('customers.create') and user_id = auth.uid())
  )
);

drop policy if exists customers_owner_update on public.customers;
create policy customers_owner_update on public.customers for update
using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (user_id = auth.uid() and public.user_has_permission('customers.edit'))
    or (public.user_has_permission('customers.edit') and public.crm_same_company(user_id))
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (user_id = auth.uid() and public.user_has_permission('customers.edit'))
    or (public.user_has_permission('customers.edit') and public.crm_same_company(user_id))
  )
);

drop policy if exists customers_owner_delete on public.customers;
create policy customers_owner_delete on public.customers for delete using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (user_id = auth.uid() and public.user_has_permission('customers.delete'))
    or (public.user_has_permission('customers.delete') and public.crm_same_company(user_id))
  )
);

drop policy if exists bookings_owner_select on public.bookings;
create policy bookings_owner_select on public.bookings for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or user_id = auth.uid()
    or (public.user_has_permission('bookings.view') and public.crm_same_company(user_id))
  )
);

drop policy if exists bookings_owner_insert on public.bookings;
create policy bookings_owner_insert on public.bookings for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (public.user_has_permission('bookings.create') and user_id = auth.uid())
  )
);

drop policy if exists bookings_owner_update on public.bookings;
create policy bookings_owner_update on public.bookings for update
using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (user_id = auth.uid() and public.user_has_permission('bookings.edit'))
    or (public.user_has_permission('bookings.edit') and public.crm_same_company(user_id))
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (user_id = auth.uid() and public.user_has_permission('bookings.edit'))
    or (public.user_has_permission('bookings.edit') and public.crm_same_company(user_id))
  )
);

drop policy if exists bookings_owner_delete on public.bookings;
create policy bookings_owner_delete on public.bookings for delete using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (user_id = auth.uid() and public.user_has_permission('bookings.delete'))
    or (public.user_has_permission('bookings.delete') and public.crm_same_company(user_id))
  )
);

drop policy if exists invoices_owner_select on public.invoices;
create policy invoices_owner_select on public.invoices for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or user_id = auth.uid()
    or (public.user_has_permission('invoices.view') and public.crm_same_company(user_id))
  )
);

drop policy if exists invoices_owner_insert on public.invoices;
create policy invoices_owner_insert on public.invoices for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (public.user_has_permission('invoices.create') and user_id = auth.uid())
  )
);

drop policy if exists invoices_owner_update on public.invoices;
create policy invoices_owner_update on public.invoices for update
using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (user_id = auth.uid() and public.user_has_permission('invoices.edit'))
    or (public.user_has_permission('invoices.edit') and public.crm_same_company(user_id))
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (user_id = auth.uid() and public.user_has_permission('invoices.edit'))
    or (public.user_has_permission('invoices.edit') and public.crm_same_company(user_id))
  )
);

drop policy if exists invoices_owner_delete on public.invoices;
create policy invoices_owner_delete on public.invoices for delete using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (user_id = auth.uid() and public.user_has_permission('invoices.delete'))
    or (public.user_has_permission('invoices.delete') and public.crm_same_company(user_id))
  )
);

-- ── Companies ───────────────────────────────────────────────

drop policy if exists companies_super_admin_select on public.companies;
create policy companies_super_admin_select on public.companies for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('companies.view')
  )
);

drop policy if exists companies_super_admin_insert on public.companies;
create policy companies_super_admin_insert on public.companies for insert with check (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('companies.create'))
);

drop policy if exists companies_super_admin_update on public.companies;
create policy companies_super_admin_update on public.companies for update
using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('companies.edit'))
)
with check (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('companies.edit'))
);

drop policy if exists companies_super_admin_delete on public.companies;
create policy companies_super_admin_delete on public.companies for delete using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('companies.delete'))
);

-- companies_member_select unchanged (own company context)

-- ── AI Assistant Settings ───────────────────────────────────

drop policy if exists ai_assistant_settings_select on public.ai_assistant_settings;
create policy ai_assistant_settings_select on public.ai_assistant_settings for select using (
  public.company_has_permission(company_id, 'ai_assistant.view')
);

drop policy if exists ai_assistant_settings_insert on public.ai_assistant_settings;
create policy ai_assistant_settings_insert on public.ai_assistant_settings for insert with check (
  public.company_has_permission(company_id, 'ai_assistant.edit')
);

drop policy if exists ai_assistant_settings_update on public.ai_assistant_settings;
create policy ai_assistant_settings_update on public.ai_assistant_settings for update
using (public.company_has_permission(company_id, 'ai_assistant.edit'))
with check (public.company_has_permission(company_id, 'ai_assistant.edit'));

-- ── Conversations ───────────────────────────────────────────

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select using (
  public.company_has_permission(company_id, 'ai.conversations.view')
);

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations for insert with check (
  public.company_has_permission(company_id, 'ai.conversations.reply')
);

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations for update
using (public.company_has_permission(company_id, 'ai.conversations.reply'))
with check (public.company_has_permission(company_id, 'ai.conversations.reply'));

-- ── Knowledge ─────────────────────────────────────────────────

drop policy if exists knowledge_sources_select on public.knowledge_sources;
create policy knowledge_sources_select on public.knowledge_sources for select using (
  public.company_has_permission(company_id, 'knowledge.view')
);

drop policy if exists knowledge_sources_insert on public.knowledge_sources;
create policy knowledge_sources_insert on public.knowledge_sources for insert with check (
  public.company_has_permission(company_id, 'knowledge.manage')
);

drop policy if exists knowledge_sources_update on public.knowledge_sources;
create policy knowledge_sources_update on public.knowledge_sources for update
using (public.company_has_permission(company_id, 'knowledge.manage'))
with check (public.company_has_permission(company_id, 'knowledge.manage'));

drop policy if exists knowledge_documents_select on public.knowledge_documents;
create policy knowledge_documents_select on public.knowledge_documents for select using (
  exists (
    select 1 from public.knowledge_sources ks
    where ks.id = knowledge_documents.source_id
      and public.company_has_permission(ks.company_id, 'knowledge.view')
  )
);

drop policy if exists knowledge_documents_insert on public.knowledge_documents;
create policy knowledge_documents_insert on public.knowledge_documents for insert with check (
  exists (
    select 1 from public.knowledge_sources ks
    where ks.id = knowledge_documents.source_id
      and public.company_has_permission(ks.company_id, 'knowledge.manage')
  )
);

drop policy if exists knowledge_documents_update on public.knowledge_documents;
create policy knowledge_documents_update on public.knowledge_documents for update
using (
  exists (
    select 1 from public.knowledge_sources ks
    where ks.id = knowledge_documents.source_id
      and public.company_has_permission(ks.company_id, 'knowledge.manage')
  )
)
with check (
  exists (
    select 1 from public.knowledge_sources ks
    where ks.id = knowledge_documents.source_id
      and public.company_has_permission(ks.company_id, 'knowledge.manage')
  )
);

-- ── Channel platform (108) ──────────────────────────────────

drop policy if exists channel_sessions_select on public.channel_sessions;
create policy channel_sessions_select on public.channel_sessions for select using (
  public.company_has_permission(company_id, 'channels.view')
);

drop policy if exists channel_sessions_insert on public.channel_sessions;
create policy channel_sessions_insert on public.channel_sessions for insert with check (
  public.company_has_permission(company_id, 'channels.manage')
);

drop policy if exists channel_sessions_update on public.channel_sessions;
create policy channel_sessions_update on public.channel_sessions for update
using (public.company_has_permission(company_id, 'channels.manage'))
with check (public.company_has_permission(company_id, 'channels.manage'));

drop policy if exists channel_inbound_events_select on public.channel_inbound_events;
create policy channel_inbound_events_select on public.channel_inbound_events for select using (
  public.company_has_permission(company_id, 'channel.platform.view')
);

drop policy if exists channel_inbound_events_insert on public.channel_inbound_events;
create policy channel_inbound_events_insert on public.channel_inbound_events for insert with check (
  public.company_has_permission(company_id, 'channel.platform.dispatch')
);

drop policy if exists channel_inbound_events_update on public.channel_inbound_events;
create policy channel_inbound_events_update on public.channel_inbound_events for update
using (public.company_has_permission(company_id, 'channel.platform.dispatch'))
with check (public.company_has_permission(company_id, 'channel.platform.dispatch'));

drop policy if exists channel_delivery_events_select on public.channel_delivery_events;
create policy channel_delivery_events_select on public.channel_delivery_events for select using (
  public.company_has_permission(company_id, 'channel.platform.view')
);

drop policy if exists channel_delivery_events_insert on public.channel_delivery_events;
create policy channel_delivery_events_insert on public.channel_delivery_events for insert with check (
  public.company_has_permission(company_id, 'channel.platform.dispatch')
);

drop policy if exists channel_delivery_events_update on public.channel_delivery_events;
create policy channel_delivery_events_update on public.channel_delivery_events for update
using (public.company_has_permission(company_id, 'channel.platform.dispatch'))
with check (public.company_has_permission(company_id, 'channel.platform.dispatch'));

-- ── Workspace RBAC tables ───────────────────────────────────

drop policy if exists user_roles_select_policy on public.user_roles;
create policy user_roles_select_policy on public.user_roles for select using (
  auth.role() = 'authenticated'
  and (
    user_id = auth.uid()
    or public.is_super_admin()
    or (
      public.user_has_permission('users.view')
      and exists (
        select 1 from public.roles r
        where r.id = user_roles.role_id
          and r.company_id = public.current_company_id()
      )
    )
  )
);

drop policy if exists user_roles_insert_policy on public.user_roles;
create policy user_roles_insert_policy on public.user_roles for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      public.user_has_permission('users.edit')
      and exists (
        select 1 from public.roles r
        where r.id = user_roles.role_id
          and r.company_id = public.current_company_id()
      )
    )
  )
);

drop policy if exists user_roles_delete_policy on public.user_roles;
create policy user_roles_delete_policy on public.user_roles for delete using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      public.user_has_permission('users.edit')
      and exists (
        select 1 from public.roles r
        where r.id = user_roles.role_id
          and r.company_id = public.current_company_id()
      )
    )
  )
);

drop policy if exists role_permissions_insert_policy on public.role_permissions;
create policy role_permissions_insert_policy on public.role_permissions for insert with check (
  auth.role() = 'authenticated'
  and exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and (
        public.is_super_admin()
        or (
          public.user_has_permission('roles.edit')
          and r.company_id = public.current_company_id()
          and r.is_system = false
        )
      )
  )
);

drop policy if exists role_permissions_delete_policy on public.role_permissions;
create policy role_permissions_delete_policy on public.role_permissions for delete using (
  auth.role() = 'authenticated'
  and exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and (
        public.is_super_admin()
        or (
          public.user_has_permission('roles.edit')
          and r.company_id = public.current_company_id()
          and r.is_system = false
        )
      )
  )
);

drop policy if exists user_permissions_insert_policy on public.user_permissions;
create policy user_permissions_insert_policy on public.user_permissions for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('roles.edit')
  )
);

drop policy if exists user_permissions_delete_policy on public.user_permissions;
create policy user_permissions_delete_policy on public.user_permissions for delete using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('roles.edit')
  )
);

drop policy if exists permissions_select_policy on public.permissions;
create policy permissions_select_policy on public.permissions for select using (
  auth.role() = 'authenticated'
  and (public.is_super_admin() or public.user_has_permission('roles.view'))
);

-- ── Billing workspace contacts / payment methods ──────────────

drop policy if exists company_billing_contacts_select on public.company_billing_contacts;
create policy company_billing_contacts_select on public.company_billing_contacts for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('billing.view')
    or (
      company_id = public.current_company_id()
      and (
        public.user_has_permission('billing.view_own')
        or public.user_has_permission('billing.contact.edit_own')
      )
    )
  )
);

drop policy if exists company_billing_contacts_insert on public.company_billing_contacts;
create policy company_billing_contacts_insert on public.company_billing_contacts for insert with check (
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

drop policy if exists company_billing_contacts_update on public.company_billing_contacts;
create policy company_billing_contacts_update on public.company_billing_contacts for update
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

drop policy if exists company_payment_methods_select on public.company_payment_methods;
create policy company_payment_methods_select on public.company_payment_methods for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('billing.view')
    or (
      company_id = public.current_company_id()
      and (
        public.user_has_permission('billing.view_own')
        or public.user_has_permission('billing.payment_method.manage_own')
      )
    )
  )
);

drop policy if exists company_payment_methods_insert on public.company_payment_methods;
create policy company_payment_methods_insert on public.company_payment_methods for insert with check (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('billing.edit')
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.payment_method.manage_own')
    )
  )
);

drop policy if exists company_payment_methods_update on public.company_payment_methods;
create policy company_payment_methods_update on public.company_payment_methods for update
using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('billing.edit')
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.payment_method.manage_own')
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
      and public.user_has_permission('billing.payment_method.manage_own')
    )
  )
);

-- ── AI observability ────────────────────────────────────────

drop policy if exists ai_traces_select on public.ai_traces;
create policy ai_traces_select on public.ai_traces for select using (
  public.company_has_permission(company_id, 'ai.analytics.view')
);

drop policy if exists ai_token_cost_records_select on public.ai_token_cost_records;
create policy ai_token_cost_records_select on public.ai_token_cost_records for select using (
  public.company_has_permission(company_id, 'ai.costs.view')
);

-- ── Deprecate is_company_admin shim (permission-based) ──────

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_permission('users.edit');
$$;

comment on function public.is_company_admin() is
  'Deprecated shim — resolves to users.edit permission. Do not use in new policies.';
