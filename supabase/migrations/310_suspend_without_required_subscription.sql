-- 310 — Suspend must persist company status/reason even when no subscription row exists.
-- Same RPC: internal.suspend_billing_subscription. Not a new suspend API.

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
  v_has_sub boolean := false;
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
  v_has_sub := found;

  select jsonb_build_object(
    'company_status', c.status,
    'subscription_status', case when v_has_sub then v_sub.status else null end
  )
  into v_previous
  from public.companies c
  where c.id = p_company_id;

  update public.companies
  set
    status = 'Suspended',
    suspension_reason = v_reason,
    updated_at = now()
  where id = p_company_id;

  if v_has_sub then
    perform public.emit_subscription_event(
      p_company_id, v_sub.id, 'suspended', 'Subscription Suspended', v_reason,
      jsonb_build_object('reason', v_reason)
    );
  end if;

  perform public.write_billing_audit_log(
    'subscription_suspended', p_company_id, v_previous,
    jsonb_build_object('company_status', 'Suspended', 'reason', v_reason),
    'manual', jsonb_build_object('subscription_id', case when v_has_sub then v_sub.id else null end)
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'company_status', 'Suspended',
    'suspension_reason', v_reason
  );
end;
$$;
