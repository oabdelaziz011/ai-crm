-- ============================================================
-- 280 — Sync commercial package entitlements (repair)
-- ============================================================
-- Symptom: Billing "Commercial entitlements" shows source=none for every
-- commercial feature even when the company already has a plan_id.
--
-- Cause: get_company_entitlements reports source='none' when there is no
-- active company_feature_overrides row. Package grants are only created by
-- assign_company_package_v1 / trial provisioning — legacy plan_id writes
-- without that path leave commercial features unconnected.
--
-- Fix: sync_company_package_entitlements_v1 re-provisions source=package
-- grants from the current subscription plan (and snapshot fallback).
-- ============================================================

update public.company_feature_overrides
set source = 'manual',
    updated_at = now()
where source is null
  and is_active = true;

create or replace function public._sync_company_package_entitlements_internal(
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_codes text[] := '{}'::text[];
  v_code text;
  v_now timestamptz := now();
  v_provisioned integer := 0;
  v_revoked integer := 0;
  v_skipped integer := 0;
  v_from_snapshot boolean := false;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  for update;

  if not found then
    return jsonb_build_object(
      'company_id', p_company_id,
      'synced', false,
      'reason', 'no_subscription',
      'provisioned', 0,
      'revoked', 0
    );
  end if;

  if v_sub.plan_id is null then
    return jsonb_build_object(
      'company_id', p_company_id,
      'synced', false,
      'reason', 'no_plan',
      'provisioned', 0,
      'revoked', 0
    );
  end if;

  v_codes := public._package_feature_codes(v_sub.plan_id);

  if coalesce(cardinality(v_codes), 0) = 0
     and v_sub.package_feature_snapshot is not null
     and jsonb_typeof(v_sub.package_feature_snapshot) = 'array' then
    select coalesce(array_agg(distinct trim(x)), '{}'::text[])
      into v_codes
    from jsonb_array_elements_text(v_sub.package_feature_snapshot) as t(x)
    where nullif(trim(x), '') is not null
      and exists (
        select 1 from public.feature_definitions fd
        where fd.code = trim(x) and fd.is_active = true
      );
    v_from_snapshot := coalesce(cardinality(v_codes), 0) > 0;
  end if;

  if coalesce(cardinality(v_codes), 0) = 0 then
    return jsonb_build_object(
      'company_id', p_company_id,
      'plan_id', v_sub.plan_id,
      'synced', false,
      'reason', 'empty_package_features',
      'provisioned', 0,
      'revoked', 0
    );
  end if;

  update public.company_subscriptions
  set
    package_feature_snapshot = to_jsonb(v_codes),
    package_assigned_at = coalesce(package_assigned_at, v_now),
    updated_at = v_now
  where id = v_sub.id
    and (
      package_feature_snapshot is null
      or package_feature_snapshot = '[]'::jsonb
      or package_feature_snapshot is distinct from to_jsonb(v_codes)
    );

  with revoked as (
    update public.company_feature_overrides o
    set
      is_active = false,
      updated_by = auth.uid(),
      updated_at = v_now,
      notes = coalesce(o.notes, 'package entitlement sync revoke')
    where o.company_id = p_company_id
      and o.source = 'package'
      and o.is_active = true
      and not (o.feature_code = any (v_codes))
    returning 1
  )
  select count(*)::integer into v_revoked from revoked;

  foreach v_code in array v_codes loop
    if exists (
      select 1
      from public.company_feature_overrides o
      where o.company_id = p_company_id
        and o.feature_code = v_code
        and o.is_active = true
        and o.source is distinct from 'package'
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    perform public._set_company_feature_grant_internal(
      p_company_id,
      v_code,
      true,
      'package',
      v_now,
      null,
      'package entitlement sync',
      'Synced package feature grant'
    );
    v_provisioned := v_provisioned + 1;
  end loop;

  begin
    perform public.write_billing_audit_log(
      'package_entitlements_synced',
      p_company_id,
      jsonb_build_object('plan_id', v_sub.plan_id),
      jsonb_build_object(
        'plan_id', v_sub.plan_id,
        'feature_codes', to_jsonb(v_codes),
        'provisioned', v_provisioned,
        'revoked', v_revoked,
        'skipped_other_source', v_skipped,
        'from_snapshot', v_from_snapshot
      ),
      'system',
      jsonb_build_object('subscription_id', v_sub.id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'company_id', p_company_id,
    'plan_id', v_sub.plan_id,
    'synced', true,
    'feature_codes', to_jsonb(v_codes),
    'provisioned', v_provisioned,
    'revoked', v_revoked,
    'skipped_other_source', v_skipped,
    'from_snapshot', v_from_snapshot
  );
end;
$$;

create or replace function public.sync_company_package_entitlements_v1(
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() = 'authenticated'
     and not public.is_super_admin()
     and not coalesce(public.can_edit_billing(), false) then
    raise exception 'Insufficient permissions to sync commercial entitlements';
  end if;

  return public._sync_company_package_entitlements_internal(p_company_id);
end;
$$;

comment on function public.sync_company_package_entitlements_v1(uuid) is
  'Re-provisions source=package commercial grants from the company subscription plan. Repairs source=none when plan was assigned without package grant provisioning.';

-- Register audit event if catalog exists (best-effort)
do $$
begin
  if to_regclass('public.billing_event_types') is not null then
    execute $sql$
      insert into public.billing_event_types (code, label, description)
      select
        'package_entitlements_synced',
        'Package Entitlements Synced',
        'Commercial package grants re-synced to company_feature_overrides'
      where not exists (
        select 1 from public.billing_event_types where code = 'package_entitlements_synced'
      )
    $sql$;
  elsif to_regclass('public.billing_event_catalog') is not null then
    execute $sql$
      insert into public.billing_event_catalog (code, label, description)
      select
        'package_entitlements_synced',
        'Package Entitlements Synced',
        'Commercial package grants re-synced to company_feature_overrides'
      where not exists (
        select 1 from public.billing_event_catalog where code = 'package_entitlements_synced'
      )
    $sql$;
  end if;
exception when others then
  raise notice 'billing event catalog seed skipped: %', sqlerrm;
end;
$$;

revoke all on function public._sync_company_package_entitlements_internal(uuid) from public;
grant execute on function public._sync_company_package_entitlements_internal(uuid) to service_role;

revoke all on function public.sync_company_package_entitlements_v1(uuid) from public;
grant execute on function public.sync_company_package_entitlements_v1(uuid) to authenticated, service_role;

-- One-time repair for existing subscriptions with a plan
do $$
declare
  r record;
begin
  for r in
    select cs.company_id
    from public.company_subscriptions cs
    where cs.plan_id is not null
  loop
    begin
      perform public._sync_company_package_entitlements_internal(r.company_id);
    exception when others then
      raise notice 'package entitlement sync skipped for %: %', r.company_id, sqlerrm;
    end;
  end loop;
end;
$$;
