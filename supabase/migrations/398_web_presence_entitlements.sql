-- =============================================================================
-- 398 — Web Presence entitlements + RBAC (Phase 1 foundation)
-- =============================================================================
-- Feature codes:
--   web_presence_page — Business Page (public page config)
--   web_chat_widget   — public Web Chat widget (dedicated channel identity)
-- Permissions:
--   web_presence.view   — view Web Presence page + widget configuration
--   web_presence.manage — edit Web Presence page + widget configuration
--
-- Does NOT:
--   - grant any company entitlement (no plan_features / company_feature_overrides)
--   - attach any entitlement to the generic web_chat channel key (stays
--     non-commercial; internal AI chat unaffected)
--   - expose anything publicly
-- =============================================================================

insert into public.feature_definitions (
  code, category, label, description, default_enabled, is_billable, requires_subscription, sort_order, is_active
)
values
  (
    'web_presence_page',
    'sales',
    'Business Page',
    'Company public Business Page configuration (Web Presence).',
    false,
    true,
    true,
    76,
    true
  ),
  (
    'web_chat_widget',
    'channels',
    'Web Chat Widget',
    'Public website chat widget on a dedicated company channel (Web Presence). Separate from the internal web_chat channel.',
    false,
    true,
    true,
    197,
    true
  )
on conflict (code) do update
set category = excluded.category,
    label = excluded.label,
    description = excluded.description,
    default_enabled = excluded.default_enabled,
    is_billable = excluded.is_billable,
    requires_subscription = excluded.requires_subscription,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

insert into public.feature_flags (feature_code, label, is_globally_enabled)
select v.code, v.label, true
from (values
  ('web_presence_page', 'Business Page'),
  ('web_chat_widget', 'Web Chat Widget')
) as v(code, label)
where not exists (select 1 from public.feature_flags f where f.feature_code = v.code);

insert into public.permissions (code, category, module, action, description)
values
  ('web_presence.view', 'Web Presence', 'Web Presence', 'View', 'View Web Presence Business Page and Web Chat widget configuration'),
  ('web_presence.manage', 'Web Presence', 'Web Presence', 'Manage', 'Configure Web Presence Business Page and Web Chat widget')
on conflict (code) do update
set category = excluded.category,
    module = excluded.module,
    action = excluded.action,
    description = excluded.description,
    updated_at = now();

insert into public.feature_definition_permissions (feature_code, permission_code)
values
  ('web_presence_page', 'web_presence.view'),
  ('web_presence_page', 'web_presence.manage'),
  ('web_chat_widget', 'web_presence.view'),
  ('web_chat_widget', 'web_presence.manage')
on conflict (feature_code, permission_code) do nothing;

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'web_presence.view'),
    ('admin', 'web_presence.manage'),
    ('manager', 'web_presence.view')
) as v(template_key, permission_code)
where exists (select 1 from public.permissions p where p.code = v.permission_code)
on conflict (template_key, permission_code) do nothing;

-- Existing company system Admin roles (same targeting as 365).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is not null
  and r.is_system is true
  and (
    r.name ilike '%admin%'
    or coalesce(r.description, '') ilike '%administrator%'
    or coalesce(r.template_key, '') = 'admin'
  )
  and p.code in ('web_presence.view', 'web_presence.manage')
on conflict do nothing;

do $$
declare
  v_missing integer;
begin
  select count(*)::int into v_missing
  from (values ('web_presence_page'), ('web_chat_widget')) as required(code)
  where not exists (select 1 from public.feature_definitions f where f.code = required.code);
  if v_missing <> 0 then
    raise exception '398 fail-closed: missing Web Presence feature definitions';
  end if;

  select count(*)::int into v_missing
  from (values ('web_presence.view'), ('web_presence.manage')) as required(code)
  where not exists (select 1 from public.permissions p where p.code = required.code);
  if v_missing <> 0 then
    raise exception '398 fail-closed: missing Web Presence permissions';
  end if;

  if internal.resolve_channel_commercial_feature_code('web_chat') is not null
     or not internal.is_noncommercial_channel_catalog_key('web_chat') then
    raise exception '398 fail-closed: web_chat must remain non-commercial';
  end if;
end $$;
