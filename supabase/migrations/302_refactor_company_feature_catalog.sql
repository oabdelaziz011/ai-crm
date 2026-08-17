-- ============================================================
-- 302 — Refactor Company Feature Catalog (core_crm split)
--
-- Splits overly broad core_crm permission mappings into:
--   finance (commercial)
--   users_roles, company_settings, administration, security_audit (platform)
-- Plus audited reassignments into existing product features.
--
-- DOES NOT delete permissions, roles, role_permissions, user_roles,
-- or user_permissions.
-- DOES NOT modify user_has_permission / has_company_permission / RLS.
-- DOES NOT invent zero-mapping channel/AI permission rows.
-- Preserves company access via platform default_enabled + finance backfill.
-- ============================================================

do $$
declare
  v_core_count integer;
begin
  select count(*)::int into v_core_count
  from public.feature_definition_permissions
  where feature_code = 'core_crm'
    and is_active = true;

  if v_core_count <> 77 then
    raise exception
      '302 fail-closed: expected 77 active core_crm mappings, found %',
      v_core_count;
  end if;
end $$;

-- ── 1. New feature definitions ────────────────────────────────

insert into public.feature_definitions (
  code, category, label, description,
  default_enabled, is_billable, requires_subscription, sort_order, is_active
)
values
  (
    'finance', 'billing', 'Finance',
    'Billing, invoices, subscriptions, and payment administration',
    false, true, true, 25, true
  ),
  (
    'users_roles', 'admin', 'Users & Roles',
    'Tenant user, role, and permission administration',
    true, false, false, 15, true
  ),
  (
    'company_settings', 'admin', 'Company Settings',
    'Company profile, settings shell, and generic configuration',
    true, false, false, 16, true
  ),
  (
    'administration', 'admin', 'Administration',
    'Platform company directory, feature flags, and licenses',
    true, false, false, 14, true
  ),
  (
    'security_audit', 'admin', 'Security / Audit',
    'Audit logs and governance capabilities',
    true, false, false, 17, true
  )
on conflict (code) do update
set
  category = excluded.category,
  label = excluded.label,
  description = excluded.description,
  default_enabled = excluded.default_enabled,
  is_billable = excluded.is_billable,
  requires_subscription = excluded.requires_subscription,
  sort_order = excluded.sort_order,
  is_active = true;

-- Mark core_crm as legacy catalog entry (keep grants/packages working).
update public.feature_definitions
set
  label = 'CRM (legacy)',
  description = 'Legacy umbrella capability. Permission mappings moved to finance / admin / product groups. Kept for package and grant compatibility.',
  default_enabled = true,
  is_billable = false,
  requires_subscription = false,
  is_active = true
where code = 'core_crm';

-- ── 2. Insert target mappings (from audited core_crm split) ───

