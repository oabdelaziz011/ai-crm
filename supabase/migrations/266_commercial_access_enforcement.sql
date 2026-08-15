-- ============================================================
-- ValueOR Phase 6 — Commercial access enforcement foundation
-- Additive. Approval gate for commercial features in is_feature_enabled.
-- Does NOT change companies.status semantics.
-- ============================================================

-- ── 1. Commercial deny when company is not approved ───────────

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

  -- Phase 6: pending/rejected companies cannot use commercial modules
  -- even if provisional Trial status or accidental grants exist.
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

  return coalesce(v_default_enabled, false);
end;
$$;

-- ── 2. Access state surfaces approval for UI (commercial still via is_feature_enabled)

create or replace function public.get_company_access_state(p_company_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_approval text;
  v_sub_status text;
  v_cs_status text;
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

  -- Not commercially live yet / rejected — treat as expired for commercial access state.
  if v_approval is distinct from 'approved' then
    return 'expired';
  end if;

  if v_status = 'Suspended' then
    return 'suspended';
  end if;

  if public.is_company_commercially_expired(p_company_id) then
    return 'expired';
  end if;

  select cs.status
  into v_cs_status
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

-- ── 3. Helper for server/API commercial checks ────────────────

create or replace function public.require_company_feature_v1(
  p_company_id uuid,
  p_feature_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_feature_enabled(p_company_id, p_feature_code) then
    raise exception 'feature_not_entitled:%', p_feature_code
      using errcode = 'P0001';
  end if;
  return true;
end;
$$;

revoke all on function public.require_company_feature_v1(uuid, text) from public;
grant execute on function public.require_company_feature_v1(uuid, text) to authenticated;
grant execute on function public.require_company_feature_v1(uuid, text) to service_role;

-- ── 4. Include approval_status in auth bootstrap (additive) ───

create or replace function public.load_user_auth_context(p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_profile_id uuid;
  v_company_id uuid;
  v_full_name text;
  v_is_super_admin boolean;
  v_preferred_language text;
  v_preferred_theme text;
  v_timezone text;
  v_avatar_url text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if v_user_id is distinct from auth.uid() and not public.is_super_admin() then
    raise exception 'Forbidden';
  end if;

  select
    p.id,
    p.company_id,
    p.full_name,
    coalesce(p.is_super_admin, false),
    p.preferred_language,
    p.preferred_theme,
    p.timezone,
    p.avatar_url
  into
    v_profile_id,
    v_company_id,
    v_full_name,
    v_is_super_admin,
    v_preferred_language,
    v_preferred_theme,
    v_timezone,
    v_avatar_url
  from public.profiles p
  where p.id = v_user_id or p.user_id = v_user_id
  order by case when p.id = v_user_id then 0 else 1 end
  limit 1;

  if v_profile_id is null then
    return jsonb_build_object(
      'profile', null,
      'company', null,
      'roles', '[]'::jsonb,
      'permissions', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile_id,
      'company_id', v_company_id,
      'full_name', v_full_name,
      'is_super_admin', v_is_super_admin,
      'preferred_language', v_preferred_language,
      'preferred_theme', coalesce(v_preferred_theme, 'system'),
      'timezone', coalesce(v_timezone, 'UTC'),
      'avatar_url', v_avatar_url
    ),
    'company', (
      select to_jsonb(row)
      from (
        select
          c.id,
          c.name,
          c.logo_url,
          c.status,
          c.subscription_status,
          c.billing_cycle,
          c.subscription_expires_at,
          c.approval_status
        from public.companies c
        where c.id = v_company_id
      ) row
    ),
    'roles', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'company_id', r.company_id,
            'name', r.name,
            'description', r.description,
            'is_system', r.is_system
          )
          order by r.name nulls last
        )
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = v_profile_id or ur.user_id = v_user_id
      ),
      '[]'::jsonb
    ),
    'permissions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'category', p.category,
            'module', p.module,
            'action', p.action,
            'code', p.code,
            'description', p.description
          )
          order by p.code nulls last
        )
        from (
          select distinct rp.permission_id
          from public.role_permissions rp
          join public.user_roles ur on ur.role_id = rp.role_id
          where ur.user_id = v_profile_id or ur.user_id = v_user_id
          union
          select up.permission_id
          from public.user_permissions up
          where up.user_id = v_profile_id or up.user_id = v_user_id
        ) perm_ids
        join public.permissions p on p.id = perm_ids.permission_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

comment on function public.load_user_auth_context(uuid) is
  'Single-round-trip auth bootstrap: profile (incl. preferences), company (incl. approval_status), roles, permissions.';

revoke all on function public.load_user_auth_context(uuid) from public;
grant execute on function public.load_user_auth_context(uuid) to authenticated;
grant execute on function public.load_user_auth_context(uuid) to service_role;
