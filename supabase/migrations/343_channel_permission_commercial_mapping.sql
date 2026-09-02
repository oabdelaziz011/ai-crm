-- =============================================================================
-- 343 — Channel permission commercial mapping (B1.2 Part 1)
-- =============================================================================
-- Closes zero-map gap for sellable channel SKUs:
--   facebook_channel, instagram_channel, email_channel, sms_channel
--
-- Mirrors the existing whatsapp_channel permission triple:
--   {channel}.view, {channel}.run, ai.{channel}.manage
--
-- Does NOT:
--   - grant company entitlements (company_feature_overrides unchanged)
--   - modify packages, subscriptions, or runtime transport
--   - map generic permissions (settings.edit, channels.view, channels.manage)
-- =============================================================================

-- ── 1. Channel-specific atomic permissions (catalog only) ───────────────────

insert into public.permissions (code, category, module, action, description)
values
  (
    'messenger.view',
    'Messenger Automation',
    'Messenger Automation',
    'View',
    'View Messenger / Facebook channel automation'
  ),
  (
    'messenger.run',
    'Messenger Automation',
    'Messenger Automation',
    'Run',
    'Run Messenger / Facebook channel automation'
  ),
  (
    'ai.messenger.manage',
    'AI',
    'Messenger',
    'Manage',
    'Manage AI Messenger / Facebook channel integration'
  ),
  (
    'instagram.view',
    'Instagram Automation',
    'Instagram Automation',
    'View',
    'View Instagram channel automation'
  ),
  (
    'instagram.run',
    'Instagram Automation',
    'Instagram Automation',
    'Run',
    'Run Instagram channel automation'
  ),
  (
    'ai.instagram.manage',
    'AI',
    'Instagram',
    'Manage',
    'Manage AI Instagram channel integration'
  ),
  (
    'email.view',
    'Email Automation',
    'Email Automation',
    'View',
    'View email channel automation'
  ),
  (
    'email.run',
    'Email Automation',
    'Email Automation',
    'Run',
    'Run email channel automation'
  ),
  (
    'ai.email.manage',
    'AI',
    'Email',
    'Manage',
    'Manage AI email channel integration'
  ),
  (
    'sms.view',
    'SMS Automation',
    'SMS Automation',
    'View',
    'View SMS channel automation'
  ),
  (
    'sms.run',
    'SMS Automation',
    'SMS Automation',
    'Run',
    'Run SMS channel automation'
  ),
  (
    'ai.sms.manage',
    'AI',
    'SMS',
    'Manage',
    'Manage AI SMS channel integration'
  )
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- ── 2. Commercial feature ↔ permission mappings ─────────────────────────────

insert into public.feature_definition_permissions (feature_code, permission_code)
values
  ('facebook_channel', 'messenger.view'),
  ('facebook_channel', 'messenger.run'),
  ('facebook_channel', 'ai.messenger.manage'),
  ('instagram_channel', 'instagram.view'),
  ('instagram_channel', 'instagram.run'),
  ('instagram_channel', 'ai.instagram.manage'),
  ('email_channel', 'email.view'),
  ('email_channel', 'email.run'),
  ('email_channel', 'ai.email.manage'),
  ('sms_channel', 'sms.view'),
  ('sms_channel', 'sms.run'),
  ('sms_channel', 'ai.sms.manage')
on conflict (feature_code, permission_code) do nothing;

-- ── 3. Invariants (idempotent re-run safe) ──────────────────────────────────

do $$
declare
  v_whatsapp integer;
  v_omnichannel integer;
  v_facebook integer;
  v_instagram integer;
  v_email integer;
  v_sms integer;
  v_cross_map integer;
begin
  select count(*)::int into v_whatsapp
  from public.feature_definition_permissions
  where feature_code = 'whatsapp_channel' and is_active = true;

  if v_whatsapp <> 3 then
    raise exception '343 fail-closed: whatsapp_channel mapping count % (expected 3)', v_whatsapp;
  end if;

  select count(*)::int into v_omnichannel
  from public.feature_definition_permissions
  where feature_code = 'omnichannel' and is_active = true;

  if v_omnichannel < 32 then
    raise exception '343 fail-closed: omnichannel mapping count % (expected >= 32)', v_omnichannel;
  end if;

  select count(*)::int into v_facebook
  from public.feature_definition_permissions
  where feature_code = 'facebook_channel' and is_active = true
    and permission_code in ('messenger.view', 'messenger.run', 'ai.messenger.manage');

  if v_facebook <> 3 then
    raise exception '343 fail-closed: facebook_channel mapping count % (expected 3)', v_facebook;
  end if;

  select count(*)::int into v_instagram
  from public.feature_definition_permissions
  where feature_code = 'instagram_channel' and is_active = true
    and permission_code in ('instagram.view', 'instagram.run', 'ai.instagram.manage');

  if v_instagram <> 3 then
    raise exception '343 fail-closed: instagram_channel mapping count % (expected 3)', v_instagram;
  end if;

  select count(*)::int into v_email
  from public.feature_definition_permissions
  where feature_code = 'email_channel' and is_active = true
    and permission_code in ('email.view', 'email.run', 'ai.email.manage');

  if v_email <> 3 then
    raise exception '343 fail-closed: email_channel mapping count % (expected 3)', v_email;
  end if;

  select count(*)::int into v_sms
  from public.feature_definition_permissions
  where feature_code = 'sms_channel' and is_active = true
    and permission_code in ('sms.view', 'sms.run', 'ai.sms.manage');

  if v_sms <> 3 then
    raise exception '343 fail-closed: sms_channel mapping count % (expected 3)', v_sms;
  end if;

  select count(*)::int into v_cross_map
  from public.feature_definition_permissions fdp
  where fdp.is_active = true
    and fdp.permission_code in (
      'settings.edit', 'channels.view', 'channels.manage',
      'channel.platform.view', 'channel.platform.route', 'channel.platform.dispatch'
    )
    and fdp.feature_code in (
      'facebook_channel', 'instagram_channel', 'email_channel', 'sms_channel'
    );

  if v_cross_map <> 0 then
    raise exception '343 fail-closed: generic permissions mapped to channel SKUs (%)', v_cross_map;
  end if;
end $$;
