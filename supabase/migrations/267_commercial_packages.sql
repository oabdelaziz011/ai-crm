-- ============================================================
-- 267 — Commercial packages (Phase 7.2) — PART A (schema)
-- ============================================================
-- Decision: EVOLVE public.plans as the SaaS package carrier.
-- Reason: company_subscriptions.plan_id, pricing, and plan_features
-- already exist. A parallel packages table would duplicate linkage.
--
-- PACKAGE ≠ ENTITLEMENT
-- Package membership provisions company_feature_overrides via
-- set_company_feature_grant(source='package'). Runtime access remains
-- is_feature_enabled / require_company_feature_v1 (Phase 6).
--
-- Snapshot safety: company_subscriptions.package_feature_snapshot freezes
-- feature codes at assignment. Editing plan_features later does NOT mutate
-- existing companies until reassigned.
--
-- Grant source 'package' is required so package change can revoke only
-- package-derived grants without destroying manual/contract/system/trial.
-- ============================================================

-- ── 1. Relax plans name/code checks ───────────────────────────

alter table public.plans drop constraint if exists plans_name_check;
alter table public.plans drop constraint if exists plans_code_check;

alter table public.plans
  add column if not exists is_highlighted boolean not null default false,
  add column if not exists is_public boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on table public.plans is
  'SaaS commercial package catalog (Phase 7.2). Pricing + packaging only — NOT runtime authorization.';

-- ── 2. Subscription package snapshot ──────────────────────────

alter table public.company_subscriptions
  add column if not exists package_feature_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists package_assigned_at timestamptz,
  add column if not exists package_assigned_by uuid references auth.users(id) on delete set null;

comment on column public.company_subscriptions.package_feature_snapshot is
  'Frozen feature_definitions.code list provisioned from the package at last assign.';

update public.company_subscriptions cs
set package_feature_snapshot = coalesce((
  select jsonb_agg(pf.feature_code order by pf.feature_code)
  from public.plan_features pf
  where pf.plan_id = cs.plan_id
    and pf.enabled = true
), '[]'::jsonb)
where cs.plan_id is not null
  and (cs.package_feature_snapshot is null or cs.package_feature_snapshot = '[]'::jsonb);

-- ── 3. Grant source: package ──────────────────────────────────

alter table public.company_feature_overrides
  drop constraint if exists company_feature_overrides_source_check;

alter table public.company_feature_overrides
  add constraint company_feature_overrides_source_check
  check (source in ('trial', 'manual', 'contract', 'system', 'package'));

-- ── 4. Audit event types ──────────────────────────────────────

insert into public.billing_audit_event_types (code, label, description)
values
  ('package_created', 'Package Created', 'Commercial package (plan) created'),
  ('package_updated', 'Package Updated', 'Commercial package metadata updated'),
  ('package_activated', 'Package Activated', 'Commercial package set active'),
  ('package_deactivated', 'Package Deactivated', 'Commercial package set inactive'),
  ('package_features_updated', 'Package Features Updated', 'Package feature mapping changed'),
  ('package_assigned', 'Package Assigned', 'Package assigned to company and grants provisioned'),
  ('package_changed', 'Package Changed', 'Company package changed with grant sync'),
  ('package_removed', 'Package Removed', 'Package unassigned from company')
on conflict (code) do update
set label = excluded.label, description = excluded.description, is_active = true;

-- ── 5. Sync stock plan_features to Phase 6 catalog codes ──────

insert into public.plan_features (plan_id, feature_code, enabled)
select p.id, f.code, true
from public.plans p
cross join lateral (
  values
    ('basic', array['core_crm','customers','ticketing','basic_reports','bookings']),
    ('pro', array['core_crm','customers','ticketing','basic_reports','bookings','leads','opportunities','ai_assistant','whatsapp_channel']),
    ('enterprise', array[
      'core_crm','customers','ticketing','basic_reports','bookings','leads','opportunities',
      'operations','ai_assistant','ai_employee','whatsapp_channel','email_channel','omnichannel',
      'workflow_automation','advanced_reports','api_access'
    ])
) as pack(code, codes)
cross join lateral unnest(pack.codes) as f(code)
where p.code = pack.code
  and exists (select 1 from public.feature_definitions fd where fd.code = f.code and fd.is_active)
on conflict (plan_id, feature_code) do update
set enabled = true;

-- ── 6. Helpers ────────────────────────────────────────────────

