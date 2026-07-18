-- ============================================================
-- Vault OS – Billing Phase A (UI hardening RPCs)
-- Server-side overview filter/sort, audit stats, billing.edit workflows
-- ============================================================

-- ── Permission helpers ────────────────────────────────────────

create or replace function public.can_edit_billing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.user_has_permission('billing.edit')
    or public.user_has_permission('subscriptions.edit');
$$;

create or replace function public.can_export_billing_audit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.user_has_permission('billing.audit.export');
$$;

-- ── Overview list: cycle filter + server sort ─────────────────

create or replace function public.list_company_subscriptions_paged(
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_status text default null,
  p_billing_cycle text default null,
  p_sort_by text default 'renewal',
  p_sort_dir text default 'desc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_rows jsonb;
  v_stats jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_sort_by text := lower(coalesce(nullif(trim(p_sort_by), ''), 'renewal'));
  v_sort_dir text := lower(coalesce(nullif(trim(p_sort_dir), ''), 'desc'));
  v_order_clause text;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_view_own_billing() then raise exception 'Insufficient permissions'; end if;

  if v_sort_dir not in ('asc', 'desc') then
    raise exception 'Invalid sort direction: %', p_sort_dir;
  end if;

  v_order_clause := case v_sort_by
    when 'company' then 'c.name ' || v_sort_dir || ' nulls last'
    when 'plan' then 'coalesce(p.display_name, p.name, '''') ' || v_sort_dir || ' nulls last'
    when 'status' then 'cs.status ' || v_sort_dir || ' nulls last'
    when 'renewal' then 'coalesce(cs.next_renewal_at, cs.current_period_end) ' || v_sort_dir || ' nulls last'
    when 'updated_at' then 'cs.updated_at ' || v_sort_dir || ' nulls last'
    else 'coalesce(cs.next_renewal_at, cs.current_period_end) ' || v_sort_dir || ' nulls last'
  end;

  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where cs.status = 'active'),
    'trialing', count(*) filter (where cs.status = 'trialing'),
    'at_risk', count(*) filter (where cs.status in ('past_due', 'grace_period'))
  ) into v_stats
  from public.company_subscriptions cs
  where public.is_platform_billing_operator() or cs.company_id = public.current_company_id();

  execute format(
    $sql$
    select count(*) from public.company_subscriptions cs
    join public.companies c on c.id = cs.company_id
    left join public.plans p on p.id = cs.plan_id
    where (public.is_platform_billing_operator() or cs.company_id = public.current_company_id())
      and ($1 is null or $1 = 'all' or cs.status = $1)
      and ($2 is null or $2 = 'all' or cs.billing_cycle = $2)
      and (
        $3 is null or trim($3) = ''
        or c.name ilike '%%' || trim($3) || '%%'
        or coalesce(p.display_name, p.name, '') ilike '%%' || trim($3) || '%%'
      )
    $sql$
  ) into v_total using p_status, p_billing_cycle, p_search;

  execute format(
    $sql$
    select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
    from (
      select cs.*,
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'logo_url', c.logo_url,
          'company_type', c.company_type,
          'status', c.status
        ) as company,
        to_jsonb(p.*) as plan
      from public.company_subscriptions cs
      join public.companies c on c.id = cs.company_id
      left join public.plans p on p.id = cs.plan_id
      where (public.is_platform_billing_operator() or cs.company_id = public.current_company_id())
        and ($1 is null or $1 = 'all' or cs.status = $1)
        and ($2 is null or $2 = 'all' or cs.billing_cycle = $2)
        and (
          $3 is null or trim($3) = ''
          or c.name ilike '%%' || trim($3) || '%%'
          or coalesce(p.display_name, p.name, '') ilike '%%' || trim($3) || '%%'
        )
      order by %s
      limit $4 offset $5
    ) row_data
    $sql$,
    v_order_clause
  ) into v_rows using p_status, p_billing_cycle, p_search, v_limit, v_offset;

  return jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows,
    'stats', v_stats
  );
end;
$$;

-- ── Audit list: dataset-wide source stats ───────────────────

create or replace function public.list_billing_audit_logs_paged(
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_event_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_manual bigint;
  v_system bigint;
  v_api bigint;
  v_rows jsonb;
  v_stats jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_view_billing_audit(null) and not public.is_platform_billing_operator() then
    raise exception 'Insufficient permissions to view billing audit log';
  end if;

  select
    count(*),
    count(*) filter (where bal.source = 'manual'),
    count(*) filter (where bal.source = 'system'),
    count(*) filter (where bal.source = 'api')
  into v_total, v_manual, v_system, v_api
  from public.billing_audit_logs bal
  left join public.companies c on c.id = bal.company_id
  where (
    public.is_super_admin()
    or public.user_has_permission('billing.audit.view')
    or (bal.company_id = public.current_company_id() and public.user_has_permission('billing.audit.view'))
  )
  and (p_event_type is null or p_event_type = 'all' or bal.event_type = p_event_type)
  and (
    p_search is null or trim(p_search) = ''
    or bal.event_type ilike '%' || trim(p_search) || '%'
    or coalesce(c.name, '') ilike '%' || trim(p_search) || '%'
    or bal.source ilike '%' || trim(p_search) || '%'
  );

  v_stats := jsonb_build_object(
    'total', v_total,
    'manual', v_manual,
    'system', v_system,
    'api', v_api
  );

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
  from (
    select bal.*, jsonb_build_object('id', c.id, 'name', c.name, 'logo_url', c.logo_url) as company
    from public.billing_audit_logs bal
    left join public.companies c on c.id = bal.company_id
    where (
      public.is_super_admin()
      or public.user_has_permission('billing.audit.view')
      or (bal.company_id = public.current_company_id() and public.user_has_permission('billing.audit.view'))
    )
    and (p_event_type is null or p_event_type = 'all' or bal.event_type = p_event_type)
    and (
      p_search is null or trim(p_search) = ''
      or bal.event_type ilike '%' || trim(p_search) || '%'
      or coalesce(c.name, '') ilike '%' || trim(p_search) || '%'
      or bal.source ilike '%' || trim(p_search) || '%'
    )
    order by bal.occurred_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows, 'stats', v_stats);
end;
$$;

-- ── billing.edit workflows ────────────────────────────────────

create or replace function public.upsert_billing_contact(
  p_company_id uuid,
  p_name text,
  p_email text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous jsonb;
  v_contact_id uuid;
  v_name text := trim(p_name);
  v_email text := trim(p_email);
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_edit_billing() then raise exception 'Insufficient permissions to edit billing contact'; end if;
  if not public.can_view_billing_company(p_company_id) then raise exception 'Cannot edit billing contact for this company'; end if;
  if v_name is null or length(v_name) = 0 then raise exception 'Billing contact name is required'; end if;
  if v_email is null or length(v_email) = 0 then raise exception 'Billing contact email is required'; end if;

  select to_jsonb(bc.*) into v_previous
  from public.company_billing_contacts bc
  where bc.company_id = p_company_id and bc.is_active = true
  limit 1;

  update public.company_billing_contacts
  set is_active = false, updated_at = now()
  where company_id = p_company_id and is_active = true;

  insert into public.company_billing_contacts (company_id, name, email, phone, is_active)
  values (p_company_id, v_name, v_email, v_phone, true)
  returning id into v_contact_id;

  perform public.write_billing_audit_log(
    'billing_contact_changed', p_company_id,
    coalesce(v_previous, '{}'::jsonb),
    jsonb_build_object('id', v_contact_id, 'name', v_name, 'email', v_email, 'phone', v_phone),
    'manual', jsonb_build_object('contact_id', v_contact_id)
  );

  return jsonb_build_object('id', v_contact_id, 'name', v_name, 'email', v_email, 'phone', v_phone);
end;
$$;

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
declare
  v_sub public.company_subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_previous jsonb;
  v_cycle text;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_edit_billing() then raise exception 'Insufficient permissions to assign subscription plan'; end if;
  if not public.can_view_billing_company(p_company_id) then raise exception 'Cannot assign plan for this company'; end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active = true;
  if not found then raise exception 'Plan not found or inactive'; end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then raise exception 'Subscription not found for company %', p_company_id; end if;

  v_cycle := coalesce(nullif(trim(p_billing_cycle), ''), v_sub.billing_cycle);
  if v_cycle not in ('monthly', 'yearly') then raise exception 'Invalid billing cycle: %', v_cycle; end if;

  v_previous := jsonb_build_object(
    'plan_id', v_sub.plan_id,
    'billing_cycle', v_sub.billing_cycle,
    'status', v_sub.status
  );

  update public.company_subscriptions
  set plan_id = p_plan_id, billing_cycle = v_cycle, updated_at = now()
  where id = v_sub.id;

  perform public.sync_company_subscription_denormalized(p_company_id);

  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'plan_changed', 'Plan Changed',
    coalesce(v_plan.display_name, v_plan.name),
    jsonb_build_object('plan_id', p_plan_id, 'billing_cycle', v_cycle, 'previous_plan_id', v_sub.plan_id)
  );

  perform public.write_billing_audit_log(
    'plan_changed', p_company_id, v_previous,
    jsonb_build_object('plan_id', p_plan_id, 'billing_cycle', v_cycle),
    'manual', jsonb_build_object('plan_code', v_plan.code)
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'plan_id', p_plan_id,
    'billing_cycle', v_cycle
  );
end;
$$;

create or replace function public.suspend_billing_subscription(
  p_company_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_previous jsonb;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_edit_billing() then raise exception 'Insufficient permissions to suspend subscription'; end if;
  if not public.can_view_billing_company(p_company_id) then raise exception 'Cannot suspend subscription for this company'; end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then raise exception 'Subscription not found for company %', p_company_id; end if;

  select jsonb_build_object('company_status', c.status, 'subscription_status', v_sub.status)
  into v_previous
  from public.companies c where c.id = p_company_id;

  update public.companies set status = 'Suspended', updated_at = now() where id = p_company_id;

  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'suspended', 'Subscription Suspended',
    coalesce(nullif(trim(p_reason), ''), 'Administrative suspension'),
    jsonb_build_object('reason', p_reason)
  );

  perform public.write_billing_audit_log(
    'subscription_suspended', p_company_id, v_previous,
    jsonb_build_object('company_status', 'Suspended', 'reason', p_reason),
    'manual', jsonb_build_object('subscription_id', v_sub.id)
  );

  return jsonb_build_object('company_id', p_company_id, 'company_status', 'Suspended');
end;
$$;

create or replace function public.restore_billing_subscription(
  p_company_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_previous jsonb;
  v_new_status text;
begin
  if auth.role() <> 'authenticated' then raise exception 'Authentication required'; end if;
  if not public.can_edit_billing() then raise exception 'Insufficient permissions to restore subscription'; end if;
  if not public.can_view_billing_company(p_company_id) then raise exception 'Cannot restore subscription for this company'; end if;

  select * into v_sub from public.company_subscriptions where company_id = p_company_id for update;
  if not found then raise exception 'Subscription not found for company %', p_company_id; end if;

  select jsonb_build_object('company_status', c.status, 'subscription_status', v_sub.status)
  into v_previous
  from public.companies c where c.id = p_company_id;

  perform public.sync_company_subscription_denormalized(p_company_id);

  select status into v_new_status from public.companies where id = p_company_id;

  perform public.emit_subscription_event(
    p_company_id, v_sub.id, 'restored', 'Subscription Restored',
    coalesce(nullif(trim(p_reason), ''), 'Administrative restore'),
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

-- ── REVOKE / GRANT ────────────────────────────────────────────

revoke all on function public.list_company_subscriptions_paged(integer, integer, text, text) from public;
revoke all on function public.list_company_subscriptions_paged(integer, integer, text, text) from authenticated;

revoke all on function public.list_company_subscriptions_paged(integer, integer, text, text, text, text, text) from public;
grant execute on function public.list_company_subscriptions_paged(integer, integer, text, text, text, text, text) to authenticated;

revoke all on function public.list_billing_audit_logs_paged(integer, integer, text, text) from public;
grant execute on function public.list_billing_audit_logs_paged(integer, integer, text, text) to authenticated;

revoke all on function public.can_edit_billing() from public;
grant execute on function public.can_edit_billing() to authenticated;

revoke all on function public.can_export_billing_audit() from public;
grant execute on function public.can_export_billing_audit() to authenticated;

revoke all on function public.upsert_billing_contact(uuid, text, text, text) from public;
grant execute on function public.upsert_billing_contact(uuid, text, text, text) to authenticated;

revoke all on function public.assign_subscription_plan(uuid, uuid, text) from public;
grant execute on function public.assign_subscription_plan(uuid, uuid, text) to authenticated;

revoke all on function public.suspend_billing_subscription(uuid, text) from public;
grant execute on function public.suspend_billing_subscription(uuid, text) to authenticated;

revoke all on function public.restore_billing_subscription(uuid, text) from public;
grant execute on function public.restore_billing_subscription(uuid, text) to authenticated;
