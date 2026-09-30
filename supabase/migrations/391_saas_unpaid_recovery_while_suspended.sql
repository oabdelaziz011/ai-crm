-- 391 — Allow SaaS online recovery when the company is Suspended because
-- the subscription clock ended (past_due / grace_period / expired).
-- Payment must restore access; administrative Suspended with a non-unpaid
-- subscription remains blocked from self-serve checkout.

create or replace function public.saas_subscription_is_unpaid_recovery(p_status text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_status, ''))) in ('past_due', 'grace_period', 'expired');
$$;

revoke all on function public.saas_subscription_is_unpaid_recovery(text) from public;
grant execute on function public.saas_subscription_is_unpaid_recovery(text) to authenticated, service_role;

comment on function public.saas_subscription_is_unpaid_recovery(text) is
  'True when subscription status may recover online even if companies.status is Suspended.';

-- When renewal moves an unpaid subscription back to active, clear company Suspended
-- before sync_company_subscription_denormalized would preserve it.
create or replace function public.trg_reactivate_company_on_paid_recovery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'active'
     and old.status is distinct from new.status
     and public.saas_subscription_is_unpaid_recovery(old.status) then
    update public.companies
    set
      status = 'Active',
      suspension_reason = null,
      updated_at = now()
    where id = new.company_id
      and status = 'Suspended';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_company_subscriptions_paid_recovery on public.company_subscriptions;
create trigger trg_company_subscriptions_paid_recovery
  after update of status on public.company_subscriptions
  for each row
  execute function public.trg_reactivate_company_on_paid_recovery();

-- Patch create_billing_checkout_session_v1: allow Suspended + unpaid recovery / expired.
do $$
declare
  v_def text;
  v_next text;
  v_old text;
  v_new text;
  v_oid oid;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_billing_checkout_session_v1'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'create_billing_checkout_session_v1 not found';
  end if;

  -- Normalize CRLF so replace matches Windows-stored function bodies and migration file EOLs.
  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

  v_old := replace($old$
  if v_company.status = 'Suspended' then
    return jsonb_build_object(
      'ok', false,
      'code', 'COMPANY_SUSPENDED',
      'message', 'Online payment is not available while the company is suspended'
    );
  end if;

  if v_company.approval_status = 'rejected' then
$old$, E'\r\n', E'\n');
  v_new := replace($new$
  if v_company.approval_status = 'rejected' then
$new$, E'\r\n', E'\n');
  v_next := replace(v_def, v_old, v_new);
  if v_next = v_def then
    raise exception '391 checkout patch: Suspended early-exit block not found (already patched?)';
  end if;
  v_def := v_next;

  v_old := replace($old$
  if v_sub.status not in ('active', 'past_due', 'grace_period', 'trialing') then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SUBSCRIPTION_STATE',
      'message', format('Online payment is not available for subscription status %s', v_sub.status)
    );
  end if;
$old$, E'\r\n', E'\n');
  v_new := replace($new$
  if v_company.status = 'Suspended'
     and not public.saas_subscription_is_unpaid_recovery(v_sub.status) then
    return jsonb_build_object(
      'ok', false,
      'code', 'COMPANY_SUSPENDED',
      'message', 'Online payment is not available while the company is suspended'
    );
  end if;

  if v_sub.status not in ('active', 'past_due', 'grace_period', 'trialing', 'expired') then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SUBSCRIPTION_STATE',
      'message', format('Online payment is not available for subscription status %s', v_sub.status)
    );
  end if;
$new$, E'\r\n', E'\n');
  v_next := replace(v_def, v_old, v_new);
  if v_next = v_def then
    raise exception '391 checkout patch: payable status gate not found';
  end if;

  execute v_next;
end;
$$;

-- Patch settle_saas_verified_payment_v1: allow Suspended recovery + expired renew.
do $$
declare
  v_def text;
  v_next text;
  v_old text;
  v_new text;
  v_oid oid;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'settle_saas_verified_payment_v1'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'settle_saas_verified_payment_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

  v_old := replace($old$
  if v_company.status = 'Suspended' then
    raise exception 'INVALID_SUBSCRIPTION_STATE: cannot settle payment for a suspended company';
  end if;

  v_approval := coalesce(v_company.approval_status, 'approved');
$old$, E'\r\n', E'\n');
  v_new := replace($new$
  -- Suspended is allowed only for unpaid-clock recovery (past_due/grace/expired).
  -- Checked after subscription row is locked below.

  v_approval := coalesce(v_company.approval_status, 'approved');
$new$, E'\r\n', E'\n');
  v_next := replace(v_def, v_old, v_new);
  if v_next = v_def then
    raise exception '391 settle patch: Suspended company guard not found';
  end if;
  v_def := v_next;

  v_old := replace($old$
  if v_sub.status in ('canceled', 'expired') then
    raise exception 'INVALID_SUBSCRIPTION_STATE: cannot settle payment for status %', v_sub.status;
  end if;
$old$, E'\r\n', E'\n');
  v_new := replace($new$
  if v_company.status = 'Suspended'
     and not public.saas_subscription_is_unpaid_recovery(v_sub.status) then
    raise exception 'INVALID_SUBSCRIPTION_STATE: cannot settle payment for a suspended company';
  end if;

  if v_sub.status = 'canceled' then
    raise exception 'INVALID_SUBSCRIPTION_STATE: cannot settle payment for status %', v_sub.status;
  end if;
$new$, E'\r\n', E'\n');
  v_next := replace(v_def, v_old, v_new);
  if v_next = v_def then
    raise exception '391 settle patch: canceled/expired gate not found';
  end if;
  v_def := v_next;

  v_old := replace($old$
  elsif v_prior_status in ('active', 'past_due', 'grace_period') then
$old$, E'\r\n', E'\n');
  v_new := replace($new$
  elsif v_prior_status in ('active', 'past_due', 'grace_period', 'expired') then
$new$, E'\r\n', E'\n');
  v_next := replace(v_def, v_old, v_new);
  if v_next = v_def then
    raise exception '391 settle patch: renew prior_status branch not found';
  end if;
  v_def := v_next;

  v_old := replace($old$
        when v_prior_status in ('past_due', 'grace_period') then 'RECOVERY_PAID'
$old$, E'\r\n', E'\n');
  v_new := replace($new$
        when v_prior_status in ('past_due', 'grace_period', 'expired') then 'RECOVERY_PAID'
$new$, E'\r\n', E'\n');
  v_next := replace(v_def, v_old, v_new);
  if v_next = v_def then
    raise exception '391 settle patch: RECOVERY_PAID settlement_code not found';
  end if;

  execute v_next;
end;
$$;