insert into public.feature_definition_permissions (feature_code, permission_code)
values
  -- finance
  ('finance', 'billing.audit.export'),
  ('finance', 'billing.audit.view'),
  ('finance', 'billing.contact.edit_own'),
  ('finance', 'billing.documents.download_own'),
  ('finance', 'billing.edit'),
  ('finance', 'billing.features.edit'),
  ('finance', 'billing.features.manage_catalog'),
  ('finance', 'billing.features.view'),
  ('finance', 'billing.health.manage'),
  ('finance', 'billing.health.view'),
  ('finance', 'billing.manage_own'),
  ('finance', 'billing.manage_plans'),
  ('finance', 'billing.payment_method.manage_own'),
  ('finance', 'billing.record_payment'),
  ('finance', 'billing.settings.edit'),
  ('finance', 'billing.settings.view'),
  ('finance', 'billing.view'),
  ('finance', 'billing.view_own'),
  ('finance', 'billing.view_reports'),
  ('finance', 'billing.webhooks.manage'),
  ('finance', 'billing.webhooks.view'),
  ('finance', 'configuration.billing.read'),
  ('finance', 'configuration.billing.write'),
  ('finance', 'invoices.create'),
  ('finance', 'invoices.delete'),
  ('finance', 'invoices.edit'),
  ('finance', 'invoices.view'),
  ('finance', 'subscriptions.edit'),
  ('finance', 'subscriptions.view'),

  -- users_roles
  ('users_roles', 'permissions.edit'),
  ('users_roles', 'permissions.view'),
  ('users_roles', 'roles.create'),
  ('users_roles', 'roles.delete'),
  ('users_roles', 'roles.edit'),
  ('users_roles', 'roles.view'),
  ('users_roles', 'users.create'),
  ('users_roles', 'users.delete'),
  ('users_roles', 'users.edit'),
  ('users_roles', 'users.view'),

  -- administration
  ('administration', 'companies.create'),
  ('administration', 'companies.delete'),
  ('administration', 'companies.edit'),
  ('administration', 'companies.view'),
  ('administration', 'feature_flags.publish'),
  ('administration', 'feature_flags.read'),
  ('administration', 'feature_flags.write'),
  ('administration', 'licenses.assign'),
  ('administration', 'licenses.read'),
  ('administration', 'licenses.write'),

  -- company_settings
  ('company_settings', 'company.branding'),
  ('company_settings', 'company.subscription'),
  ('company_settings', 'company.update'),
  ('company_settings', 'company.view'),
  ('company_settings', 'configuration.publish'),
  ('company_settings', 'configuration.read'),
  ('company_settings', 'configuration.write'),
  ('company_settings', 'configuration.notifications.read'),
  ('company_settings', 'configuration.notifications.write'),
  ('company_settings', 'settings.edit'),
  ('company_settings', 'settings.view'),
  ('company_settings', 'workspace.view'),

  -- security_audit
  ('security_audit', 'audit_logs.view'),
  ('security_audit', 'governance.approve'),
  ('security_audit', 'governance.create'),
  ('security_audit', 'governance.edit'),
  ('security_audit', 'governance.manage'),
  ('security_audit', 'governance.view'),

  -- operations (config domains owned by Universal Ops UI)
  ('operations', 'configuration.operations.read'),
  ('operations', 'configuration.operations.write'),
  ('operations', 'configuration.workspace.read'),
  ('operations', 'configuration.workspace.write'),
  -- configuration.dashboard.* lives in universal-operations configuration UI
  ('operations', 'configuration.dashboard.read'),
  ('operations', 'configuration.dashboard.write'),

  -- ai_employee (canonical; remove core_crm overlap)
  ('ai_employee', 'configuration.ai.read'),
  ('ai_employee', 'configuration.ai.write'),

  -- customers
  ('customers', 'configuration.crm.read'),
  ('customers', 'configuration.crm.write')
on conflict (feature_code, permission_code) do update
set is_active = true;

-- ── 3. Verify target counts before removing core_crm rows ─────

do $$
declare
  v_finance integer;
  v_users integer;
  v_admin integer;
  v_settings integer;
  v_audit integer;
  v_ops_extra integer;
  v_ai_cfg integer;
  v_crm_cfg integer;
