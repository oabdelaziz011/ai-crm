-- ============================================================
-- Repair: re-apply enterprise demo seed after 099 ordering bug
-- (profiles.company_id updated before companies insert → FK rollback)
-- Idempotent; safe to re-run.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public._billing_demo_seed_auth_user(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_password text default 'DemoVault2026!'
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    p_user_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', p_full_name),
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  on conflict (id) do update
  set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now();

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  values (
    p_user_id,
    p_user_id,
    jsonb_build_object('sub', p_user_id::text, 'email', p_email, 'email_verified', true),
    'email',
    p_user_id::text,
    now(),
    now(),
    now()
  )
  on conflict (provider, provider_id) do update
  set identity_data = excluded.identity_data, updated_at = now();
end;
$$;

-- Re-run corrected demo seed body (companies before profile FK updates)
do $$
declare
  v_basic_id uuid;
  v_pro_id uuid;
  v_enterprise_id uuid;
  v_manual_method_id uuid;
  v_sandbox_provider text := 'sandbox';
  v_now timestamptz := now();
  v_period text := to_char(v_now, 'YYYY-MM');
begin
  alter table public.companies disable trigger trg_notify_subscription_events;
  alter table public.profiles disable trigger trg_notify_profile_events;
  alter table public.roles disable trigger trg_notify_role_events;

  select id into v_basic_id from public.plans where code = 'basic' limit 1;
  select id into v_pro_id from public.plans where code = 'pro' limit 1;
  select id into v_enterprise_id from public.plans where code = 'enterprise' limit 1;
  select id into v_manual_method_id from public.payment_method_types where code = 'manual' limit 1;

  perform public._billing_demo_seed_auth_user('d0000001-0001-4001-8001-000000000001'::uuid, 'demo-platform@vaultos.local', 'Demo Platform Owner');
  perform public._billing_demo_seed_auth_user('d0000002-0001-4001-8001-000000000001'::uuid, 'demo-alpha-admin@vaultos.local', 'Demo Alpha Admin');
  perform public._billing_demo_seed_auth_user('d0000002-0001-4001-8001-000000000002'::uuid, 'demo-beta-admin@vaultos.local', 'Demo Beta Admin');
  perform public._billing_demo_seed_auth_user('d0000002-0001-4001-8001-000000000003'::uuid, 'demo-gamma-admin@vaultos.local', 'Demo Gamma Admin');
  perform public._billing_demo_seed_auth_user('d0000002-0001-4001-8001-000000000004'::uuid, 'demo-finance@vaultos.local', 'Demo Finance Manager');
  perform public._billing_demo_seed_auth_user('d0000002-0001-4001-8001-000000000005'::uuid, 'demo-employee@vaultos.local', 'Demo Employee');

  update public.profiles
  set full_name = 'Demo Platform Owner', is_super_admin = true, is_active = true,
      company_id = null, account_status = 'ACTIVE'
  where id = 'd0000001-0001-4001-8001-000000000001'::uuid;

  insert into public.companies (id, name, status, company_type, contact_person, contact_email, contact_phone, subscription_status)
  values
    ('d0000010-0001-4001-8001-000000000001'::uuid, 'Demo Alpha', 'Trial', 'demo', 'Alpha Admin', 'demo-alpha-admin@vaultos.local', '+10000000001', 'trialing'),
    ('d0000010-0001-4001-8001-000000000002'::uuid, 'Demo Beta', 'Active', 'demo', 'Beta Admin', 'demo-beta-admin@vaultos.local', '+10000000002', 'active'),
    ('d0000010-0001-4001-8001-000000000003'::uuid, 'Demo Gamma', 'Active', 'demo', 'Gamma Admin', 'demo-gamma-admin@vaultos.local', '+10000000003', 'active'),
    ('d0000010-0001-4001-8001-000000000004'::uuid, 'Demo Delta', 'Suspended', 'demo', 'Delta Admin', 'demo-delta@vaultos.local', '+10000000004', 'expired'),
    ('d0000010-0001-4001-8001-000000000005'::uuid, 'Demo Epsilon', 'Active', 'demo', 'Epsilon Admin', 'demo-epsilon@vaultos.local', '+10000000005', 'active')
  on conflict (id) do update
  set name = excluded.name, status = excluded.status, contact_person = excluded.contact_person,
      contact_email = excluded.contact_email, updated_at = now();

  update public.profiles set full_name = 'Demo Alpha Admin', is_active = true, company_id = 'd0000010-0001-4001-8001-000000000001'::uuid, account_status = 'ACTIVE' where id = 'd0000002-0001-4001-8001-000000000001'::uuid;
  update public.profiles set full_name = 'Demo Beta Admin', is_active = true, company_id = 'd0000010-0001-4001-8001-000000000002'::uuid, account_status = 'ACTIVE' where id = 'd0000002-0001-4001-8001-000000000002'::uuid;
  update public.profiles set full_name = 'Demo Gamma Admin', is_active = true, company_id = 'd0000010-0001-4001-8001-000000000003'::uuid, account_status = 'ACTIVE' where id = 'd0000002-0001-4001-8001-000000000003'::uuid;
  update public.profiles set full_name = 'Demo Finance Manager', is_active = true, company_id = 'd0000010-0001-4001-8001-000000000002'::uuid, account_status = 'ACTIVE' where id = 'd0000002-0001-4001-8001-000000000004'::uuid;
  update public.profiles set full_name = 'Demo Employee', is_active = true, company_id = 'd0000010-0001-4001-8001-000000000002'::uuid, account_status = 'ACTIVE' where id = 'd0000002-0001-4001-8001-000000000005'::uuid;

  insert into public.company_subscriptions (
    id, company_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, next_renewal_at, trial_ends_at,
    grace_period_ends_at, auto_renewal, payment_method_label
  )
  values
    ('d0000020-0001-4001-8001-000000000001'::uuid, 'd0000010-0001-4001-8001-000000000001'::uuid, v_basic_id, 'trialing', 'monthly', v_now - interval '7 days', v_now + interval '7 days', v_now + interval '7 days', v_now + interval '7 days', null, true, 'Sandbox'),
    ('d0000020-0001-4001-8001-000000000002'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, v_pro_id, 'active', 'monthly', v_now - interval '20 days', v_now + interval '10 days', v_now + interval '10 days', null, null, true, 'Sandbox Card'),
    ('d0000020-0001-4001-8001-000000000003'::uuid, 'd0000010-0001-4001-8001-000000000003'::uuid, v_enterprise_id, 'active', 'yearly', v_now - interval '60 days', v_now + interval '305 days', v_now + interval '305 days', null, null, true, 'Manual'),
    ('d0000020-0001-4001-8001-000000000004'::uuid, 'd0000010-0001-4001-8001-000000000004'::uuid, v_pro_id, 'expired', 'monthly', v_now - interval '60 days', v_now - interval '30 days', v_now - interval '30 days', null, null, false, null),
    ('d0000020-0001-4001-8001-000000000005'::uuid, 'd0000010-0001-4001-8001-000000000005'::uuid, v_pro_id, 'active', 'monthly', v_now - interval '15 days', v_now + interval '15 days', v_now + interval '15 days', null, null, true, 'Sandbox')
  on conflict (company_id) do update
  set plan_id = excluded.plan_id, status = excluded.status, billing_cycle = excluded.billing_cycle,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
      next_renewal_at = excluded.next_renewal_at, trial_ends_at = excluded.trial_ends_at,
      auto_renewal = excluded.auto_renewal, payment_method_label = excluded.payment_method_label, updated_at = now();

  perform public.sync_company_subscription_denormalized('d0000010-0001-4001-8001-000000000001'::uuid);
  perform public.sync_company_subscription_denormalized('d0000010-0001-4001-8001-000000000002'::uuid);
  perform public.sync_company_subscription_denormalized('d0000010-0001-4001-8001-000000000003'::uuid);
  perform public.sync_company_subscription_denormalized('d0000010-0001-4001-8001-000000000004'::uuid);
  perform public.sync_company_subscription_denormalized('d0000010-0001-4001-8001-000000000005'::uuid);

  update public.companies set status = 'Suspended', updated_at = now() where id = 'd0000010-0001-4001-8001-000000000005'::uuid;

  insert into public.company_billing_contacts (id, company_id, name, email, phone, is_active)
  values
    ('d0000080-0001-4001-8001-000000000001'::uuid, 'd0000010-0001-4001-8001-000000000001'::uuid, 'Alpha Billing', 'billing.alpha@vaultos.local', '+10000000011', true),
    ('d0000080-0001-4001-8001-000000000002'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, 'Beta Billing', 'billing.beta@vaultos.local', '+10000000012', true),
    ('d0000080-0001-4001-8001-000000000003'::uuid, 'd0000010-0001-4001-8001-000000000003'::uuid, 'Gamma Billing', 'billing.gamma@vaultos.local', '+10000000013', true),
    ('d0000080-0001-4001-8001-000000000004'::uuid, 'd0000010-0001-4001-8001-000000000004'::uuid, 'Delta Billing', 'billing.delta@vaultos.local', '+10000000014', true),
    ('d0000080-0001-4001-8001-000000000005'::uuid, 'd0000010-0001-4001-8001-000000000005'::uuid, 'Epsilon Billing', 'billing.epsilon@vaultos.local', '+10000000015', true)
  on conflict (id) do update set name = excluded.name, email = excluded.email, phone = excluded.phone, is_active = true, updated_at = now();

  insert into public.company_billing_profiles (company_id, legal_name, address, tax_id, payment_terms_days)
  values
    ('d0000010-0001-4001-8001-000000000001'::uuid, 'Demo Alpha LLC', '100 Trial Street', 'TAX-ALPHA-001', 14),
    ('d0000010-0001-4001-8001-000000000002'::uuid, 'Demo Beta LLC', '200 Pro Avenue', 'TAX-BETA-002', 30),
    ('d0000010-0001-4001-8001-000000000003'::uuid, 'Demo Gamma LLC', '300 Enterprise Blvd', 'TAX-GAMMA-003', 30),
    ('d0000010-0001-4001-8001-000000000004'::uuid, 'Demo Delta LLC', '400 Expired Lane', 'TAX-DELTA-004', 30),
    ('d0000010-0001-4001-8001-000000000005'::uuid, 'Demo Epsilon LLC', '500 Suspended Road', 'TAX-EPSILON-005', 30)
  on conflict (company_id) do update set legal_name = excluded.legal_name, address = excluded.address, tax_id = excluded.tax_id, payment_terms_days = excluded.payment_terms_days, updated_at = now();

  insert into public.company_payment_methods (id, company_id, payment_method_type_id, label, provider_token, is_default)
  values (
    'd0000070-0001-4001-8001-000000000001'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid,
    coalesce((select id from public.payment_method_types where code = 'visa' limit 1), v_manual_method_id),
    'Sandbox Visa •••• 4242', 'sandbox_pm_demo_beta_4242', true
  )
  on conflict (id) do update set label = excluded.label, provider_token = excluded.provider_token, is_default = true, updated_at = now();

  update public.company_subscriptions set default_payment_method_id = 'd0000070-0001-4001-8001-000000000001'::uuid where company_id = 'd0000010-0001-4001-8001-000000000002'::uuid;

  insert into public.billing_payments (id, company_id, subscription_id, payment_method_type_id, payment_method_label, provider, provider_payment_id, status, amount, currency, failure_code, failure_message, paid_at, metadata)
  values
    ('d0000040-0001-4001-8001-000000000001'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, 'd0000020-0001-4001-8001-000000000002'::uuid, v_manual_method_id, 'Sandbox Card', v_sandbox_provider, 'demo_pay_beta_success_001', 'succeeded', 99.00, 'USD', null, null, v_now - interval '5 days', '{"demo": true, "scenario": "succeeded"}'::jsonb),
    ('d0000040-0001-4001-8001-000000000002'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, 'd0000020-0001-4001-8001-000000000002'::uuid, v_manual_method_id, 'Sandbox Card', v_sandbox_provider, 'demo_pay_beta_failed_001', 'failed', 99.00, 'USD', 'card_declined', 'Sandbox card declined for demo', v_now - interval '2 days', '{"demo": true, "scenario": "failed"}'::jsonb),
    ('d0000040-0001-4001-8001-000000000003'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, 'd0000020-0001-4001-8001-000000000002'::uuid, v_manual_method_id, 'Sandbox Card', v_sandbox_provider, 'demo_pay_beta_pending_001', 'pending', 99.00, 'USD', null, null, null, '{"demo": true, "scenario": "pending"}'::jsonb)
  on conflict (id) do update set status = excluded.status, amount = excluded.amount, failure_code = excluded.failure_code, failure_message = excluded.failure_message, paid_at = excluded.paid_at, updated_at = now();

  insert into public.billing_invoices (id, invoice_number, company_id, subscription_id, billing_payment_id, status, currency, subtotal_amount, tax_amount, total_amount, period_start, period_end, line_items, issued_at, due_at, paid_at)
  values
    ('d0000050-0001-4001-8001-000000000001'::uuid, 'DEMO-INV-BETA-PAID-001', 'd0000010-0001-4001-8001-000000000002'::uuid, 'd0000020-0001-4001-8001-000000000002'::uuid, 'd0000040-0001-4001-8001-000000000001'::uuid, 'paid', 'USD', 99.00, 0, 99.00, v_now - interval '35 days', v_now - interval '5 days', '[{"description":"Pro Plan","quantity":1,"unit_amount":99,"total_amount":99}]'::jsonb, v_now - interval '35 days', v_now - interval '5 days', v_now - interval '5 days'),
    ('d0000050-0001-4001-8001-000000000002'::uuid, 'DEMO-INV-ALPHA-DRAFT-001', 'd0000010-0001-4001-8001-000000000001'::uuid, 'd0000020-0001-4001-8001-000000000001'::uuid, null, 'draft', 'USD', 29.00, 0, 29.00, v_now, v_now + interval '30 days', '[{"description":"Basic Trial Conversion","quantity":1,"unit_amount":29,"total_amount":29}]'::jsonb, null, v_now + interval '14 days', null),
    ('d0000050-0001-4001-8001-000000000003'::uuid, 'DEMO-INV-GAMMA-OVERDUE-001', 'd0000010-0001-4001-8001-000000000003'::uuid, 'd0000020-0001-4001-8001-000000000003'::uuid, null, 'overdue', 'USD', 2990.00, 0, 2990.00, v_now - interval '45 days', v_now + interval '320 days', '[{"description":"Enterprise Annual","quantity":1,"unit_amount":2990,"total_amount":2990}]'::jsonb, v_now - interval '45 days', v_now - interval '15 days', null),
    ('d0000050-0001-4001-8001-000000000004'::uuid, 'DEMO-INV-GAMMA-ISSUED-001', 'd0000010-0001-4001-8001-000000000003'::uuid, 'd0000020-0001-4001-8001-000000000003'::uuid, null, 'issued', 'USD', 500.00, 0, 500.00, v_now - interval '10 days', v_now + interval '20 days', '[{"description":"Enterprise Add-on","quantity":1,"unit_amount":500,"total_amount":500}]'::jsonb, v_now - interval '10 days', v_now + interval '20 days', null)
  on conflict (id) do update set status = excluded.status, total_amount = excluded.total_amount, due_at = excluded.due_at, paid_at = excluded.paid_at, updated_at = now();

  insert into public.billing_receipts (id, receipt_number, company_id, subscription_id, billing_invoice_id, billing_payment_id, amount, currency, payment_method_label, issued_at)
  values ('d0000060-0001-4001-8001-000000000001'::uuid, 'DEMO-RCP-BETA-001', 'd0000010-0001-4001-8001-000000000002'::uuid, 'd0000020-0001-4001-8001-000000000002'::uuid, 'd0000050-0001-4001-8001-000000000001'::uuid, 'd0000040-0001-4001-8001-000000000001'::uuid, 99.00, 'USD', 'Sandbox Card', v_now - interval '5 days')
  on conflict (id) do update set amount = excluded.amount, issued_at = excluded.issued_at;

  update public.billing_payments set receipt_id = 'd0000060-0001-4001-8001-000000000001'::uuid, billing_invoice_id = 'd0000050-0001-4001-8001-000000000001'::uuid where id = 'd0000040-0001-4001-8001-000000000001'::uuid;
  update public.billing_invoices set billing_payment_id = 'd0000040-0001-4001-8001-000000000001'::uuid where id = 'd0000050-0001-4001-8001-000000000001'::uuid;

  insert into public.billing_audit_logs (id, event_type, company_id, user_id, source, previous_value, new_value, metadata, occurred_at)
  values
    ('d0000090-0001-4001-8001-000000000001'::uuid, 'manual_payment_recorded', 'd0000010-0001-4001-8001-000000000002'::uuid, 'd0000001-0001-4001-8001-000000000001'::uuid, 'manual', null, jsonb_build_object('payment_id', 'd0000040-0001-4001-8001-000000000001', 'amount', 99), '{"demo": true}'::jsonb, v_now - interval '5 days'),
    ('d0000090-0001-4001-8001-000000000002'::uuid, 'plan_changed', 'd0000010-0001-4001-8001-000000000003'::uuid, 'd0000001-0001-4001-8001-000000000001'::uuid, 'manual', jsonb_build_object('plan_id', v_pro_id), jsonb_build_object('plan_id', v_enterprise_id), '{"demo": true, "plan_code": "enterprise"}'::jsonb, v_now - interval '70 days'),
    ('d0000090-0001-4001-8001-000000000003'::uuid, 'subscription_suspended', 'd0000010-0001-4001-8001-000000000005'::uuid, 'd0000001-0001-4001-8001-000000000001'::uuid, 'manual', jsonb_build_object('company_status', 'Active'), jsonb_build_object('company_status', 'Suspended'), '{"demo": true, "reason": "Administrative suspension"}'::jsonb, v_now - interval '3 days'),
    ('d0000090-0001-4001-8001-000000000004'::uuid, 'billing_contact_changed', 'd0000010-0001-4001-8001-000000000001'::uuid, 'd0000002-0001-4001-8001-000000000001'::uuid, 'manual', null, jsonb_build_object('email', 'billing.alpha@vaultos.local'), '{"demo": true}'::jsonb, v_now - interval '12 days')
  on conflict (id) do nothing;

  insert into public.usage_records (id, company_id, metric_code, quantity, recorded_at, billing_period, source, idempotency_key)
  values
    ('d00000a0-0001-4001-8001-000000000001'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, 'ai_tokens', 125000, v_now - interval '1 day', v_period, 'demo_seed', 'demo-usage-beta-ai'),
    ('d00000a0-0001-4001-8001-000000000002'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, 'api_calls', 8420, v_now - interval '1 day', v_period, 'demo_seed', 'demo-usage-beta-api'),
    ('d00000a0-0001-4001-8001-000000000003'::uuid, 'd0000010-0001-4001-8001-000000000003'::uuid, 'ai_tokens', 890000, v_now - interval '1 day', v_period, 'demo_seed', 'demo-usage-gamma-ai'),
    ('d00000a0-0001-4001-8001-000000000004'::uuid, 'd0000010-0001-4001-8001-000000000001'::uuid, 'users', 3, v_now - interval '1 day', v_period, 'demo_seed', 'demo-usage-alpha-users')
  on conflict (id) do nothing;

  insert into public.company_usage_snapshots (id, company_id, snapshot_date, metrics, source)
  values
    ('d00000b0-0001-4001-8001-000000000001'::uuid, 'd0000010-0001-4001-8001-000000000001'::uuid, current_date, jsonb_build_object('ai_tokens', 12000, 'users', 3, 'api_calls', 400), 'daily_rollup'),
    ('d00000b0-0001-4001-8001-000000000002'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, current_date, jsonb_build_object('ai_tokens', 125000, 'users', 12, 'api_calls', 8420), 'daily_rollup'),
    ('d00000b0-0001-4001-8001-000000000003'::uuid, 'd0000010-0001-4001-8001-000000000003'::uuid, current_date, jsonb_build_object('ai_tokens', 890000, 'users', 45, 'api_calls', 52000), 'daily_rollup')
  on conflict (company_id, snapshot_date) do update set metrics = excluded.metrics, source = excluded.source, created_at = now();

  insert into public.company_feature_overrides (company_id, feature_code, override_state, reason, is_active, created_by)
  select 'd0000010-0001-4001-8001-000000000001'::uuid, 'ai_assistant', 'enabled', 'Demo trial AI boost', true, 'd0000001-0001-4001-8001-000000000001'::uuid
  where not exists (
    select 1 from public.company_feature_overrides o
    where o.company_id = 'd0000010-0001-4001-8001-000000000001'::uuid and o.feature_code = 'ai_assistant' and o.is_active = true
  );

  delete from public.user_roles ur
  using public.roles r
  where ur.role_id = r.id
    and r.company_id in (
      'd0000010-0001-4001-8001-000000000001'::uuid,
      'd0000010-0001-4001-8001-000000000002'::uuid,
      'd0000010-0001-4001-8001-000000000003'::uuid,
      'd0000010-0001-4001-8001-000000000004'::uuid,
      'd0000010-0001-4001-8001-000000000005'::uuid
    );

  delete from public.role_permissions rp
  using public.roles r
  where rp.role_id = r.id
    and r.company_id in (
      'd0000010-0001-4001-8001-000000000001'::uuid,
      'd0000010-0001-4001-8001-000000000002'::uuid,
      'd0000010-0001-4001-8001-000000000003'::uuid,
      'd0000010-0001-4001-8001-000000000004'::uuid,
      'd0000010-0001-4001-8001-000000000005'::uuid
    );

  delete from public.roles
  where company_id in (
    'd0000010-0001-4001-8001-000000000001'::uuid,
    'd0000010-0001-4001-8001-000000000002'::uuid,
    'd0000010-0001-4001-8001-000000000003'::uuid,
    'd0000010-0001-4001-8001-000000000004'::uuid,
    'd0000010-0001-4001-8001-000000000005'::uuid
  );

  insert into public.roles (id, company_id, name, description, is_system)
  values
    ('d0000030-0001-4001-8001-000000000001'::uuid, 'd0000010-0001-4001-8001-000000000001'::uuid, 'Demo Alpha Admin', 'Demo Alpha administrator', true),
    ('d0000030-0001-4001-8001-000000000002'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, 'Demo Beta Admin', 'Demo Beta administrator', true),
    ('d0000030-0001-4001-8001-000000000003'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, 'Demo Beta Finance Manager', 'Demo Beta finance manager', false),
    ('d0000030-0001-4001-8001-000000000004'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, 'Demo Beta Employee', 'Demo Beta read-only employee', false),
    ('d0000030-0001-4001-8001-000000000005'::uuid, 'd0000010-0001-4001-8001-000000000003'::uuid, 'Demo Gamma Admin', 'Demo Gamma administrator', true),
    ('d0000030-0001-4001-8001-000000000006'::uuid, 'd0000010-0001-4001-8001-000000000004'::uuid, 'Demo Delta Admin', 'Demo Delta administrator', true),
    ('d0000030-0001-4001-8001-000000000007'::uuid, 'd0000010-0001-4001-8001-000000000005'::uuid, 'Demo Epsilon Admin', 'Demo Epsilon administrator', true)
  on conflict (id) do update set name = excluded.name, description = excluded.description, updated_at = now();

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.id in ('d0000030-0001-4001-8001-000000000001'::uuid, 'd0000030-0001-4001-8001-000000000002'::uuid, 'd0000030-0001-4001-8001-000000000005'::uuid, 'd0000030-0001-4001-8001-000000000006'::uuid, 'd0000030-0001-4001-8001-000000000007'::uuid)
  and p.code in ('workspace.view', 'billing.view_own', 'billing.manage_own', 'billing.contact.edit_own', 'billing.payment_method.manage_own', 'billing.documents.download_own')
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.id = 'd0000030-0001-4001-8001-000000000003'::uuid
  and p.code in ('workspace.view', 'billing.view_own', 'billing.manage_own', 'billing.contact.edit_own', 'billing.payment_method.manage_own', 'billing.documents.download_own')
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.id = 'd0000030-0001-4001-8001-000000000004'::uuid
  and p.code in ('workspace.view', 'billing.view_own', 'billing.documents.download_own')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id)
  values
    ('d0000002-0001-4001-8001-000000000001'::uuid, 'd0000030-0001-4001-8001-000000000001'::uuid),
    ('d0000002-0001-4001-8001-000000000002'::uuid, 'd0000030-0001-4001-8001-000000000002'::uuid),
    ('d0000002-0001-4001-8001-000000000003'::uuid, 'd0000030-0001-4001-8001-000000000005'::uuid),
    ('d0000002-0001-4001-8001-000000000004'::uuid, 'd0000030-0001-4001-8001-000000000003'::uuid),
    ('d0000002-0001-4001-8001-000000000005'::uuid, 'd0000030-0001-4001-8001-000000000004'::uuid)
  on conflict do nothing;

  insert into public.subscription_events (id, company_id, subscription_id, event_type, title, description, occurred_at)
  values
    ('d00000c0-0001-4001-8001-000000000001'::uuid, 'd0000010-0001-4001-8001-000000000002'::uuid, 'd0000020-0001-4001-8001-000000000002'::uuid, 'payment_received', 'Payment Received', '99 USD', v_now - interval '5 days'),
    ('d00000c0-0001-4001-8001-000000000002'::uuid, 'd0000010-0001-4001-8001-000000000005'::uuid, 'd0000020-0001-4001-8001-000000000005'::uuid, 'suspended', 'Subscription Suspended', 'Administrative suspension', v_now - interval '3 days')
  on conflict (id) do nothing;

  begin
    perform public.financial_compute_analytics_snapshot_v1(current_date);
  exception
    when others then
      raise notice 'Demo analytics snapshot skipped: %', sqlerrm;
  end;

  alter table public.companies enable trigger trg_notify_subscription_events;
  alter table public.profiles enable trigger trg_notify_profile_events;
  alter table public.roles enable trigger trg_notify_role_events;
end;
$$;

drop function if exists public._billing_demo_seed_auth_user(uuid, text, text, text);
