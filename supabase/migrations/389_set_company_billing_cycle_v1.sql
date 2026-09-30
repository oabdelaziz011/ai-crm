/**
 * Migration 389 — Super admin sets subscription billing cycle (monthly/yearly).
 * LOCAL ONLY. Does not change package; only billing_cycle clock used for payable.
 */

create or replace function public.set_company_billing_cycle_v1(
  p_company_id uuid,
  p_billing_cycle text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.company_subscriptions%rowtype;
  v_cycle text := lower(nullif(trim(coalesce(p_billing_cycle, '')), ''));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_previous text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;
  if v_cycle is null or v_cycle not in ('monthly', 'yearly') then
    raise exception 'invalid_billing_cycle';
  end if;

  select * into v_sub
  from public.company_subscriptions
  where company_id = p_company_id
  order by created_at desc nulls last
  limit 1
  for update;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  if v_sub.plan_id is null then
    raise exception 'plan_required';
  end if;

  v_previous := v_sub.billing_cycle;

  if v_previous is not distinct from v_cycle then
    return jsonb_build_object(
      'ok', true,
      'unchanged', true,
      'company_id', p_company_id,
      'subscription_id', v_sub.id,
      'billing_cycle', v_cycle
    );
  end if;

  update public.company_subscriptions
  set billing_cycle = v_cycle, updated_at = now()
  where id = v_sub.id;

  update public.companies
  set billing_cycle = v_cycle, updated_at = now()
  where id = p_company_id;

  perform public.sync_company_subscription_denormalized(p_company_id);

  perform public.emit_subscription_event(
    p_company_id,
    v_sub.id,
    'billing_cycle_changed',
    'Billing cycle changed',
    coalesce(v_note, 'Super admin set subscription billing cycle'),
    jsonb_build_object(
      'previous_cycle', v_previous,
      'billing_cycle', v_cycle,
      'note', v_note,
      'source', 'set_company_billing_cycle_v1'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'unchanged', false,
    'company_id', p_company_id,
    'subscription_id', v_sub.id,
    'previous_cycle', v_previous,
    'billing_cycle', v_cycle
  );
end;
$$;

revoke all on function public.set_company_billing_cycle_v1(uuid, text, text) from public;
grant execute on function public.set_company_billing_cycle_v1(uuid, text, text) to authenticated, service_role;

comment on function public.set_company_billing_cycle_v1(uuid, text, text) is
  'Super admin sets monthly/yearly billing cycle for a company subscription without changing the package.';
