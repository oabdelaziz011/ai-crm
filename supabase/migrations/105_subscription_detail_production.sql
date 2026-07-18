-- ============================================================
-- Vault OS – Subscription Detail production readiness
-- Bug 3: audit RPC company_id filter
-- Bugs 4–5: demo subscription events + notification history
-- ============================================================

-- Grace period notification catalog entry (referenced by migration 104)
insert into public.billing_event_catalog (code, domain, label, default_channels)
values ('billing.subscription.grace_period', 'billing', 'Grace Period Started', array['email', 'in_app'])
on conflict (code) do update
set label = excluded.label, domain = excluded.domain, default_channels = excluded.default_channels, is_active = true;

-- ── Audit RPC: backend company_id filter ─────────────────────

create or replace function public.list_billing_audit_logs_paged(
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_event_type text default null,
  p_for_export boolean default false,
  p_company_id uuid default null
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

  if coalesce(p_for_export, false) then
    if not public.can_export_billing_audit() then
      raise exception 'Insufficient permissions to export billing audit log';
    end if;
  elsif not public.can_view_billing_audit(null) and not public.is_platform_billing_operator() then
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
    or (coalesce(p_for_export, false) and public.can_export_billing_audit())
  )
  and (p_company_id is null or bal.company_id = p_company_id)
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
      or (coalesce(p_for_export, false) and public.can_export_billing_audit())
    )
    and (p_company_id is null or bal.company_id = p_company_id)
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

  return jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows,
    'stats', v_stats
  );
end;
$$;

revoke all on function public.list_billing_audit_logs_paged(integer, integer, text, text, boolean, uuid) from public;
grant execute on function public.list_billing_audit_logs_paged(integer, integer, text, text, boolean, uuid) to authenticated;

-- ── Demo seed repair: timeline, activity, notifications ───────

create or replace function public.repair_subscription_detail_demo_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_now timestamptz := now();
  v_meta jsonb := '{"demo": true, "demo_env": "vaultos_enterprise_v1", "is_demo_data": true}'::jsonb;
  v_platform uuid := 'd0000001-0001-4001-8001-000000000001'::uuid;
  v_alpha_admin uuid := 'd0000002-0001-4001-8001-000000000001'::uuid;
  v_beta_admin uuid := 'd0000002-0001-4001-8001-000000000002'::uuid;
  v_gamma_admin uuid := 'd0000002-0001-4001-8001-000000000003'::uuid;
  v_c_alpha uuid := 'd0000010-0001-4001-8001-000000000001'::uuid;
  v_c_beta uuid := 'd0000010-0001-4001-8001-000000000002'::uuid;
  v_c_gamma uuid := 'd0000010-0001-4001-8001-000000000003'::uuid;
  v_c_delta uuid := 'd0000010-0001-4001-8001-000000000004'::uuid;
  v_c_epsilon uuid := 'd0000010-0001-4001-8001-000000000005'::uuid;
  v_s_alpha uuid := 'd0000020-0001-4001-8001-000000000001'::uuid;
  v_s_beta uuid := 'd0000020-0001-4001-8001-000000000002'::uuid;
  v_s_gamma uuid := 'd0000020-0001-4001-8001-000000000003'::uuid;
  v_s_delta uuid := 'd0000020-0001-4001-8001-000000000004'::uuid;
  v_s_epsilon uuid := 'd0000020-0001-4001-8001-000000000005'::uuid;
