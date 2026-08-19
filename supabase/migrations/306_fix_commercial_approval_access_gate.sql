-- ============================================================
-- 306 — Restore commercial approval access gate
--
-- Live internal.is_feature_enabled / get_company_access_state still
-- have the Phase 2 (263) bodies: Suspended commercial deny only.
-- Phase 6 (266) pending/rejected deny was lost (same class of drift
-- as 305). Public 289 wrappers are unchanged.
--
-- Additive. Does NOT sync package grants. Does NOT modify
-- company_feature_overrides rows, snapshots, plans, or checkout.
-- ============================================================

-- Canonical commercial entitlement resolver.
create or replace function internal.is_feature_enabled(
  p_company_id uuid,
  p_feature_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path to internal, public
as $$
declare
  v_company_status text;
  v_approval_status text;
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

  select c.status, coalesce(c.approval_status, 'approved')
  into v_company_status, v_approval_status
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

  -- Phase 6: pending/rejected cannot use commercial modules even when
  -- Trial status or trial/system/manual/package grants exist.
  if v_commercial and v_approval_status is distinct from 'approved' then
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

comment on function internal.is_feature_enabled(uuid, text) is
  'Canonical company feature resolver. Commercial modules require approval_status=approved AND entitlement; Suspended denies commercial; core/free is not gated by approval.';

-- Access-state helper used by UI. Pending/rejected → expired.
create or replace function internal.get_company_access_state(p_company_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to internal, public
as $$
declare
  v_status text;
  v_approval text;
  v_sub_status text;
  v_cs_status text;
  v_trial_ends timestamptz;
begin
  if p_company_id is null then
    return 'expired';
  end if;

  select c.status, coalesce(c.approval_status, 'approved'), c.subscription_status
  into v_status, v_approval, v_sub_status
  from public.companies c
  where c.id = p_company_id;

  if not found then
    return 'expired';
  end if;

  if v_approval is distinct from 'approved' then
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

  if coalesce(v_cs_status, v_sub_status) in ('past_due', 'grace_period') then
    return 'active';
  end if;

  return 'active';
end;
$$;

comment on function internal.get_company_access_state(uuid) is
  'Commercial access state. pending/rejected → expired; Suspended → suspended. Does not change core/free is_feature_enabled.';

revoke all on function internal.is_feature_enabled(uuid, text) from public, anon;
grant execute on function internal.is_feature_enabled(uuid, text) to authenticated, service_role;

revoke all on function internal.get_company_access_state(uuid) from public, anon;
grant execute on function internal.get_company_access_state(uuid) to authenticated, service_role;