begin
  select count(*)::int into v_finance
  from public.feature_definition_permissions
  where feature_code = 'finance' and is_active = true
    and permission_code in (
      select permission_code from public.feature_definition_permissions
      where feature_code = 'core_crm' and is_active = true
        and (
          permission_code like 'billing.%'
          or permission_code like 'invoices.%'
          or permission_code like 'subscriptions.%'
          or permission_code like 'configuration.billing.%'
        )
    );

  if v_finance < 29 then
    raise exception '302 fail-closed: finance mappings incomplete (%)', v_finance;
  end if;

  select count(*)::int into v_users
  from public.feature_definition_permissions
  where feature_code = 'users_roles' and is_active = true;
  if v_users < 10 then
    raise exception '302 fail-closed: users_roles mappings incomplete (%)', v_users;
  end if;

  select count(*)::int into v_admin
  from public.feature_definition_permissions
  where feature_code = 'administration' and is_active = true;
  if v_admin < 10 then
    raise exception '302 fail-closed: administration mappings incomplete (%)', v_admin;
  end if;

  select count(*)::int into v_settings
  from public.feature_definition_permissions
  where feature_code = 'company_settings' and is_active = true;
  if v_settings < 12 then
    raise exception '302 fail-closed: company_settings mappings incomplete (%)', v_settings;
  end if;

  select count(*)::int into v_audit
  from public.feature_definition_permissions
  where feature_code = 'security_audit' and is_active = true;
  if v_audit < 6 then
    raise exception '302 fail-closed: security_audit mappings incomplete (%)', v_audit;
  end if;

  select count(*)::int into v_ops_extra
  from public.feature_definition_permissions
  where feature_code = 'operations' and is_active = true
    and permission_code in (
      'configuration.operations.read', 'configuration.operations.write',
      'configuration.workspace.read', 'configuration.workspace.write',
      'configuration.dashboard.read', 'configuration.dashboard.write'
    );
  if v_ops_extra < 6 then
    raise exception '302 fail-closed: operations config mappings incomplete (%)', v_ops_extra;
  end if;

  select count(*)::int into v_ai_cfg
  from public.feature_definition_permissions
  where feature_code = 'ai_employee' and is_active = true
    and permission_code in ('configuration.ai.read', 'configuration.ai.write');
  if v_ai_cfg < 2 then
    raise exception '302 fail-closed: ai_employee configuration mappings missing';
  end if;

  select count(*)::int into v_crm_cfg
  from public.feature_definition_permissions
  where feature_code = 'customers' and is_active = true
    and permission_code in ('configuration.crm.read', 'configuration.crm.write');
  if v_crm_cfg < 2 then
    raise exception '302 fail-closed: customers configuration mappings missing';
  end if;
end $$;

-- ── 4. Remove migrated rows from core_crm (leave feature empty) ─

delete from public.feature_definition_permissions
where feature_code = 'core_crm';

-- Safety: core_crm must now own zero active mappings
do $$
declare
  v_left integer;
begin
  select count(*)::int into v_left
  from public.feature_definition_permissions
  where feature_code = 'core_crm' and is_active = true;

  if v_left <> 0 then
    raise exception '302 fail-closed: core_crm still has % active mappings', v_left;
  end if;
end $$;

-- ── 5. Package compatibility: add finance wherever core_crm is ─

insert into public.plan_features (plan_id, feature_code, enabled, limit_value)
select pf.plan_id, 'finance', true, coalesce(pf.limit_value, '{}'::jsonb)
from public.plan_features pf
where pf.feature_code = 'core_crm'
  and pf.enabled = true
  and not exists (
    select 1
    from public.plan_features x
    where x.plan_id = pf.plan_id
      and x.feature_code = 'finance'
  );

-- Platform groups are default_enabled=true (non-commercial); no package rows required.
-- Keep existing core_crm plan_features rows for legacy package identity.

-- ── 6. Company entitlement compatibility for commercial finance ─
-- Backfill enabled finance grants for companies that currently have core_crm.

insert into public.company_feature_overrides (
  company_id,
  feature_code,
  override_state,
  source,
  starts_at,
  expires_at,
  is_active,
  reason,
  notes
)
select
  c.id,
  'finance',
  'enabled',
  'system',
  now(),
  null,
  true,
  'migration_302_core_crm_split',
  'Preserves finance access previously provided by always-on core_crm'
from public.companies c
where public.is_feature_enabled(c.id, 'core_crm') = true
  and not exists (
    select 1
    from public.company_feature_overrides o
    where o.company_id = c.id
      and o.feature_code = 'finance'
      and o.is_active = true
      and o.override_state = 'enabled'
      and o.starts_at <= now()
      and (o.expires_at is null or o.expires_at > now())
  );

-- ── 7. Final invariants ───────────────────────────────────────

do $$
declare
  v_perm_count integer;
  v_zero_map integer;
begin
  select count(*)::int into v_perm_count from public.permissions;
  if v_perm_count < 293 then
    raise exception '302 fail-closed: permissions catalog shrank to %', v_perm_count;
  end if;

  select count(*)::int into v_zero_map
  from public.feature_definition_permissions
  where is_active = true
    and feature_code in (
      'ai_email_routing', 'ai_ticketing', 'ai_suggested_replies',
      'facebook_channel', 'instagram_channel', 'email_channel', 'sms_channel'
    );
  if v_zero_map <> 0 then
    raise exception '302 fail-closed: zero-mapping features unexpectedly gained mappings';
  end if;
end $$;
