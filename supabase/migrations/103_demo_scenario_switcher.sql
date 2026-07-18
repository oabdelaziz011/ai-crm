-- ============================================================
-- Vault OS – Demo Scenario Switcher (Platform Owner)
-- Requires: 101, 102
-- ============================================================

create or replace function public._demo_set_triggers(enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if enabled then
    alter table public.companies enable trigger trg_notify_subscription_events;
    alter table public.profiles enable trigger trg_notify_profile_events;
    alter table public.roles enable trigger trg_notify_role_events;
    alter table public.customers enable trigger trg_notify_customer_created;
    alter table public.bookings enable trigger trg_notify_booking_changes;
    alter table public.audit_logs enable trigger trg_notify_audit_events;
  else
    alter table public.companies disable trigger trg_notify_subscription_events;
    alter table public.profiles disable trigger trg_notify_profile_events;
    alter table public.roles disable trigger trg_notify_role_events;
    alter table public.customers disable trigger trg_notify_customer_created;
    alter table public.bookings disable trigger trg_notify_booking_changes;
    alter table public.audit_logs disable trigger trg_notify_audit_events;
  end if;
end;
$$;

create or replace function public._demo_strip_company_workspace_data(p_company_id uuid, p_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.conversation_messages where conversation_id in (
    select id from public.conversations where company_id = p_company_id
  );
  delete from public.conversation_participants where conversation_id in (
    select id from public.conversations where company_id = p_company_id
  );
  delete from public.conversations where company_id = p_company_id;
  delete from public.notifications where company_id = p_company_id;
  delete from public.demo_crm_scenarios where company_id = p_company_id;
  delete from public.bookings where user_id = p_owner_user_id;
  delete from public.invoices where user_id = p_owner_user_id;
  delete from public.customers where user_id = p_owner_user_id;
  delete from public.usage_records where company_id = p_company_id;
  delete from public.company_usage_snapshots where company_id = p_company_id;
end;
$$;

create or replace function public._demo_seed_heavy_crm(p_company_id uuid, p_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i integer;
  v_id uuid;
  v_meta jsonb := '{"demo": true, "demo_env": "vaultos_enterprise_v1", "is_demo_data": true, "heavy_crm": true}'::jsonb;
begin
  for v_i in 1..20 loop
    v_id := ('d00000d1-0001-4001-8001-' || lpad(v_i::text, 12, '0'))::uuid;
    insert into public.customers (id, user_id, name, email, phone, notes)
    values (
      v_id, p_owner_user_id,
      'DEMO | CRM Bulk #' || v_i,
      'demo-crm-' || v_i || '@vaultos.local',
      '+1555100' || lpad(v_i::text, 4, '0'),
      'DEMO heavy CRM seed record #' || v_i
    )
    on conflict (id) do update set name = excluded.name, notes = excluded.notes, updated_at = now();

    insert into public.demo_crm_scenarios (id, company_id, scenario_type, title, status, owner_user_id, related_customer_id, metadata)
    values (
      ('d0000201-0001-4001-8001-' || lpad(v_i::text, 12, '0'))::uuid,
      p_company_id,
      case when v_i % 5 = 0 then 'lead_hot' when v_i % 5 = 1 then 'lead_cold' when v_i % 5 = 2 then 'deal_won'
           when v_i % 5 = 3 then 'opportunity_open' else 'activity' end,
      'DEMO Heavy CRM Scenario #' || v_i,
      case when v_i % 3 = 0 then 'open' when v_i % 3 = 1 then 'won' else 'nurture' end,
      p_owner_user_id, v_id, v_meta, now() + (v_i || ' days')::interval
    )
    on conflict (id) do update set title = excluded.title, status = excluded.status, updated_at = now();
  end loop;
end;
$$;

create or replace function public._apply_demo_scenario_v1(p_scenario text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_beta_admin uuid := 'd0000002-0001-4001-8001-000000000002'::uuid;
  v_c_beta uuid := 'd0000010-0001-4001-8001-000000000002'::uuid;
  v_c_gamma uuid := 'd0000010-0001-4001-8001-000000000003'::uuid;
  v_c_delta uuid := 'd0000010-0001-4001-8001-000000000004'::uuid;
  v_c_epsilon uuid := 'd0000010-0001-4001-8001-000000000005'::uuid;
  v_sub_beta uuid := 'd0000020-0001-4001-8001-000000000002'::uuid;
  v_meta jsonb := '{"demo": true, "demo_env": "vaultos_enterprise_v1"}'::jsonb;
  v_focus uuid := v_c_beta;
  v_login text := 'demo-beta-admin@vaultos.local';
  v_label text;
begin
  perform public._demo_set_triggers(false);

  case lower(trim(p_scenario))
    when 'healthy_company' then
      v_label := 'Scenario A — Healthy Company';
      update public.profiles set company_id = v_c_beta, account_status = 'ACTIVE' where id = v_beta_admin;
      update public.companies set status = 'Active', updated_at = now() where id = v_c_beta;
      update public.company_subscriptions set status = 'active', updated_at = now() where company_id = v_c_beta;
      perform public.sync_company_subscription_denormalized(v_c_beta);

    when 'payment_failed' then
      v_label := 'Scenario B — Payment Failed';
      update public.profiles set company_id = v_c_beta, account_status = 'ACTIVE' where id = v_beta_admin;
      update public.company_subscriptions set status = 'past_due', updated_at = now() where company_id = v_c_beta;
      perform public.sync_company_subscription_denormalized(v_c_beta);
      update public.billing_payments set status = 'failed', failure_code = 'card_declined',
        failure_message = 'DEMO: Latest payment failed', updated_at = now()
      where id = 'd0000040-0001-4001-8001-000000000002'::uuid;
      insert into public.notifications (id, company_id, user_id, title, message, type, category, is_read, created_at)
      values (
        'd0000180-0001-4001-8001-000000000010'::uuid, v_c_beta, v_beta_admin,
        'DEMO Payment Failed Alert',
        '{"messageKey":"notifications.demo.paymentFailed","params":{"detail":"Sandbox card declined — action required"}}',
        'error', 'subscription', false, now()
      )
      on conflict (id) do update set is_read = false, message = excluded.message;

    when 'subscription_expired' then
      v_label := 'Scenario C — Subscription Expired';
      v_focus := v_c_delta;
      v_login := 'demo-beta-admin@vaultos.local';
      update public.profiles set company_id = v_c_delta, account_status = 'ACTIVE' where id = v_beta_admin;
      update public.company_subscriptions set status = 'expired', auto_renewal = false, updated_at = now() where company_id = v_c_delta;
      perform public.sync_company_subscription_denormalized(v_c_delta);

    when 'company_suspended' then
      v_label := 'Scenario D — Company Suspended';
      v_focus := v_c_epsilon;
      update public.profiles set company_id = v_c_epsilon, account_status = 'SUSPENDED_BY_SUBSCRIPTION' where id = v_beta_admin;
      update public.companies set status = 'Suspended', updated_at = now() where id = v_c_epsilon;

    when 'enterprise_customer' then
      v_label := 'Scenario E — Enterprise Customer';
      v_focus := v_c_gamma;
      v_login := 'demo-gamma-admin@vaultos.local';
      update public.profiles set company_id = v_c_gamma, account_status = 'ACTIVE' where id = v_beta_admin;

    when 'heavy_crm_data' then
      v_label := 'Scenario F — Heavy CRM Data';
      update public.profiles set company_id = v_c_beta, account_status = 'ACTIVE' where id = v_beta_admin;
      perform public._demo_seed_heavy_crm(v_c_beta, v_beta_admin);

    when 'empty_workspace' then
      v_label := 'Scenario G — Empty Workspace';
      update public.profiles set company_id = v_c_beta, account_status = 'ACTIVE' where id = v_beta_admin;
      perform public._demo_strip_company_workspace_data(v_c_beta, v_beta_admin);
      update public.company_subscriptions set status = 'active', payment_method_label = null, updated_at = now() where company_id = v_c_beta;
      perform public.sync_company_subscription_denormalized(v_c_beta);

    else
      raise exception 'Unknown demo scenario: %', p_scenario;
  end case;

  update public.demo_environment_manifest
  set metadata = metadata || jsonb_build_object(
    'active_scenario', lower(trim(p_scenario)),
    'active_scenario_label', v_label,
    'focus_company_id', v_focus,
    'suggested_login_email', v_login,
    'switched_at', now()
  ),
  last_seed_at = now()
  where env_key = 'vaultos_enterprise_v1';

  perform public._demo_set_triggers(true);

  return jsonb_build_object(
    'scenario', lower(trim(p_scenario)),
    'label', v_label,
    'focus_company_id', v_focus,
    'suggested_login_email', v_login
  );
end;
$$;

create or replace function public.list_enterprise_demo_scenarios_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' or not public.is_super_admin() then
    raise exception 'Platform Owner access required';
  end if;

  return jsonb_build_array(
    jsonb_build_object('code', 'healthy_company', 'label', 'Scenario A — Healthy Company', 'description', 'Active Pro subscription, successful payments, healthy workspace KPIs.', 'suggested_login_email', 'demo-beta-admin@vaultos.local'),
    jsonb_build_object('code', 'payment_failed', 'label', 'Scenario B — Payment Failed', 'description', 'Past-due subscription with failed payment and billing alert.', 'suggested_login_email', 'demo-beta-admin@vaultos.local'),
    jsonb_build_object('code', 'subscription_expired', 'label', 'Scenario C — Subscription Expired', 'description', 'Expired subscription on DEMO Delta; workspace shows lapsed access.', 'suggested_login_email', 'demo-beta-admin@vaultos.local'),
    jsonb_build_object('code', 'company_suspended', 'label', 'Scenario D — Company Suspended', 'description', 'Administratively suspended DEMO Epsilon company.', 'suggested_login_email', 'demo-beta-admin@vaultos.local'),
    jsonb_build_object('code', 'enterprise_customer', 'label', 'Scenario E — Enterprise Customer', 'description', 'Enterprise plan, annual billing, high usage on DEMO Gamma.', 'suggested_login_email', 'demo-gamma-admin@vaultos.local'),
    jsonb_build_object('code', 'heavy_crm_data', 'label', 'Scenario F — Heavy CRM Data', 'description', '20+ CRM customers and pipeline scenarios on DEMO Beta.', 'suggested_login_email', 'demo-beta-admin@vaultos.local'),
    jsonb_build_object('code', 'empty_workspace', 'label', 'Scenario G — Empty Workspace', 'description', 'Minimal subscription shell with no CRM, usage, or notifications.', 'suggested_login_email', 'demo-beta-admin@vaultos.local')
  );
end;
$$;

create or replace function public.get_enterprise_demo_status_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_manifest public.demo_environment_manifest%rowtype;
begin
  if auth.role() <> 'authenticated' or not public.is_super_admin() then
    raise exception 'Platform Owner access required';
  end if;

  select * into v_manifest from public.demo_environment_manifest where env_key = 'vaultos_enterprise_v1';

  return jsonb_build_object(
    'demo_env', coalesce(v_manifest.env_key, 'vaultos_enterprise_v1'),
    'seeded_at', v_manifest.seeded_at,
    'last_seed_at', v_manifest.last_seed_at,
    'active_scenario', v_manifest.metadata->>'active_scenario',
    'active_scenario_label', v_manifest.metadata->>'active_scenario_label',
    'focus_company_id', v_manifest.metadata->>'focus_company_id',
    'suggested_login_email', v_manifest.metadata->>'suggested_login_email',
    'switched_at', v_manifest.metadata->>'switched_at'
  );
end;
$$;

create or replace function public.reset_enterprise_demo_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed jsonb;
  v_apply jsonb;
begin
  if auth.role() <> 'authenticated' or not public.is_super_admin() then
    raise exception 'Platform Owner access required';
  end if;

  v_seed := public.seed_enterprise_demo_v1();
  v_apply := public._apply_demo_scenario_v1('healthy_company');

  return jsonb_build_object('status', 'reset_complete', 'seed', v_seed, 'scenario', v_apply);
end;
$$;

create or replace function public.switch_enterprise_demo_scenario_v1(p_scenario_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(p_scenario_code));
  v_seed jsonb;
  v_apply jsonb;
begin
  if auth.role() <> 'authenticated' or not public.is_super_admin() then
    raise exception 'Platform Owner access required';
  end if;

  if v_code not in (
    'healthy_company', 'payment_failed', 'subscription_expired', 'company_suspended',
    'enterprise_customer', 'heavy_crm_data', 'empty_workspace'
  ) then
    raise exception 'Invalid scenario code: %', p_scenario_code;
  end if;

  v_seed := public.seed_enterprise_demo_v1();
  v_apply := public._apply_demo_scenario_v1(v_code);

  return jsonb_build_object('status', 'scenario_applied', 'seed', v_seed, 'scenario', v_apply);
end;
$$;

revoke all on function public.list_enterprise_demo_scenarios_v1() from public;
grant execute on function public.list_enterprise_demo_scenarios_v1() to authenticated;

revoke all on function public.get_enterprise_demo_status_v1() from public;
grant execute on function public.get_enterprise_demo_status_v1() to authenticated;

revoke all on function public.reset_enterprise_demo_v1() from public;
grant execute on function public.reset_enterprise_demo_v1() to authenticated;

revoke all on function public.switch_enterprise_demo_scenario_v1(text) from public;
grant execute on function public.switch_enterprise_demo_scenario_v1(text) to authenticated;

-- Default active scenario after initial deploy
select public._apply_demo_scenario_v1('healthy_company');
