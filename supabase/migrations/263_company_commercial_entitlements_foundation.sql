-- ============================================================
-- ValueOR – Company commercial entitlements foundation (Phase 2)
-- Option A: evolve billing feature_definitions + company_feature_overrides
-- Explicit company grants = commercial source of truth (NOT plan_features).
-- Does NOT add companies.status='Expired'. Does NOT create a 4th stack.
-- ============================================================

-- ── 1. Evolve company_feature_overrides ───────────────────────

alter table public.company_feature_overrides
  add column if not exists starts_at timestamptz;

alter table public.company_feature_overrides
  add column if not exists source text;

alter table public.company_feature_overrides
  add column if not exists notes text;

-- Backfill nulls before NOT NULL / CHECK
update public.company_feature_overrides
set starts_at = coalesce(starts_at, created_at, now())
where starts_at is null;

update public.company_feature_overrides
set source = coalesce(nullif(trim(source), ''), 'manual')
where source is null or trim(source) = '';

alter table public.company_feature_overrides
  alter column starts_at set default now();

alter table public.company_feature_overrides
  alter column starts_at set not null;

alter table public.company_feature_overrides
  alter column source set default 'manual';

alter table public.company_feature_overrides
  alter column source set not null;

alter table public.company_feature_overrides
  drop constraint if exists company_feature_overrides_source_check;

alter table public.company_feature_overrides
  add constraint company_feature_overrides_source_check
  check (source in ('trial', 'manual', 'contract', 'system'));

create index if not exists idx_company_feature_overrides_company_source
  on public.company_feature_overrides (company_id, source)
  where is_active = true;

create index if not exists idx_company_feature_overrides_window
  on public.company_feature_overrides (company_id, feature_code, starts_at, expires_at)
  where is_active = true;

-- ── 2. Expand feature_definitions.category ────────────────────

alter table public.feature_definitions
  drop constraint if exists feature_definitions_category_check;

alter table public.feature_definitions
  add constraint feature_definitions_category_check
  check (category in (
    'core',
    'crm',
    'ai',
    'channels',
    'service',
    'automation',
    'sales',
    'scheduling',
    'operations',
    'reporting',
    'integrations',
    'billing',
    'admin'
  ));

-- ── 3. Classify EXISTING catalog rows (inspect-driven) ────────
-- Existing codes from 042:
--   core_crm, basic_reports, advanced_reports, ai_assistant, whatsapp_channel, api_access
-- Only core_crm qualifies as core/non-commercial after reclassification.

update public.feature_definitions
set
  category = 'crm',
  label = 'CRM',
  description = 'Core CRM workspace (customers and related CRM surfaces)',
  default_enabled = true,
  is_billable = false,
  requires_subscription = false,
  sort_order = 10
where code = 'core_crm';

update public.feature_definitions
set
  category = 'reporting',
  label = 'Basic Reports',
  description = 'Standard reporting dashboards',
  default_enabled = false,
  is_billable = true,
  requires_subscription = true,
  sort_order = 200
where code = 'basic_reports';

update public.feature_definitions
set
  category = 'reporting',
  label = 'Advanced Reports',
  description = 'Advanced analytics and exports',
  default_enabled = false,
  is_billable = true,
  requires_subscription = true,
  sort_order = 210
where code = 'advanced_reports';

update public.feature_definitions
set
  category = 'ai',
  label = 'AI Assistant',
  description = 'In-app AI assistant',
  default_enabled = false,
  is_billable = true,
  requires_subscription = true,
  sort_order = 110
where code = 'ai_assistant';

update public.feature_definitions
set
  category = 'channels',
  label = 'WhatsApp',
  description = 'WhatsApp channel and automation',
  default_enabled = false,
  is_billable = true,
  requires_subscription = true,
  sort_order = 140
where code = 'whatsapp_channel';

update public.feature_definitions
set
  category = 'integrations',
  label = 'API Access',
  description = 'External API access',
  default_enabled = false,
  is_billable = true,
  requires_subscription = true,
  sort_order = 300
where code = 'api_access';

-- ── 4. Expand catalog (reuse keys; no semantic duplicates) ────

