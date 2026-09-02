-- =============================================================================
-- 342 — Campaigns commercial feature (A1)
-- =============================================================================
-- Adds `campaigns` as a billable commercial SKU and maps campaigns.* permissions
-- so permission_available_to_company / company_has_permission stop fail-opening.
--
-- default_enabled=false, is_billable=true, requires_subscription=true:
-- companies without an explicit grant remain DENIED.
-- Does NOT auto-grant to existing companies or packages.
-- =============================================================================

insert into public.feature_definitions (
  code, category, label, description,
  default_enabled, is_billable, requires_subscription, sort_order, is_active
)
values (
  'campaigns',
  'sales',
  'Campaigns',
  'Marketing campaigns (WhatsApp / Instagram / Messenger)',
  false,
  true,
  true,
  75,
  true
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
  is_active = excluded.is_active;

-- Kill-switch row (enabled by default; mirrors 263 seed pattern)
insert into public.feature_flags (feature_code, label, is_globally_enabled)
select 'campaigns', 'Campaigns', true
where not exists (
  select 1 from public.feature_flags where feature_code = 'campaigns'
);

insert into public.feature_definition_permissions (feature_code, permission_code)
values
  ('campaigns', 'campaigns.view'),
  ('campaigns', 'campaigns.create'),
  ('campaigns', 'campaigns.send')
on conflict (feature_code, permission_code) do nothing;
