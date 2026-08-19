-- 309 — Persist tenant-facing suspend reason and require it on suspend.
-- Rejection already uses companies.approval_rejection_reason + reject_company_v1.
-- Do not add a parallel status system.

alter table public.companies
  add column if not exists suspension_reason text;

comment on column public.companies.suspension_reason is
  'Tenant-visible reason shown when companies.status = Suspended. Cleared on restore.';

create or replace function internal.suspend_billing_subscription(
  p_company_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_previous jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;
  if auth.role() <> 'service_role' and not public.can_edit_billing() then
    raise exception 'Insufficient permissions to suspend subscription';
  end if;
  if auth.role() <> 'service_role' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot suspend subscription for this company';
  end if;
  if v_reason is null then
    raise exception 'suspension_reason_required';
  end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then
    raise exception 'Subscription not found for company %', p_company_id;
  end if;

  select jsonb_build_object('company_status', c.status, 'subscription_status', v_sub.status)
  into v_previous
  from public.companies c
  where c.id = p_company_id;

  update public.companies
  set
    status = 'Suspended',
    suspension_reason = v_reason,
    updated_at = now()
  where id = p_company_id;

  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'suspended', 'Subscription Suspended', v_reason,
    jsonb_build_object('reason', v_reason)
  );

  perform public.write_billing_audit_log(
    'subscription_suspended', p_company_id, v_previous,
    jsonb_build_object('company_status', 'Suspended', 'reason', v_reason),
    'manual', jsonb_build_object('subscription_id', v_sub.id)
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'company_status', 'Suspended',
    'suspension_reason', v_reason
  );
end;
$$;

create or replace function internal.restore_billing_subscription(
  p_company_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_previous jsonb;
  v_new_status text;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Administrative restore');
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;
  if auth.role() <> 'service_role' and not public.can_edit_billing() then
    raise exception 'Insufficient permissions to restore subscription';
  end if;
  if auth.role() <> 'service_role' and not public.can_view_billing_company(p_company_id) then
    raise exception 'Cannot restore subscription for this company';
  end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then
    raise exception 'Subscription not found for company %', p_company_id;
  end if;

  select jsonb_build_object('company_status', c.status, 'subscription_status', v_sub.status)
  into v_previous
  from public.companies c
  where c.id = p_company_id;

  update public.companies
  set
    status = case
      when v_sub.status = 'expired' then 'Suspended'
      when v_sub.status = 'trialing' then 'Trial'
      else 'Active'
    end,
    suspension_reason = null,
    updated_at = now()
  where id = p_company_id
    and status = 'Suspended';

  perform public.sync_company_subscription_denormalized(p_company_id);
  select status into v_new_status from public.companies where id = p_company_id;

  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'restored', 'Subscription Restored', v_reason,
    jsonb_build_object('reason', p_reason, 'company_status', v_new_status)
  );

  perform public.write_billing_audit_log(
    'subscription_restored', p_company_id, v_previous,
    jsonb_build_object('company_status', v_new_status, 'reason', p_reason),
    'manual', jsonb_build_object('subscription_id', v_sub.id)
  );

  return jsonb_build_object('company_id', p_company_id, 'company_status', v_new_status);
end;
$$;

create or replace function internal.load_user_auth_context(p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, pg_temp
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
          c.approval_status,
          c.suspension_reason,
          c.approval_rejection_reason
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