create or replace function public._package_feature_codes(p_plan_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(pf.feature_code order by pf.feature_code), '{}'::text[])
  from public.plan_features pf
  where pf.plan_id = p_plan_id
    and pf.enabled = true
    and exists (
      select 1 from public.feature_definitions fd
      where fd.code = pf.feature_code and fd.is_active = true
    );
$$;

create or replace function public._can_manage_commercial_packages()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or public.can_edit_billing();
$$;


-- ============================================================
-- 267 — Commercial packages (Phase 7.2) — PART B (grant + catalog RPCs)
-- ============================================================

-- ── 7. set_company_feature_grant — accept source=package ──────
-- Same semantics as 263; only the source check gains 'package'.

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

  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to manage company feature grants';
  end if;

  if p_company_id is null or p_feature_code is null then
    raise exception 'company_id and feature_code are required';
  end if;

  if v_source not in ('trial', 'manual', 'contract', 'system', 'package') then
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

-- ── 8. Internal grant helper (package-safe) ───────────────────
-- Only deactivates same-source grants.
-- When enabling: skip if another active grant from a different source exists
-- (preserves manual/contract/trial/system under unique active index).

create or replace function public._set_company_feature_grant_internal(
  p_company_id uuid,
  p_feature_code text,
  p_enabled boolean,
  p_source text default 'package',
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
  v_source text := coalesce(nullif(trim(p_source), ''), 'package');
  v_state text := case when coalesce(p_enabled, false) then 'enabled' else 'disabled' end;
  v_reason text := coalesce(
    nullif(trim(p_reason), ''),
    nullif(trim(p_notes), ''),
    case when coalesce(p_enabled, false) then 'Package feature grant' else 'Package feature revoked' end
  );
  v_other_id uuid;
begin
  if p_company_id is null or p_feature_code is null then
    raise exception 'company_id and feature_code are required';
  end if;

  if v_source not in ('trial', 'manual', 'contract', 'system', 'package') then
    raise exception 'Invalid grant source: %', v_source;
  end if;

  if not exists (
    select 1 from public.feature_definitions fd
    where fd.code = p_feature_code and fd.is_active = true
  ) then
    raise exception 'Unknown feature code: %', p_feature_code;
  end if;

  if v_state = 'enabled' then
    select o.id into v_other_id
    from public.company_feature_overrides o
    where o.company_id = p_company_id
      and o.feature_code = p_feature_code
      and o.is_active = true
      and o.source is distinct from v_source
    limit 1;

    if v_other_id is not null then
      return v_other_id;
    end if;
  end if;

  update public.company_feature_overrides
  set is_active = false,
      updated_by = auth.uid(),
      updated_at = now()
  where company_id = p_company_id
    and feature_code = p_feature_code
    and source = v_source
    and is_active = true;

  if v_state = 'disabled' then
    return null;
  end if;

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
    'enabled',
    v_reason,
    coalesce(p_starts_at, now()),
    p_expires_at,
    v_source,
    coalesce(p_notes, 'package provisioned'),
    true,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ── 9. upsert_commercial_package_v1 ───────────────────────────

create or replace function public.upsert_commercial_package_v1(
  p_code text,
  p_name text,
  p_id uuid default null,
  p_display_name text default null,
  p_description text default null,
  p_price_monthly numeric default 0,
  p_price_yearly numeric default 0,
  p_is_active boolean default true,
  p_is_highlighted boolean default false,
  p_is_public boolean default true,
  p_sort_order integer default 0,
  p_tier_rank integer default 0,
  p_metadata jsonb default '{}'::jsonb,
  p_max_users integer default null,
  p_max_customers integer default null,
  p_storage_gb numeric default null,
  p_ai_tokens_monthly bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_previous public.plans%rowtype;
  v_row public.plans%rowtype;
  v_created boolean := false;
  v_was_active boolean;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public._can_manage_commercial_packages() then
    raise exception 'Insufficient permissions to manage commercial packages';
  end if;

  if v_code = '' or v_name = '' then
    raise exception 'code and name are required';
  end if;

  if p_id is not null then
    select * into v_previous from public.plans where id = p_id;
    if not found then
      raise exception 'Package not found: %', p_id;
    end if;
  else
    select * into v_previous from public.plans where code = v_code;
  end if;

  if v_previous.id is not null then
    v_was_active := v_previous.is_active;

    update public.plans
    set
      code = v_code,
      name = v_name,
      display_name = coalesce(nullif(trim(p_display_name), ''), v_name),
      description = coalesce(p_description, description, ''),
      price_monthly = coalesce(p_price_monthly, price_monthly, 0),
      price_yearly = coalesce(p_price_yearly, price_yearly, 0),
      is_active = coalesce(p_is_active, is_active, true),
      is_highlighted = coalesce(p_is_highlighted, is_highlighted, false),
      is_public = coalesce(p_is_public, is_public, true),
      sort_order = coalesce(p_sort_order, sort_order, 0),
      tier_rank = coalesce(p_tier_rank, tier_rank, 0),
      metadata = coalesce(p_metadata, metadata, '{}'::jsonb),
      max_users = p_max_users,
      max_customers = p_max_customers,
      storage_gb = p_storage_gb,
      ai_tokens_monthly = p_ai_tokens_monthly,
      updated_at = now()
    where id = v_previous.id
    returning * into v_row;

    perform public.write_billing_audit_log(
      'package_updated',
      null,
      jsonb_build_object(
        'id', v_previous.id,
        'code', v_previous.code,
        'name', v_previous.name,
        'is_active', v_previous.is_active,
        'price_monthly', v_previous.price_monthly,
        'price_yearly', v_previous.price_yearly
      ),
      jsonb_build_object(
        'id', v_row.id,
        'code', v_row.code,
        'name', v_row.name,
        'is_active', v_row.is_active,
        'price_monthly', v_row.price_monthly,
        'price_yearly', v_row.price_yearly,
        'is_highlighted', v_row.is_highlighted,
        'is_public', v_row.is_public
      ),
      'manual',
      jsonb_build_object('package_id', v_row.id, 'package_code', v_row.code)
    );

    if v_was_active is distinct from v_row.is_active then
      perform public.write_billing_audit_log(
        case when v_row.is_active then 'package_activated' else 'package_deactivated' end,
        null,
        jsonb_build_object('id', v_previous.id, 'is_active', v_was_active),
        jsonb_build_object('id', v_row.id, 'is_active', v_row.is_active),
        'manual',
        jsonb_build_object('package_id', v_row.id, 'package_code', v_row.code)
      );
    end if;
  else
    v_created := true;

    insert into public.plans (
      code, name, display_name, description,
      price_monthly, price_yearly,
      is_active, is_highlighted, is_public,
      sort_order, tier_rank, metadata,
      max_users, max_customers, storage_gb, ai_tokens_monthly
    )
    values (
      v_code, v_name, coalesce(nullif(trim(p_display_name), ''), v_name), coalesce(p_description, ''),
      coalesce(p_price_monthly, 0), coalesce(p_price_yearly, 0),
      coalesce(p_is_active, true), coalesce(p_is_highlighted, false), coalesce(p_is_public, true),
      coalesce(p_sort_order, 0), coalesce(p_tier_rank, 0), coalesce(p_metadata, '{}'::jsonb),
      p_max_users, p_max_customers, p_storage_gb, p_ai_tokens_monthly
    )
    returning * into v_row;

    perform public.write_billing_audit_log(
      'package_created',
      null,
      null,
      jsonb_build_object(
        'id', v_row.id,
        'code', v_row.code,
        'name', v_row.name,
        'is_active', v_row.is_active,
        'price_monthly', v_row.price_monthly,
        'price_yearly', v_row.price_yearly
      ),
      'manual',
      jsonb_build_object('package_id', v_row.id, 'package_code', v_row.code)
    );

    if v_row.is_active then
      perform public.write_billing_audit_log(
        'package_activated',
        null,
        null,
        jsonb_build_object('id', v_row.id, 'is_active', true),
        'manual',
        jsonb_build_object('package_id', v_row.id, 'package_code', v_row.code)
      );
    end if;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'code', v_row.code,
    'name', v_row.name,
    'display_name', v_row.display_name,
    'is_active', v_row.is_active,
    'is_highlighted', v_row.is_highlighted,
    'is_public', v_row.is_public,
    'created', v_created
  );
end;
$$;

-- ── 10. set_commercial_package_features_v1 ────────────────────
-- Catalog edit only. Does NOT mutate company_subscriptions snapshots
-- or company_feature_overrides for existing assignees.

create or replace function public.set_commercial_package_features_v1(
  p_plan_id uuid,
  p_feature_codes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_codes text[] := coalesce(p_feature_codes, '{}'::text[]);
  v_code text;
  v_previous text[];
  v_valid text[] := '{}';
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public._can_manage_commercial_packages() then
    raise exception 'Insufficient permissions to manage commercial packages';
  end if;

  if p_plan_id is null then
    raise exception 'plan_id is required';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Package not found: %', p_plan_id;
  end if;

  v_previous := public._package_feature_codes(p_plan_id);

  foreach v_code in array v_codes loop
    v_code := nullif(trim(v_code), '');
    if v_code is null then
      continue;
    end if;
    if not exists (
      select 1 from public.feature_definitions fd
      where fd.code = v_code and fd.is_active = true
    ) then
      raise exception 'Unknown feature code: %', v_code;
    end if;
    if not (v_code = any (v_valid)) then
      v_valid := array_append(v_valid, v_code);
    end if;
  end loop;

  update public.plan_features
  set enabled = false
  where plan_id = p_plan_id
    and enabled = true
    and not (feature_code = any (v_valid));

  foreach v_code in array v_valid loop
    insert into public.plan_features (plan_id, feature_code, enabled)
    values (p_plan_id, v_code, true)
    on conflict (plan_id, feature_code) do update
    set enabled = true;
  end loop;

  update public.plans
  set features = to_jsonb(v_valid),
      updated_at = now()
  where id = p_plan_id;

  perform public.write_billing_audit_log(
    'package_features_updated',
    null,
    jsonb_build_object('feature_codes', to_jsonb(v_previous)),
    jsonb_build_object('feature_codes', to_jsonb(v_valid)),
    'manual',
    jsonb_build_object(
      'package_id', p_plan_id,
      'package_code', v_plan.code,
      'note', 'catalog edit does not mutate existing company subscriptions'
    )
  );

  return jsonb_build_object(
    'plan_id', p_plan_id,
    'package_code', v_plan.code,
    'feature_codes', to_jsonb(v_valid),
    'previous_feature_codes', to_jsonb(v_previous)
  );
end;
$$;


-- ============================================================
-- 267 — Commercial packages (Phase 7.2) — PART C (assign + grants)
-- ============================================================

-- ── 11. assign_company_package_v1 ─────────────────────────────
-- Freezes package_feature_snapshot from catalog at assign time.
-- Revokes ONLY source=package grants removed from the new snapshot.
-- Provisions package grants via _set_company_feature_grant_internal
-- (manual/contract/trial/system grants are preserved).

create or replace function public.assign_company_package_v1(
  p_company_id uuid,
  p_plan_id uuid,
  p_billing_cycle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_sub public.company_subscriptions%rowtype;
  v_previous_plan_id uuid;
  v_previous_snapshot jsonb;
  v_codes text[];
  v_snapshot jsonb;
  v_cycle text;
  v_code text;
  v_event text;
  v_now timestamptz := now();
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public._can_manage_commercial_packages() then
    raise exception 'Insufficient permissions to assign commercial packages';
  end if;

  if auth.role() <> 'service_role' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot assign package for this company';
  end if;

  if p_company_id is null or p_plan_id is null then
    raise exception 'company_id and plan_id are required';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active = true;
  if not found then
    raise exception 'Package not found or inactive';
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  for update;

  if not found then
    v_cycle := coalesce(nullif(trim(p_billing_cycle), ''), 'monthly');
    if v_cycle not in ('monthly', 'yearly') then
      raise exception 'Invalid billing cycle: %', v_cycle;
    end if;

    insert into public.company_subscriptions (
      company_id,
      plan_id,
      status,
      billing_cycle,
      current_period_start,
      current_period_end,
      next_renewal_at,
      auto_renewal
    )
    values (
      p_company_id,
      p_plan_id,
      'active',
      v_cycle,
      v_now,
      case when v_cycle = 'yearly' then v_now + interval '1 year' else v_now + interval '1 month' end,
      case when v_cycle = 'yearly' then v_now + interval '1 year' else v_now + interval '1 month' end,
      true
    )
    returning * into v_sub;
  else
    v_cycle := coalesce(nullif(trim(p_billing_cycle), ''), v_sub.billing_cycle, 'monthly');
    if v_cycle not in ('monthly', 'yearly') then
      raise exception 'Invalid billing cycle: %', v_cycle;
    end if;
  end if;

  v_previous_plan_id := v_sub.plan_id;
  v_previous_snapshot := coalesce(v_sub.package_feature_snapshot, '[]'::jsonb);

  v_codes := public._package_feature_codes(p_plan_id);
  v_snapshot := to_jsonb(v_codes);

  update public.company_subscriptions
  set
    plan_id = p_plan_id,
    billing_cycle = v_cycle,
    package_feature_snapshot = v_snapshot,
    package_assigned_at = v_now,
    package_assigned_by = auth.uid(),
    updated_at = v_now
  where id = v_sub.id
  returning * into v_sub;

  -- Revoke ONLY package-sourced grants that are no longer in the snapshot
  update public.company_feature_overrides
  set
    is_active = false,
    updated_by = auth.uid(),
    updated_at = v_now,
    notes = coalesce(notes, 'package change revoke')
  where company_id = p_company_id
    and source = 'package'
    and is_active = true
    and not (feature_code = any (v_codes));

  -- Provision package grants (skips when another non-package grant is active)
  foreach v_code in array v_codes loop
    perform public._set_company_feature_grant_internal(
      p_company_id,
      v_code,
      true,
      'package',
      v_now,
      null,
      'package assigned',
      'Package feature grant'
    );
  end loop;

  perform public.sync_company_subscription_denormalized(p_company_id);

  v_event := case
    when v_previous_plan_id is null then 'package_assigned'
    when v_previous_plan_id is distinct from p_plan_id then 'package_changed'
    else 'package_assigned'
  end;

  perform public.write_billing_audit_log(
    v_event,
    p_company_id,
    jsonb_build_object(
      'plan_id', v_previous_plan_id,
      'package_feature_snapshot', v_previous_snapshot,
      'billing_cycle', v_sub.billing_cycle
    ),
    jsonb_build_object(
      'plan_id', p_plan_id,
      'package_code', v_plan.code,
      'package_feature_snapshot', v_snapshot,
      'billing_cycle', v_cycle
    ),
    'manual',
    jsonb_build_object(
      'subscription_id', v_sub.id,
      'package_id', p_plan_id,
      'package_code', v_plan.code
    )
  );

  begin
    perform public.emit_subscription_event(
      p_company_id,
      v_sub.id,
      'plan_changed',
      'Package Assigned',
      coalesce(v_plan.display_name, v_plan.name),
      jsonb_build_object(
        'plan_id', p_plan_id,
        'billing_cycle', v_cycle,
        'previous_plan_id', v_previous_plan_id,
        'package_feature_snapshot', v_snapshot
      )
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'company_id', p_company_id,
    'plan_id', p_plan_id,
    'package_code', v_plan.code,
    'billing_cycle', v_cycle,
    'package_feature_snapshot', v_snapshot,
    'event', v_event,
    'subscription_id', v_sub.id
  );
end;
$$;

-- ── 12. assign_subscription_plan wraps package assign ─────────

create or replace function public.assign_subscription_plan(
  p_company_id uuid,
  p_plan_id uuid,
  p_billing_cycle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.assign_company_package_v1(p_company_id, p_plan_id, p_billing_cycle);
end;
$$;

-- ── 13. Grants ────────────────────────────────────────────────

revoke all on function public._package_feature_codes(uuid) from public;
grant execute on function public._package_feature_codes(uuid) to authenticated, service_role;

revoke all on function public._can_manage_commercial_packages() from public;
grant execute on function public._can_manage_commercial_packages() to authenticated, service_role;

revoke all on function public.set_company_feature_grant(uuid, text, boolean, text, timestamptz, timestamptz, text, text) from public;
grant execute on function public.set_company_feature_grant(uuid, text, boolean, text, timestamptz, timestamptz, text, text) to authenticated, service_role;

revoke all on function public._set_company_feature_grant_internal(uuid, text, boolean, text, timestamptz, timestamptz, text, text) from public;
grant execute on function public._set_company_feature_grant_internal(uuid, text, boolean, text, timestamptz, timestamptz, text, text) to authenticated, service_role;

revoke all on function public.upsert_commercial_package_v1(text, text, uuid, text, text, numeric, numeric, boolean, boolean, boolean, integer, integer, jsonb, integer, integer, numeric, bigint) from public;
grant execute on function public.upsert_commercial_package_v1(text, text, uuid, text, text, numeric, numeric, boolean, boolean, boolean, integer, integer, jsonb, integer, integer, numeric, bigint) to authenticated, service_role;

revoke all on function public.set_commercial_package_features_v1(uuid, text[]) from public;
grant execute on function public.set_commercial_package_features_v1(uuid, text[]) to authenticated, service_role;

revoke all on function public.assign_company_package_v1(uuid, uuid, text) from public;
grant execute on function public.assign_company_package_v1(uuid, uuid, text) to authenticated, service_role;

revoke all on function public.assign_subscription_plan(uuid, uuid, text) from public;
grant execute on function public.assign_subscription_plan(uuid, uuid, text) to authenticated, service_role;
