-- 392 — Hard subscription lock when companies.status = Suspended.
-- Reuses existing is_feature_enabled + RLS (RESTRICTIVE). Does not add a
-- parallel access-state system.
--
-- Proven gap (local audit): Suspended previously denied only commercial
-- features; core tables (e.g. customers) remained readable via PostgREST.
-- Billing recovery paths stay allowlisted (subscriptions, invoices, checkout).

-- ── 1. Helper: workspace unlocked? ──────────────────────────────────
create or replace function public.company_workspace_unlocked(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_company_id is null then
    return false;
  end if;

  -- Platform operators retain read/manage for support; tenant lock is for members.
  if public.is_super_admin() then
    return true;
  end if;

  select c.status into v_status
  from public.companies c
  where c.id = p_company_id;

  if not found then
    return false;
  end if;

  return v_status is distinct from 'Suspended';
end;
$$;

revoke all on function public.company_workspace_unlocked(uuid) from public, anon;
grant execute on function public.company_workspace_unlocked(uuid) to authenticated, service_role;

comment on function public.company_workspace_unlocked(uuid) is
  'False when companies.status=Suspended (tenant hard lock). Super-admin bypass. Used by RESTRICTIVE RLS.';

-- ── 2. is_feature_enabled: Suspended denies ALL features (not only commercial)
do $$
declare
  v_def text;
  v_next text;
  v_oid oid;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'internal'
    and p.proname = 'is_feature_enabled'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'internal.is_feature_enabled not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

  v_next := replace(
    v_def,
    replace($old$
  if v_company_status = 'Suspended' and v_commercial then
    return false;
  end if;
$old$, E'\r\n', E'\n'),
    replace($new$
  -- Hard subscription lock: Suspended blocks core + commercial features.
  -- Billing recovery does not consult is_feature_enabled (checkout RPCs).
  if v_company_status = 'Suspended' then
    return false;
  end if;
$new$, E'\r\n', E'\n')
  );

  if v_next = v_def then
    -- Idempotent if already patched
    if position('Hard subscription lock: Suspended blocks core' in v_def) > 0 then
      raise notice '392 is_feature_enabled already patched';
      return;
    end if;
    raise exception '392 is_feature_enabled Suspended gate not found';
  end if;

  execute v_next;
end;
$$;

comment on function internal.is_feature_enabled(uuid, text) is
  'Canonical feature resolver. Suspended denies all features (workspace hard lock). Billing recovery uses checkout RPCs, not this gate.';

-- ── 3. RESTRICTIVE RLS on business tables (skip billing/auth allowlist)
do $$
declare
  r record;
  v_policy text;
  v_allow text[] := array[
    'profiles',
    'roles',
    'company_subscriptions',
    'company_billing_contacts',
    'company_billing_profiles',
    'company_payment_methods',
    'company_commercial_terms',
    'company_financial_settings',
    'billing_audit_logs',
    'billing_checkout_sessions',
    'billing_invoices',
    'billing_notification_events',
    'billing_payments',
    'billing_receipts',
    'subscription_events',
    'payment_intents',
    'tax_configurations',
    'company_resource_limits',
    'company_usage_limit_overrides',
    'company_usage_snapshots',
    'company_user_seat_reservations'
  ];
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attname = 'company_id'
      and a.attnum > 0
      and not a.attisdropped
      and c.relrowsecurity = true
      and not (c.relname = any (v_allow))
    order by c.relname
  loop
    v_policy := 'rls_workspace_lock_suspended_' || r.table_name;
    execute format('drop policy if exists %I on public.%I', v_policy, r.table_name);
    execute format(
      $p$
      create policy %I on public.%I
      as restrictive
      for all
      to authenticated
      using (public.company_workspace_unlocked(company_id))
      with check (public.company_workspace_unlocked(company_id))
      $p$,
      v_policy,
      r.table_name
    );
  end loop;
end;
$$;