begin
  if not exists (select 1 from public.companies where id = v_c_alpha and company_type = 'demo') then
    return jsonb_build_object('status', 'skipped', 'reason', 'demo_companies_not_seeded');
  end if;

  -- Subscription events — all five demo companies
  insert into public.subscription_events (id, company_id, subscription_id, event_type, title, description, metadata, occurred_at)
  values
    -- Alpha (trial)
    ('d0000201-0001-4001-8001-000000000001'::uuid, v_c_alpha, v_s_alpha, 'subscription_created', 'DEMO Subscription Created', 'Trial subscription started on Basic plan', v_meta, v_now - interval '14 days'),
    ('d0000201-0001-4001-8001-000000000002'::uuid, v_c_alpha, v_s_alpha, 'invoice_generated', 'DEMO Invoice Generated', 'Trial invoice DEMO-INV-ALPHA-001 issued', v_meta, v_now - interval '10 days'),
    ('d0000201-0001-4001-8001-000000000003'::uuid, v_c_alpha, v_s_alpha, 'payment_received', 'DEMO Payment Received', '29 USD trial payment recorded', v_meta, v_now - interval '8 days'),
    ('d0000201-0001-4001-8001-000000000004'::uuid, v_c_alpha, v_s_alpha, 'renewed', 'DEMO Subscription Renewed', 'Trial period extended', v_meta, v_now - interval '6 days'),
    ('d0000201-0001-4001-8001-000000000005'::uuid, v_c_alpha, v_s_alpha, 'plan_changed', 'DEMO Plan Changed', 'Upgraded from Basic to Pro preview', v_meta, v_now - interval '4 days'),
    ('d0000201-0001-4001-8001-000000000006'::uuid, v_c_alpha, v_s_alpha, 'notification_sent', 'DEMO Notification Sent', 'Trial expiring reminder delivered', v_meta, v_now - interval '2 days'),
    -- Beta (active pro)
    ('d0000202-0001-4001-8001-000000000001'::uuid, v_c_beta, v_s_beta, 'subscription_created', 'DEMO Subscription Created', 'Professional subscription activated', v_meta, v_now - interval '90 days'),
    ('d0000202-0001-4001-8001-000000000002'::uuid, v_c_beta, v_s_beta, 'invoice_generated', 'DEMO Invoice Generated', 'Monthly invoice DEMO-INV-001 issued', v_meta, v_now - interval '20 days'),
    ('d0000202-0001-4001-8001-000000000003'::uuid, v_c_beta, v_s_beta, 'renewed', 'DEMO Subscription Renewed', 'Monthly renewal completed', v_meta, v_now - interval '20 days'),
    ('d0000202-0001-4001-8001-000000000004'::uuid, v_c_beta, v_s_beta, 'plan_changed', 'DEMO Plan Changed', 'Plan confirmed on Professional tier', v_meta, v_now - interval '60 days'),
    ('d0000202-0001-4001-8001-000000000005'::uuid, v_c_beta, v_s_beta, 'notification_sent', 'DEMO Notification Sent', 'Payment success notification delivered', v_meta, v_now - interval '5 days'),
    -- Gamma (enterprise)
    ('d0000203-0001-4001-8001-000000000001'::uuid, v_c_gamma, v_s_gamma, 'subscription_created', 'DEMO Subscription Created', 'Enterprise subscription activated', v_meta, v_now - interval '365 days'),
    ('d0000203-0001-4001-8001-000000000002'::uuid, v_c_gamma, v_s_gamma, 'invoice_generated', 'DEMO Invoice Generated', 'Annual invoice DEMO-INV-ENT-001 issued', v_meta, v_now - interval '60 days'),
    ('d0000203-0001-4001-8001-000000000003'::uuid, v_c_gamma, v_s_gamma, 'payment_received', 'DEMO Payment Received', '999 USD annual payment recorded', v_meta, v_now - interval '58 days'),
    ('d0000203-0001-4001-8001-000000000004'::uuid, v_c_gamma, v_s_gamma, 'renewed', 'DEMO Subscription Renewed', 'Annual renewal scheduled', v_meta, v_now - interval '30 days'),
    ('d0000203-0001-4001-8001-000000000005'::uuid, v_c_gamma, v_s_gamma, 'plan_changed', 'DEMO Plan Changed', 'Upgraded to Enterprise plan', v_meta, v_now - interval '70 days'),
    ('d0000203-0001-4001-8001-000000000006'::uuid, v_c_gamma, v_s_gamma, 'notification_sent', 'DEMO Notification Sent', 'Invoice generated notification delivered', v_meta, v_now - interval '60 days'),
    -- Delta (expired)
    ('d0000204-0001-4001-8001-000000000001'::uuid, v_c_delta, v_s_delta, 'subscription_created', 'DEMO Subscription Created', 'Professional subscription started', v_meta, v_now - interval '120 days'),
    ('d0000204-0001-4001-8001-000000000002'::uuid, v_c_delta, v_s_delta, 'invoice_generated', 'DEMO Invoice Generated', 'Final invoice DEMO-INV-VOID-001 issued', v_meta, v_now - interval '90 days'),
    ('d0000204-0001-4001-8001-000000000003'::uuid, v_c_delta, v_s_delta, 'payment_received', 'DEMO Payment Received', 'Last payment before expiration', v_meta, v_now - interval '75 days'),
    ('d0000204-0001-4001-8001-000000000004'::uuid, v_c_delta, v_s_delta, 'renewed', 'DEMO Subscription Renewed', 'Last successful renewal', v_meta, v_now - interval '60 days'),
    ('d0000204-0001-4001-8001-000000000005'::uuid, v_c_delta, v_s_delta, 'plan_changed', 'DEMO Plan Changed', 'Moved to Professional plan', v_meta, v_now - interval '100 days'),
    ('d0000204-0001-4001-8001-000000000006'::uuid, v_c_delta, v_s_delta, 'grace_period_started', 'DEMO Grace Period Started', 'Renewal failed — grace period active', v_meta, v_now - interval '35 days'),
    ('d0000204-0001-4001-8001-000000000007'::uuid, v_c_delta, v_s_delta, 'notification_sent', 'DEMO Notification Sent', 'Grace period notice delivered', v_meta, v_now - interval '35 days'),
    -- Epsilon (suspended/restored)
    ('d0000205-0001-4001-8001-000000000001'::uuid, v_c_epsilon, v_s_epsilon, 'subscription_created', 'DEMO Subscription Created', 'Professional subscription activated', v_meta, v_now - interval '180 days'),
    ('d0000205-0001-4001-8001-000000000002'::uuid, v_c_epsilon, v_s_epsilon, 'invoice_generated', 'DEMO Invoice Generated', 'Monthly invoice issued', v_meta, v_now - interval '30 days'),
    ('d0000205-0001-4001-8001-000000000003'::uuid, v_c_epsilon, v_s_epsilon, 'payment_received', 'DEMO Payment Received', '99 USD payment recorded', v_meta, v_now - interval '15 days'),
    ('d0000205-0001-4001-8001-000000000004'::uuid, v_c_epsilon, v_s_epsilon, 'renewed', 'DEMO Subscription Renewed', 'Monthly renewal completed', v_meta, v_now - interval '15 days'),
    ('d0000205-0001-4001-8001-000000000005'::uuid, v_c_epsilon, v_s_epsilon, 'plan_changed', 'DEMO Plan Changed', 'Plan adjusted after review', v_meta, v_now - interval '45 days'),
    ('d0000205-0001-4001-8001-000000000006'::uuid, v_c_epsilon, v_s_epsilon, 'notification_sent', 'DEMO Notification Sent', 'Plan change notification delivered', v_meta, v_now - interval '45 days')
  on conflict (id) do update
  set event_type = excluded.event_type, title = excluded.title, description = excluded.description,
      metadata = excluded.metadata, occurred_at = excluded.occurred_at;

  -- Billing audit entries for companies missing plan_changed history
  insert into public.billing_audit_logs (id, event_type, company_id, user_id, source, metadata, occurred_at)
  values
    ('d0000221-0001-4001-8001-000000000001'::uuid, 'plan_changed', v_c_alpha, v_platform, 'manual', v_meta || '{"plan_code":"pro"}'::jsonb, v_now - interval '4 days'),
    ('d0000221-0001-4001-8001-000000000002'::uuid, 'manual_payment_recorded', v_c_alpha, v_platform, 'manual', v_meta, v_now - interval '8 days'),
    ('d0000221-0001-4001-8001-000000000003'::uuid, 'plan_changed', v_c_delta, v_platform, 'manual', v_meta || '{"plan_code":"pro"}'::jsonb, v_now - interval '100 days'),
    ('d0000221-0001-4001-8001-000000000004'::uuid, 'manual_payment_recorded', v_c_gamma, v_platform, 'manual', v_meta, v_now - interval '58 days')
  on conflict (id) do nothing;

  -- Notification history — six billing lifecycle types per demo company
  insert into public.notifications (id, company_id, user_id, title, message, type, category, is_read, created_at)
  values
    -- Alpha
    ('d0000210-0001-4001-8001-000000000001'::uuid, v_c_alpha, v_alpha_admin, 'notifications.events.billing.paymentSucceeded.title', '{"messageKey":"notifications.events.billing.paymentSucceeded.message","params":{"amount":"29","currency":"USD"}}', 'success', 'subscription', false, v_now - interval '8 days'),
    ('d0000210-0001-4001-8001-000000000002'::uuid, v_c_alpha, v_alpha_admin, 'notifications.events.billing.invoiceGenerated.title', '{"messageKey":"notifications.events.billing.invoiceGenerated.message","params":{"invoiceNumber":"DEMO-INV-ALPHA-001"}}', 'info', 'invoice', false, v_now - interval '10 days'),
    ('d0000210-0001-4001-8001-000000000003'::uuid, v_c_alpha, v_alpha_admin, 'notifications.events.billing.subscriptionRenewed.title', '{"messageKey":"notifications.events.billing.subscriptionRenewed.message","params":{"cycle":"monthly"}}', 'success', 'subscription', true, v_now - interval '6 days'),
    ('d0000210-0001-4001-8001-000000000004'::uuid, v_c_alpha, v_alpha_admin, 'notifications.events.billing.planChanged.title', '{"messageKey":"notifications.events.billing.planChanged.message","params":{"planName":"Pro"}}', 'info', 'subscription', false, v_now - interval '4 days'),
    ('d0000210-0001-4001-8001-000000000005'::uuid, v_c_alpha, v_alpha_admin, 'notifications.events.billing.trialExpiring.title', '{"messageKey":"notifications.events.billing.trialExpiring.message","params":{"daysRemaining":"7"}}', 'warning', 'subscription', false, v_now - interval '2 days'),
    ('d0000210-0001-4001-8001-000000000006'::uuid, v_c_alpha, v_alpha_admin, 'notifications.events.billing.gracePeriodStarted.title', '{"messageKey":"notifications.events.billing.gracePeriodStarted.message","params":{"daysRemaining":"7"}}', 'warning', 'subscription', true, v_now - interval '1 day'),
    -- Beta
    ('d0000211-0001-4001-8001-000000000001'::uuid, v_c_beta, v_beta_admin, 'notifications.events.billing.paymentSucceeded.title', '{"messageKey":"notifications.events.billing.paymentSucceeded.message","params":{"amount":"99","currency":"USD"}}', 'success', 'subscription', false, v_now - interval '5 days'),
    ('d0000211-0001-4001-8001-000000000002'::uuid, v_c_beta, v_beta_admin, 'notifications.events.billing.invoiceGenerated.title', '{"messageKey":"notifications.events.billing.invoiceGenerated.message","params":{"invoiceNumber":"DEMO-INV-001"}}', 'info', 'invoice', false, v_now - interval '20 days'),
    ('d0000211-0001-4001-8001-000000000003'::uuid, v_c_beta, v_beta_admin, 'notifications.events.billing.subscriptionRenewed.title', '{"messageKey":"notifications.events.billing.subscriptionRenewed.message","params":{"cycle":"monthly"}}', 'success', 'subscription', true, v_now - interval '20 days'),
    ('d0000211-0001-4001-8001-000000000004'::uuid, v_c_beta, v_beta_admin, 'notifications.events.billing.planChanged.title', '{"messageKey":"notifications.events.billing.planChanged.message","params":{"planName":"Professional"}}', 'info', 'subscription', true, v_now - interval '60 days'),
    ('d0000211-0001-4001-8001-000000000005'::uuid, v_c_beta, v_beta_admin, 'notifications.events.billing.trialExpiring.title', '{"messageKey":"notifications.events.billing.trialExpiring.message","params":{"daysRemaining":"3"}}', 'warning', 'subscription', true, v_now - interval '30 days'),
    ('d0000211-0001-4001-8001-000000000006'::uuid, v_c_beta, v_beta_admin, 'notifications.events.billing.gracePeriodStarted.title', '{"messageKey":"notifications.events.billing.gracePeriodStarted.message","params":{"daysRemaining":"5"}}', 'warning', 'subscription', true, v_now - interval '15 days'),
    -- Gamma
    ('d0000212-0001-4001-8001-000000000001'::uuid, v_c_gamma, v_gamma_admin, 'notifications.events.billing.paymentSucceeded.title', '{"messageKey":"notifications.events.billing.paymentSucceeded.message","params":{"amount":"999","currency":"USD"}}', 'success', 'subscription', false, v_now - interval '58 days'),
    ('d0000212-0001-4001-8001-000000000002'::uuid, v_c_gamma, v_gamma_admin, 'notifications.events.billing.invoiceGenerated.title', '{"messageKey":"notifications.events.billing.invoiceGenerated.message","params":{"invoiceNumber":"DEMO-INV-ENT-001"}}', 'info', 'invoice', false, v_now - interval '60 days'),
    ('d0000212-0001-4001-8001-000000000003'::uuid, v_c_gamma, v_gamma_admin, 'notifications.events.billing.subscriptionRenewed.title', '{"messageKey":"notifications.events.billing.subscriptionRenewed.message","params":{"cycle":"yearly"}}', 'success', 'subscription', true, v_now - interval '30 days'),
    ('d0000212-0001-4001-8001-000000000004'::uuid, v_c_gamma, v_gamma_admin, 'notifications.events.billing.planChanged.title', '{"messageKey":"notifications.events.billing.planChanged.message","params":{"planName":"Enterprise"}}', 'info', 'subscription', true, v_now - interval '70 days'),
    ('d0000212-0001-4001-8001-000000000005'::uuid, v_c_gamma, v_gamma_admin, 'notifications.events.billing.trialExpiring.title', '{"messageKey":"notifications.events.billing.trialExpiring.message","params":{"daysRemaining":"14"}}', 'warning', 'subscription', true, v_now - interval '300 days'),
    ('d0000212-0001-4001-8001-000000000006'::uuid, v_c_gamma, v_gamma_admin, 'notifications.events.billing.gracePeriodStarted.title', '{"messageKey":"notifications.events.billing.gracePeriodStarted.message","params":{"daysRemaining":"7"}}', 'warning', 'subscription', true, v_now - interval '200 days'),
    -- Delta
    ('d0000213-0001-4001-8001-000000000001'::uuid, v_c_delta, v_platform, 'notifications.events.billing.paymentSucceeded.title', '{"messageKey":"notifications.events.billing.paymentSucceeded.message","params":{"amount":"99","currency":"USD"}}', 'success', 'subscription', true, v_now - interval '75 days'),
    ('d0000213-0001-4001-8001-000000000002'::uuid, v_c_delta, v_platform, 'notifications.events.billing.invoiceGenerated.title', '{"messageKey":"notifications.events.billing.invoiceGenerated.message","params":{"invoiceNumber":"DEMO-INV-VOID-001"}}', 'info', 'invoice', true, v_now - interval '90 days'),
    ('d0000213-0001-4001-8001-000000000003'::uuid, v_c_delta, v_platform, 'notifications.events.billing.subscriptionRenewed.title', '{"messageKey":"notifications.events.billing.subscriptionRenewed.message","params":{"cycle":"monthly"}}', 'success', 'subscription', true, v_now - interval '60 days'),
    ('d0000213-0001-4001-8001-000000000004'::uuid, v_c_delta, v_platform, 'notifications.events.billing.planChanged.title', '{"messageKey":"notifications.events.billing.planChanged.message","params":{"planName":"Professional"}}', 'info', 'subscription', true, v_now - interval '100 days'),
    ('d0000213-0001-4001-8001-000000000005'::uuid, v_c_delta, v_platform, 'notifications.events.billing.trialExpiring.title', '{"messageKey":"notifications.events.billing.trialExpiring.message","params":{"daysRemaining":"5"}}', 'warning', 'subscription', true, v_now - interval '110 days'),
    ('d0000213-0001-4001-8001-000000000006'::uuid, v_c_delta, v_platform, 'notifications.events.billing.gracePeriodStarted.title', '{"messageKey":"notifications.events.billing.gracePeriodStarted.message","params":{"daysRemaining":"7"}}', 'warning', 'subscription', false, v_now - interval '35 days'),
    -- Epsilon
    ('d0000214-0001-4001-8001-000000000001'::uuid, v_c_epsilon, v_platform, 'notifications.events.billing.paymentSucceeded.title', '{"messageKey":"notifications.events.billing.paymentSucceeded.message","params":{"amount":"99","currency":"USD"}}', 'success', 'subscription', false, v_now - interval '15 days'),
    ('d0000214-0001-4001-8001-000000000002'::uuid, v_c_epsilon, v_platform, 'notifications.events.billing.invoiceGenerated.title', '{"messageKey":"notifications.events.billing.invoiceGenerated.message","params":{"invoiceNumber":"DEMO-INV-EPS-001"}}', 'info', 'invoice', false, v_now - interval '30 days'),
    ('d0000214-0001-4001-8001-000000000003'::uuid, v_c_epsilon, v_platform, 'notifications.events.billing.subscriptionRenewed.title', '{"messageKey":"notifications.events.billing.subscriptionRenewed.message","params":{"cycle":"monthly"}}', 'success', 'subscription', true, v_now - interval '15 days'),
    ('d0000214-0001-4001-8001-000000000004'::uuid, v_c_epsilon, v_platform, 'notifications.events.billing.planChanged.title', '{"messageKey":"notifications.events.billing.planChanged.message","params":{"planName":"Professional"}}', 'info', 'subscription', false, v_now - interval '45 days'),
    ('d0000214-0001-4001-8001-000000000005'::uuid, v_c_epsilon, v_platform, 'notifications.events.billing.trialExpiring.title', '{"messageKey":"notifications.events.billing.trialExpiring.message","params":{"daysRemaining":"7"}}', 'warning', 'subscription', true, v_now - interval '170 days'),
    ('d0000214-0001-4001-8001-000000000006'::uuid, v_c_epsilon, v_platform, 'notifications.events.billing.gracePeriodStarted.title', '{"messageKey":"notifications.events.billing.gracePeriodStarted.message","params":{"daysRemaining":"7"}}', 'warning', 'subscription', true, v_now - interval '20 days')
  on conflict (id) do update
  set title = excluded.title, message = excluded.message, type = excluded.type,
      category = excluded.category, is_read = excluded.is_read, created_at = excluded.created_at;

  return jsonb_build_object(
    'status', 'repair_complete',
    'subscription_events', 32,
    'notifications', 30,
    'repaired_at', now()
  );
end;
$$;

revoke all on function public.repair_subscription_detail_demo_v1() from public;
grant execute on function public.repair_subscription_detail_demo_v1() to service_role;

select public.repair_subscription_detail_demo_v1();