insert into public.feature_definitions (
  code, category, label, description,
  default_enabled, is_billable, requires_subscription, sort_order, is_active
)
values
  -- Core / non-commercial (eligible for system backfill)
  ('customers', 'crm', 'Customers', 'Customer records and customer workspace',
    true, false, false, 20, true),

  -- Commercial CRM / sales / scheduling / ops
  ('leads', 'crm', 'Leads', 'Lead management',
    false, true, true, 30, true),
  ('opportunities', 'crm', 'Opportunities', 'Opportunity pipeline',
    false, true, true, 40, true),
  ('bookings', 'scheduling', 'Bookings & Scheduling', 'Appointments, calendar, and scheduling',
    false, true, true, 50, true),
  ('operations', 'operations', 'Operations', 'Universal operations workspace',
    false, true, true, 60, true),

  -- Service
  ('ticketing', 'service', 'Ticketing', 'Customer tickets and SLA workspace',
    false, true, true, 70, true),

  -- AI (commercial)
  ('ai_employee', 'ai', 'AI Employee', 'AI employees / agents runtime',
    false, true, true, 100, true),
  ('ai_email_routing', 'ai', 'AI Email Routing', 'AI-assisted email routing',
    false, true, true, 120, true),
  ('ai_ticketing', 'ai', 'AI Ticketing', 'AI ticket triage and automation',
    false, true, true, 130, true),
  ('ai_suggested_replies', 'ai', 'AI Suggested Replies', 'AI suggested reply assists',
    false, true, true, 135, true),

  -- Automation
  ('workflow_automation', 'automation', 'Workflow Automation', 'Workflow builder and automation engine',
    false, true, true, 150, true),

  -- Channels
  ('facebook_channel', 'channels', 'Facebook', 'Facebook / Messenger channel',
    false, true, true, 160, true),
  ('instagram_channel', 'channels', 'Instagram', 'Instagram channel',
    false, true, true, 170, true),
  ('email_channel', 'channels', 'Email', 'Email channel',
    false, true, true, 180, true),
  ('sms_channel', 'channels', 'SMS', 'SMS channel',
    false, true, true, 190, true),
  ('omnichannel', 'channels', 'Omnichannel', 'Omnichannel inbox and routing',
    false, true, true, 195, true)
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

-- Keep legacy feature_flags rows in sync for kill-switch path
insert into public.feature_flags (feature_code, label, is_globally_enabled)
select fd.code, fd.label, true
from public.feature_definitions fd
where fd.is_active = true
on conflict (feature_code) do nothing;

-- ── 5. Configurable trial feature pack ────────────────────────

insert into public.billing_setting_definitions (
  code, category, label, description, value_type, scope_type, default_value, sort_order
)
values (
  'trial_feature_set',
  'entitlements',
  'Default Trial Feature Set',
  'JSON array of feature_definitions.code values granted on self-serve / default trial',
  'json',
  'platform',
  '["core_crm","customers","ticketing","basic_reports","bookings"]'::jsonb,
  91
)
on conflict (code) do update
set
  category = excluded.category,
  label = excluded.label,
  description = excluded.description,
  value_type = excluded.value_type,
  scope_type = excluded.scope_type,
  default_value = excluded.default_value,
  sort_order = excluded.sort_order,
  is_active = true;

-- ── 6. Audit event types ──────────────────────────────────────

insert into public.billing_audit_event_types (code, label, description)
values
  ('feature_enabled', 'Feature Enabled', 'Company commercial feature grant enabled'),
  ('feature_disabled', 'Feature Disabled', 'Company commercial feature grant disabled/revoked'),
  ('feature_extended', 'Feature Extended', 'Company feature expiration extended'),
  ('feature_expired', 'Feature Expired', 'Company feature marked expired / past expires_at'),
  ('trial_started', 'Trial Started', 'Company trial started'),
  ('trial_extended', 'Trial Extended', 'Company trial end date extended'),
  ('trial_expired', 'Trial Expired', 'Company trial commercially expired'),
  ('company_suspended', 'Company Suspended', 'Company access suspended'),
  ('company_reactivated', 'Company Reactivated', 'Company access reactivated after suspension')
on conflict (code) do update
set label = excluded.label, description = excluded.description, is_active = true;

-- ── 7. Classification + access-state helpers ──────────────────

create or replace function public.is_feature_commercially_gated(p_feature_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (fd.is_billable or fd.requires_subscription)
      from public.feature_definitions fd
      where fd.code = p_feature_code
        and fd.is_active = true
      limit 1
    ),
    true
  );
$$;

comment on function public.is_feature_commercially_gated(text) is
  'Commercial/product modules require an explicit company grant (is_billable OR requires_subscription).';

create or replace function public.is_company_commercially_expired(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_sub_status text;
  v_expires_at timestamptz;
  v_trial_ends timestamptz;
  v_cs_status text;
begin
  if p_company_id is null then
    return true;
  end if;

  select c.status, c.subscription_status, c.subscription_expires_at
  into v_status, v_sub_status, v_expires_at
  from public.companies c
  where c.id = p_company_id;

  if not found then
    return true;
  end if;

  -- Suspended is a separate access state; not "expired".
  if v_status = 'Suspended' then
    return false;
  end if;

  if v_sub_status = 'expired' then
    return true;
  end if;

  select cs.status, cs.trial_ends_at, cs.current_period_end
  into v_cs_status, v_trial_ends, v_expires_at
  from public.company_subscriptions cs
  where cs.company_id = p_company_id;

  if found then
    if v_cs_status = 'expired' then
      return true;
    end if;
    if v_cs_status = 'trialing' and v_trial_ends is not null and v_trial_ends <= now() then
      return true;
    end if;
    if v_cs_status in ('canceled') and v_expires_at is not null and v_expires_at <= now() then
      return true;
    end if;
  else
    -- No subscription row: Trial companies without a clock are not expired yet
    -- (Phase 4 will create trial_ends_at). Active without expiry is not expired.
    if v_status = 'Trial'
       and v_sub_status = 'trialing'
       and v_expires_at is not null
       and v_expires_at <= now() then
      return true;
    end if;
    if v_sub_status = 'expired' then
      return true;
    end if;
  end if;

  return false;
end;
$$;

create or replace function public.get_company_access_state(p_company_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_sub_status text;
  v_cs_status text;
  v_trial_ends timestamptz;
begin
  if p_company_id is null then
    return 'expired';
  end if;

  select c.status, c.subscription_status
  into v_status, v_sub_status
  from public.companies c
  where c.id = p_company_id;

  if not found then
    return 'expired';
  end if;

  if v_status = 'Suspended' then
    return 'suspended';
  end if;

  if public.is_company_commercially_expired(p_company_id) then
    return 'expired';
  end if;

  select cs.status, cs.trial_ends_at
  into v_cs_status, v_trial_ends
  from public.company_subscriptions cs
  where cs.company_id = p_company_id;

  if coalesce(v_cs_status, v_sub_status) = 'trialing'
     or v_status = 'Trial' then
    return 'trial';
  end if;

  if v_status = 'Active' or coalesce(v_cs_status, v_sub_status) = 'active' then
    return 'active';
  end if;

  -- past_due / grace_period still commercially active until expired/suspended
  if coalesce(v_cs_status, v_sub_status) in ('past_due', 'grace_period') then
    return 'active';
  end if;

  return 'active';
end;
$$;

-- ── 8. Effective entitlement resolver (deny-by-default commercial) ─

create or replace function public.is_feature_enabled(
  p_company_id uuid,
  p_feature_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_status text;
  v_default_enabled boolean;
  v_is_billable boolean;
  v_requires_subscription boolean;
  v_commercial boolean;
  v_flag_enabled boolean;
  v_override_state text;
  v_grant_source text;
begin
  if p_company_id is null or p_feature_code is null or trim(p_feature_code) = '' then
    return false;
  end if;

  select c.status
  into v_company_status
  from public.companies c
  where c.id = p_company_id;

  if not found then
    return false;
  end if;

  select fd.default_enabled, fd.is_billable, fd.requires_subscription
  into v_default_enabled, v_is_billable, v_requires_subscription
  from public.feature_definitions fd
  where fd.code = p_feature_code
    and fd.is_active = true
  limit 1;

  if not found then
    return false;
  end if;

  v_commercial := coalesce(v_is_billable, false) or coalesce(v_requires_subscription, false);

  -- Runtime kill-switch (not commercial licensing)
  select ff.is_globally_enabled
  into v_flag_enabled
  from public.feature_flags ff
  where ff.feature_code = p_feature_code;

  if v_flag_enabled is not null and v_flag_enabled = false then
    return false;
  end if;

  if v_company_status = 'Suspended' and v_commercial then
    return false;
  end if;

  select o.override_state, o.source
  into v_override_state, v_grant_source
  from public.company_feature_overrides o
  where o.company_id = p_company_id
    and o.feature_code = p_feature_code
    and o.is_active = true
    and o.starts_at <= now()
    and (o.expires_at is null or o.expires_at > now())
  order by o.created_at desc
  limit 1;

  if found then
    if v_override_state = 'disabled' then
      return false;
    end if;
    if v_override_state = 'enabled' then
      if v_grant_source = 'trial' and public.is_company_commercially_expired(p_company_id) then
        return false;
      end if;
      return true;
    end if;
  end if;

  -- No in-window grant:
  -- Commercial: deny (no plan_features / default_enabled fallback)
  if v_commercial then
    return false;
  end if;

  -- Core / non-commercial: may use default_enabled
  return coalesce(v_default_enabled, false);
end;
$$;

drop function if exists public.get_company_entitlements(uuid);

create or replace function public.get_company_entitlements(p_company_id uuid)
returns table (
  feature_code text,
  label text,
  category text,
  enabled boolean,
  source text,
  limit_value jsonb,
  starts_at timestamptz,
  expires_at timestamptz,
  notes text,
  is_commercial boolean,
  override_state text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() = 'authenticated' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Insufficient permissions to view company entitlements';
  end if;

  return query
  select
    fd.code,
    fd.label,
    fd.category,
    public.is_feature_enabled(p_company_id, fd.code) as enabled,
    case
      when o.id is not null then o.source
      when (fd.is_billable or fd.requires_subscription) then 'none'
      else 'default'
    end as source,
    coalesce(pf.limit_value, '{}'::jsonb) as limit_value,
    o.starts_at,
    o.expires_at,
    coalesce(o.notes, o.reason) as notes,
    (fd.is_billable or fd.requires_subscription) as is_commercial,
    o.override_state
  from public.feature_definitions fd
  left join lateral (
    select ox.*
    from public.company_feature_overrides ox
    where ox.company_id = p_company_id
      and ox.feature_code = fd.code
      and ox.is_active = true
    order by ox.created_at desc
    limit 1
  ) o on true
  left join public.company_subscriptions cs
    on cs.company_id = p_company_id
  left join public.plan_features pf
    on pf.plan_id = cs.plan_id
   and pf.feature_code = fd.code
  where fd.is_active = true
  order by fd.sort_order, fd.code;
end;
$$;

-- ── 9. Platform-admin grant RPCs (is_super_admin only) ────────

create or replace function public.set_company_feature_grant(
  p_company_id uuid,
  p_feature_code text,
  p_enabled boolean,
  p_source text default 'manual',
  p_starts_at timestamptz default now(),
  p_expires_at timestamptz default null,
  p_notes text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_previous jsonb;
  v_source text := coalesce(nullif(trim(p_source), ''), 'manual');
  v_state text := case when coalesce(p_enabled, false) then 'enabled' else 'disabled' end;
  v_reason text := coalesce(
    nullif(trim(p_reason), ''),
    nullif(trim(p_notes), ''),
    case when coalesce(p_enabled, false) then 'Feature enabled' else 'Feature disabled' end
  );
  v_event text;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  -- Commercial grant mutations: platform super-admin only (not tenant billing.features.edit)
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to manage company feature grants';
  end if;

  if p_company_id is null or p_feature_code is null then
    raise exception 'company_id and feature_code are required';
  end if;

  if v_source not in ('trial', 'manual', 'contract', 'system') then
    raise exception 'Invalid grant source: %', v_source;
  end if;

  if not exists (
    select 1 from public.feature_definitions fd
    where fd.code = p_feature_code and fd.is_active = true
  ) then
    raise exception 'Unknown feature code: %', p_feature_code;
  end if;

  select jsonb_build_object(
    'override_state', o.override_state,
    'source', o.source,
    'starts_at', o.starts_at,
    'expires_at', o.expires_at,
    'notes', o.notes,
    'reason', o.reason
  )
  into v_previous
  from public.company_feature_overrides o
  where o.company_id = p_company_id
    and o.feature_code = p_feature_code
    and o.is_active = true
  limit 1;

  update public.company_feature_overrides
  set is_active = false,
      updated_by = auth.uid(),
      updated_at = now()
  where company_id = p_company_id
    and feature_code = p_feature_code
    and is_active = true;

  insert into public.company_feature_overrides (
    company_id,
    feature_code,
    override_state,
    reason,
    starts_at,
    expires_at,
    source,
    notes,
    is_active,
    created_by,
    updated_by
  )
  values (
    p_company_id,
    p_feature_code,
    v_state,
    v_reason,
    coalesce(p_starts_at, now()),
    p_expires_at,
    v_source,
    p_notes,
    true,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  v_event := case
    when v_state = 'enabled'
      and v_previous is not null
      and (v_previous->>'expires_at') is distinct from coalesce(p_expires_at::text, '')
      and p_expires_at is not null
      and (v_previous->>'override_state') = 'enabled'
      then 'feature_extended'
    when v_state = 'enabled' then 'feature_enabled'
    else 'feature_disabled'
  end;

  perform public.write_billing_audit_log(
    v_event,
    p_company_id,
    v_previous,
    jsonb_build_object(
      'override_state', v_state,
      'source', v_source,
      'starts_at', coalesce(p_starts_at, now()),
      'expires_at', p_expires_at,
      'notes', p_notes,
      'reason', v_reason
    ),
    'manual',
    jsonb_build_object('feature_code', p_feature_code, 'override_id', v_id)
  );

  return v_id;
end;
$$;

create or replace function public.revoke_company_feature_grant(
  p_company_id uuid,
  p_feature_code text,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous jsonb;
  v_updated integer := 0;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to manage company feature grants';
  end if;

  select jsonb_build_object(
    'override_state', o.override_state,
    'source', o.source,
    'starts_at', o.starts_at,
    'expires_at', o.expires_at,
    'notes', o.notes,
    'reason', o.reason
  )
  into v_previous
  from public.company_feature_overrides o
  where o.company_id = p_company_id
    and o.feature_code = p_feature_code
    and o.is_active = true
  limit 1;

  update public.company_feature_overrides
  set is_active = false,
      updated_by = auth.uid(),
      updated_at = now(),
      notes = coalesce(p_notes, notes)
  where company_id = p_company_id
    and feature_code = p_feature_code
    and is_active = true;

  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    perform public.write_billing_audit_log(
      'feature_disabled',
      p_company_id,
      v_previous,
      jsonb_build_object('revoked', true, 'notes', p_notes),
      'manual',
      jsonb_build_object('feature_code', p_feature_code)
    );
  end if;

  return v_updated > 0;
end;
$$;

-- Harden legacy override writer: super-admin only; maps onto grant API
create or replace function public.set_company_feature_override(
  p_company_id uuid,
  p_feature_code text,
  p_override_state text,
  p_reason text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to manage company feature grants';
  end if;

  if p_override_state not in ('enabled', 'disabled') then
    raise exception 'Invalid override_state: %', p_override_state;
  end if;

  return public.set_company_feature_grant(
    p_company_id,
    p_feature_code,
    p_override_state = 'enabled',
    'manual',
    now(),
    p_expires_at,
    p_reason,
    p_reason
  );
end;
$$;

-- ── 10. Safe core-only compatibility backfill ─────────────────
-- ONLY features with is_billable=false AND requires_subscription=false.
-- Skips any row that already has an active override (no duplicates).

insert into public.company_feature_overrides (
  company_id,
  feature_code,
  override_state,
  reason,
  starts_at,
  expires_at,
  source,
  notes,
  is_active,
  created_by,
  updated_by
)
select
  c.id,
  fd.code,
  'enabled',
  'Phase 2 core compatibility backfill',
  now(),
  null,
  'system',
  'core compatibility backfill',
  true,
  null,
  null
from public.companies c
cross join public.feature_definitions fd
where fd.is_active = true
  and fd.is_billable = false
  and fd.requires_subscription = false
  and not exists (
    select 1
    from public.company_feature_overrides o
    where o.company_id = c.id
      and o.feature_code = fd.code
      and o.is_active = true
  );

-- ── 11. Grants ────────────────────────────────────────────────

revoke all on function public.is_feature_commercially_gated(text) from public;
grant execute on function public.is_feature_commercially_gated(text) to authenticated;

revoke all on function public.is_company_commercially_expired(uuid) from public;
grant execute on function public.is_company_commercially_expired(uuid) to authenticated;

revoke all on function public.get_company_access_state(uuid) from public;
grant execute on function public.get_company_access_state(uuid) to authenticated;

revoke all on function public.is_feature_enabled(uuid, text) from public;
grant execute on function public.is_feature_enabled(uuid, text) to authenticated;

revoke all on function public.get_company_entitlements(uuid) from public;
grant execute on function public.get_company_entitlements(uuid) to authenticated;

revoke all on function public.set_company_feature_grant(uuid, text, boolean, text, timestamptz, timestamptz, text, text) from public;
grant execute on function public.set_company_feature_grant(uuid, text, boolean, text, timestamptz, timestamptz, text, text) to authenticated;

revoke all on function public.revoke_company_feature_grant(uuid, text, text) from public;
grant execute on function public.revoke_company_feature_grant(uuid, text, text) to authenticated;

revoke all on function public.set_company_feature_override(uuid, text, text, text, timestamptz) from public;
grant execute on function public.set_company_feature_override(uuid, text, text, text, timestamptz) to authenticated;
