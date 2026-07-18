-- ============================================================
-- Vault OS – Enterprise Demo Seed Function (v1)
-- Requires: 101_enterprise_demo_environment.sql
-- ============================================================

create or replace function public.seed_enterprise_demo_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_basic_id uuid;
  v_pro_id uuid;
  v_enterprise_id uuid;
  v_manual_method_id uuid;
  v_sandbox text := 'sandbox';
  v_now timestamptz := now();
  v_period text := to_char(v_now, 'YYYY-MM');
  v_meta jsonb := '{"demo": true, "demo_env": "vaultos_enterprise_v1", "is_demo_data": true}'::jsonb;
  v_i integer;
  v_d date;
  v_mrr numeric;
  v_beta_admin uuid := 'd0000002-0001-4001-8001-000000000002'::uuid;
  v_gamma_admin uuid := 'd0000002-0001-4001-8001-000000000003'::uuid;
  v_support uuid := 'd0000002-0001-4001-8001-000000000006'::uuid;
  v_sales uuid := 'd0000002-0001-4001-8001-000000000007'::uuid;
  v_c_alpha uuid := 'd0000010-0001-4001-8001-000000000001'::uuid;
  v_c_beta uuid := 'd0000010-0001-4001-8001-000000000002'::uuid;
  v_c_gamma uuid := 'd0000010-0001-4001-8001-000000000003'::uuid;
  v_c_delta uuid := 'd0000010-0001-4001-8001-000000000004'::uuid;
  v_c_epsilon uuid := 'd0000010-0001-4001-8001-000000000005'::uuid;
  v_ai_beta uuid := 'd0000100-0001-4001-8001-000000000002'::uuid;
  v_pt_beta uuid := 'd0000150-0001-4001-8001-000000000002'::uuid;
  v_ptv_beta uuid := 'd0000151-0001-4001-8001-000000000002'::uuid;
  v_conv_hot uuid := 'd0000110-0001-4001-8001-000000000001'::uuid;
begin
  alter table public.companies disable trigger trg_notify_subscription_events;
  alter table public.profiles disable trigger trg_notify_profile_events;
  alter table public.roles disable trigger trg_notify_role_events;
  alter table public.customers disable trigger trg_notify_customer_created;
  alter table public.bookings disable trigger trg_notify_booking_changes;
  alter table public.audit_logs disable trigger trg_notify_audit_events;

  select id into v_basic_id from public.plans where code = 'basic' limit 1;
  select id into v_pro_id from public.plans where code = 'pro' limit 1;
  select id into v_enterprise_id from public.plans where code = 'enterprise' limit 1;
  select id into v_manual_method_id from public.payment_method_types where code = 'manual' limit 1;

  -- ── Auth personas ─────────────────────────────────────────
  perform public._demo_auth_user('d0000001-0001-4001-8001-000000000001'::uuid, 'demo-platform@vaultos.local', 'DEMO Platform Owner');
  perform public._demo_auth_user('d0000002-0001-4001-8001-000000000001'::uuid, 'demo-alpha-admin@vaultos.local', 'DEMO Alpha Admin');
  perform public._demo_auth_user('d0000002-0001-4001-8001-000000000002'::uuid, 'demo-beta-admin@vaultos.local', 'DEMO Beta Admin');
  perform public._demo_auth_user('d0000002-0001-4001-8001-000000000003'::uuid, 'demo-gamma-admin@vaultos.local', 'DEMO Gamma Admin');
  perform public._demo_auth_user('d0000002-0001-4001-8001-000000000004'::uuid, 'demo-finance@vaultos.local', 'DEMO Finance Manager');
  perform public._demo_auth_user('d0000002-0001-4001-8001-000000000005'::uuid, 'demo-employee@vaultos.local', 'DEMO Employee');
  perform public._demo_auth_user(v_support, 'demo-support@vaultos.local', 'DEMO Support Agent');
  perform public._demo_auth_user(v_sales, 'demo-sales@vaultos.local', 'DEMO Sales Manager');

  update public.profiles set full_name = 'DEMO Platform Owner', is_super_admin = true, is_active = true, company_id = null, account_status = 'ACTIVE'
  where id = 'd0000001-0001-4001-8001-000000000001'::uuid;

  -- ── Companies (5 business states) ───────────────────────────
  insert into public.companies (id, name, status, company_type, contact_person, contact_email, contact_phone, subscription_status)
  values
    (v_c_alpha, 'DEMO Alpha — Trial Company', 'Trial', 'demo', 'DEMO Alpha Admin', 'demo-alpha-admin@vaultos.local', '+10000000001', 'trialing'),
    (v_c_beta, 'DEMO Beta — Active Professional', 'Active', 'demo', 'DEMO Beta Admin', 'demo-beta-admin@vaultos.local', '+10000000002', 'active'),
    (v_c_gamma, 'DEMO Gamma — Enterprise Company', 'Active', 'demo', 'DEMO Gamma Admin', 'demo-gamma-admin@vaultos.local', '+10000000003', 'active'),
    (v_c_delta, 'DEMO Delta — Expired Company', 'Suspended', 'demo', 'DEMO Delta Admin', 'demo-delta@vaultos.local', '+10000000004', 'expired'),
    (v_c_epsilon, 'DEMO Epsilon — Suspended Company', 'Active', 'demo', 'DEMO Epsilon Admin', 'demo-epsilon@vaultos.local', '+10000000005', 'active')
  on conflict (id) do update set name = excluded.name, status = excluded.status, company_type = 'demo', contact_person = excluded.contact_person, contact_email = excluded.contact_email, updated_at = now();

  perform public._demo_register('companies', v_c_alpha);
  perform public._demo_register('companies', v_c_beta);
  perform public._demo_register('companies', v_c_gamma);
  perform public._demo_register('companies', v_c_delta);
  perform public._demo_register('companies', v_c_epsilon);

  update public.profiles set full_name = 'DEMO Alpha Admin', is_active = true, company_id = v_c_alpha, account_status = 'ACTIVE' where id = 'd0000002-0001-4001-8001-000000000001'::uuid;
  update public.profiles set full_name = 'DEMO Beta Admin', is_active = true, company_id = v_c_beta, account_status = 'ACTIVE' where id = v_beta_admin;
  update public.profiles set full_name = 'DEMO Gamma Admin', is_active = true, company_id = v_c_gamma, account_status = 'ACTIVE' where id = v_gamma_admin;
  update public.profiles set full_name = 'DEMO Finance Manager', is_active = true, company_id = v_c_beta, account_status = 'ACTIVE' where id = 'd0000002-0001-4001-8001-000000000004'::uuid;
  update public.profiles set full_name = 'DEMO Employee', is_active = true, company_id = v_c_beta, account_status = 'ACTIVE' where id = 'd0000002-0001-4001-8001-000000000005'::uuid;
  update public.profiles set full_name = 'DEMO Support Agent', is_active = true, company_id = v_c_beta, account_status = 'ACTIVE' where id = v_support;
  update public.profiles set full_name = 'DEMO Sales Manager', is_active = true, company_id = v_c_gamma, account_status = 'ACTIVE' where id = v_sales;

  -- ── Subscriptions ─────────────────────────────────────────
  insert into public.company_subscriptions (id, company_id, plan_id, status, billing_cycle, current_period_start, current_period_end, next_renewal_at, trial_ends_at, auto_renewal, payment_method_label)
  values
    ('d0000020-0001-4001-8001-000000000001'::uuid, v_c_alpha, v_basic_id, 'trialing', 'monthly', v_now - interval '7 days', v_now + interval '7 days', v_now + interval '7 days', v_now + interval '7 days', true, 'DEMO Sandbox'),
    ('d0000020-0001-4001-8001-000000000002'::uuid, v_c_beta, v_pro_id, 'active', 'monthly', v_now - interval '20 days', v_now + interval '10 days', v_now + interval '10 days', null, true, 'DEMO Sandbox Card'),
    ('d0000020-0001-4001-8001-000000000003'::uuid, v_c_gamma, v_enterprise_id, 'active', 'yearly', v_now - interval '60 days', v_now + interval '305 days', v_now + interval '305 days', null, true, 'DEMO Manual'),
    ('d0000020-0001-4001-8001-000000000004'::uuid, v_c_delta, v_pro_id, 'expired', 'monthly', v_now - interval '60 days', v_now - interval '30 days', v_now - interval '30 days', null, false, null),
    ('d0000020-0001-4001-8001-000000000005'::uuid, v_c_epsilon, v_pro_id, 'active', 'monthly', v_now - interval '15 days', v_now + interval '15 days', v_now + interval '15 days', null, true, 'DEMO Sandbox')
  on conflict (company_id) do update set plan_id = excluded.plan_id, status = excluded.status, billing_cycle = excluded.billing_cycle,
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    next_renewal_at = excluded.next_renewal_at, trial_ends_at = excluded.trial_ends_at, auto_renewal = excluded.auto_renewal,
    payment_method_label = excluded.payment_method_label, updated_at = now();

  perform public.sync_company_subscription_denormalized(v_c_alpha);
  perform public.sync_company_subscription_denormalized(v_c_beta);
  perform public.sync_company_subscription_denormalized(v_c_gamma);
  perform public.sync_company_subscription_denormalized(v_c_delta);
  perform public.sync_company_subscription_denormalized(v_c_epsilon);
  update public.companies set status = 'Suspended', updated_at = now() where id = v_c_epsilon;

  -- ── Roles & permissions ───────────────────────────────────
  delete from public.user_roles ur using public.roles r where ur.role_id = r.id and r.company_id in (v_c_alpha, v_c_beta, v_c_gamma, v_c_delta, v_c_epsilon);
  delete from public.role_permissions rp using public.roles r where rp.role_id = r.id and r.company_id in (v_c_alpha, v_c_beta, v_c_gamma, v_c_delta, v_c_epsilon);
  delete from public.roles where company_id in (v_c_alpha, v_c_beta, v_c_gamma, v_c_delta, v_c_epsilon);

  insert into public.roles (id, company_id, name, description, is_system) values
    ('d0000030-0001-4001-8001-000000000001'::uuid, v_c_alpha, 'DEMO Alpha Admin', 'DEMO company administrator', true),
    ('d0000030-0001-4001-8001-000000000002'::uuid, v_c_beta, 'DEMO Beta Admin', 'DEMO company administrator', true),
    ('d0000030-0001-4001-8001-000000000003'::uuid, v_c_beta, 'DEMO Beta Finance Manager', 'DEMO finance manager', false),
    ('d0000030-0001-4001-8001-000000000004'::uuid, v_c_beta, 'DEMO Beta Employee', 'DEMO read-only employee', false),
    ('d0000030-0001-4001-8001-000000000005'::uuid, v_c_gamma, 'DEMO Gamma Admin', 'DEMO company administrator', true),
    ('d0000030-0001-4001-8001-000000000006'::uuid, v_c_delta, 'DEMO Delta Admin', 'DEMO company administrator', true),
    ('d0000030-0001-4001-8001-000000000007'::uuid, v_c_epsilon, 'DEMO Epsilon Admin', 'DEMO company administrator', true),
    ('d0000030-0001-4001-8001-000000000008'::uuid, v_c_beta, 'DEMO Beta Support Agent', 'DEMO support agent', false),
    ('d0000030-0001-4001-8001-000000000009'::uuid, v_c_gamma, 'DEMO Gamma Sales Manager', 'DEMO sales manager', false)
  on conflict (id) do update set name = excluded.name, description = excluded.description, updated_at = now();

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.id in ('d0000030-0001-4001-8001-000000000001'::uuid,'d0000030-0001-4001-8001-000000000002'::uuid,'d0000030-0001-4001-8001-000000000005'::uuid,'d0000030-0001-4001-8001-000000000006'::uuid,'d0000030-0001-4001-8001-000000000007'::uuid)
    and p.code in ('workspace.view','billing.view_own','billing.manage_own','billing.contact.edit_own','billing.payment_method.manage_own','billing.documents.download_own','customers.view','customers.create','customers.edit','bookings.view','bookings.create','invoices.view','reports.view','ai_chat.view','ai_chat.use','users.view','roles.view')
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.id in ('d0000030-0001-4001-8001-000000000003'::uuid)
    and p.code in ('workspace.view','billing.view_own','billing.manage_own','billing.contact.edit_own','billing.payment_method.manage_own','billing.documents.download_own')
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.id = 'd0000030-0001-4001-8001-000000000004'::uuid
    and p.code in ('workspace.view','billing.view_own','billing.documents.download_own','customers.view','bookings.view')
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.id = 'd0000030-0001-4001-8001-000000000008'::uuid
    and p.code in ('customers.view','customers.edit','bookings.view','bookings.edit','ai_chat.view','ai_chat.use','workspace.view','billing.view_own')
  on conflict do nothing;

  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
  where r.id = 'd0000030-0001-4001-8001-000000000009'::uuid
    and p.code in ('customers.view','customers.create','customers.edit','bookings.view','bookings.create','invoices.view','reports.view','workspace.view')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id) values
    ('d0000002-0001-4001-8001-000000000001'::uuid, 'd0000030-0001-4001-8001-000000000001'::uuid),
    (v_beta_admin, 'd0000030-0001-4001-8001-000000000002'::uuid),
    (v_gamma_admin, 'd0000030-0001-4001-8001-000000000005'::uuid),
    ('d0000002-0001-4001-8001-000000000004'::uuid, 'd0000030-0001-4001-8001-000000000003'::uuid),
    ('d0000002-0001-4001-8001-000000000005'::uuid, 'd0000030-0001-4001-8001-000000000004'::uuid),
    (v_support, 'd0000030-0001-4001-8001-000000000008'::uuid),
    (v_sales, 'd0000030-0001-4001-8001-000000000009'::uuid)
  on conflict do nothing;

  -- ── Billing contacts/profiles/payment methods ───────────────
  insert into public.company_billing_contacts (id, company_id, name, email, phone, is_active) values
    ('d0000080-0001-4001-8001-000000000001'::uuid, v_c_alpha, 'DEMO Alpha Billing', 'billing.alpha@vaultos.local', '+10000000011', true),
    ('d0000080-0001-4001-8001-000000000002'::uuid, v_c_beta, 'DEMO Beta Billing', 'billing.beta@vaultos.local', '+10000000012', true),
    ('d0000080-0001-4001-8001-000000000003'::uuid, v_c_gamma, 'DEMO Gamma Billing', 'billing.gamma@vaultos.local', '+10000000013', true),
    ('d0000080-0001-4001-8001-000000000004'::uuid, v_c_delta, 'DEMO Delta Billing', 'billing.delta@vaultos.local', '+10000000014', true),
    ('d0000080-0001-4001-8001-000000000005'::uuid, v_c_epsilon, 'DEMO Epsilon Billing', 'billing.epsilon@vaultos.local', '+10000000015', true)
  on conflict (id) do update set name = excluded.name, email = excluded.email, is_active = true, updated_at = now();

  insert into public.company_billing_profiles (company_id, legal_name, address, tax_id, payment_terms_days) values
    (v_c_alpha, 'DEMO Alpha LLC', '100 DEMO Trial Street', 'DEMO-TAX-ALPHA', 14),
    (v_c_beta, 'DEMO Beta LLC', '200 DEMO Pro Avenue', 'DEMO-TAX-BETA', 30),
    (v_c_gamma, 'DEMO Gamma LLC', '300 DEMO Enterprise Blvd', 'DEMO-TAX-GAMMA', 30),
    (v_c_delta, 'DEMO Delta LLC', '400 DEMO Expired Lane', 'DEMO-TAX-DELTA', 30),
    (v_c_epsilon, 'DEMO Epsilon LLC', '500 DEMO Suspended Road', 'DEMO-TAX-EPSILON', 30)
  on conflict (company_id) do update set legal_name = excluded.legal_name, address = excluded.address, tax_id = excluded.tax_id, updated_at = now();

  insert into public.company_payment_methods (id, company_id, payment_method_type_id, label, provider_token, is_default) values
    ('d0000070-0001-4001-8001-000000000001'::uuid, v_c_beta, coalesce((select id from public.payment_method_types where code = 'visa' limit 1), v_manual_method_id), 'DEMO Sandbox Visa •••• 4242', 'demo_sandbox_pm_beta', true)
  on conflict (id) do update set label = excluded.label, is_default = true, updated_at = now();

  update public.company_subscriptions set default_payment_method_id = 'd0000070-0001-4001-8001-000000000001'::uuid where company_id = v_c_beta;

  -- ── Financial scenarios ─────────────────────────────────────
  insert into public.billing_payments (id, company_id, subscription_id, payment_method_type_id, payment_method_label, provider, provider_payment_id, status, amount, currency, failure_code, failure_message, paid_at, metadata) values
    ('d0000040-0001-4001-8001-000000000001'::uuid, v_c_beta, 'd0000020-0001-4001-8001-000000000002'::uuid, v_manual_method_id, 'DEMO Sandbox Card', v_sandbox, 'demo_pay_success_001', 'succeeded', 99.00, 'USD', null, null, v_now - interval '5 days', v_meta || '{"scenario":"successful_payment"}'::jsonb),
    ('d0000040-0001-4001-8001-000000000002'::uuid, v_c_beta, 'd0000020-0001-4001-8001-000000000002'::uuid, v_manual_method_id, 'DEMO Sandbox Card', v_sandbox, 'demo_pay_failed_001', 'failed', 99.00, 'USD', 'card_declined', 'DEMO: Sandbox card declined', v_now - interval '2 days', v_meta || '{"scenario":"failed_payment"}'::jsonb),
    ('d0000040-0001-4001-8001-000000000003'::uuid, v_c_beta, 'd0000020-0001-4001-8001-000000000002'::uuid, v_manual_method_id, 'DEMO Sandbox Card', v_sandbox, 'demo_pay_pending_001', 'pending', 99.00, 'USD', null, null, null, v_meta || '{"scenario":"pending_payment"}'::jsonb),
    ('d0000040-0001-4001-8001-000000000004'::uuid, v_c_gamma, 'd0000020-0001-4001-8001-000000000003'::uuid, v_manual_method_id, 'DEMO Manual', v_sandbox, 'demo_pay_refunded_001', 'refunded', 299.00, 'USD', null, 'DEMO: Refund processed', v_now - interval '12 days', v_meta || '{"scenario":"refunded_payment"}'::jsonb)
  on conflict (id) do update set status = excluded.status, amount = excluded.amount, metadata = excluded.metadata, updated_at = now();

  insert into public.billing_invoices (id, invoice_number, company_id, subscription_id, billing_payment_id, status, currency, subtotal_amount, tax_amount, total_amount, period_start, period_end, line_items, issued_at, due_at, paid_at, voided_at) values
    ('d0000050-0001-4001-8001-000000000001'::uuid, 'DEMO-INV-PAID-001', v_c_beta, 'd0000020-0001-4001-8001-000000000002'::uuid, 'd0000040-0001-4001-8001-000000000001'::uuid, 'paid', 'USD', 99, 0, 99, v_now - interval '35 days', v_now - interval '5 days', '[{"description":"DEMO Pro Plan","quantity":1,"unit_amount":99,"total_amount":99}]'::jsonb, v_now - interval '35 days', v_now - interval '5 days', v_now - interval '5 days', null),
    ('d0000050-0001-4001-8001-000000000002'::uuid, 'DEMO-INV-DRAFT-001', v_c_alpha, 'd0000020-0001-4001-8001-000000000001'::uuid, null, 'draft', 'USD', 29, 0, 29, v_now, v_now + interval '30 days', '[{"description":"DEMO Basic Trial Conversion","quantity":1,"unit_amount":29,"total_amount":29}]'::jsonb, null, v_now + interval '14 days', null, null),
    ('d0000050-0001-4001-8001-000000000003'::uuid, 'DEMO-INV-OVERDUE-001', v_c_gamma, 'd0000020-0001-4001-8001-000000000003'::uuid, null, 'overdue', 'USD', 2990, 0, 2990, v_now - interval '45 days', v_now + interval '320 days', '[{"description":"DEMO Enterprise Annual","quantity":1,"unit_amount":2990,"total_amount":2990}]'::jsonb, v_now - interval '45 days', v_now - interval '15 days', null, null),
    ('d0000050-0001-4001-8001-000000000004'::uuid, 'DEMO-INV-ISSUED-001', v_c_gamma, 'd0000020-0001-4001-8001-000000000003'::uuid, null, 'issued', 'USD', 500, 0, 500, v_now - interval '10 days', v_now + interval '20 days', '[{"description":"DEMO Enterprise Add-on","quantity":1,"unit_amount":500,"total_amount":500}]'::jsonb, v_now - interval '10 days', v_now + interval '20 days', null, null),
    ('d0000050-0001-4001-8001-000000000005'::uuid, 'DEMO-INV-VOID-001', v_c_delta, 'd0000020-0001-4001-8001-000000000004'::uuid, null, 'void', 'USD', 99, 0, 99, v_now - interval '90 days', v_now - interval '60 days', '[{"description":"DEMO Cancelled Invoice","quantity":1,"unit_amount":99,"total_amount":99}]'::jsonb, v_now - interval '90 days', v_now - interval '75 days', null, v_now - interval '70 days')
  on conflict (id) do update set status = excluded.status, total_amount = excluded.total_amount, due_at = excluded.due_at, paid_at = excluded.paid_at, voided_at = excluded.voided_at, updated_at = now();

  insert into public.billing_receipts (id, receipt_number, company_id, subscription_id, billing_invoice_id, billing_payment_id, amount, currency, payment_method_label, issued_at) values
    ('d0000060-0001-4001-8001-000000000001'::uuid, 'DEMO-RCP-001', v_c_beta, 'd0000020-0001-4001-8001-000000000002'::uuid, 'd0000050-0001-4001-8001-000000000001'::uuid, 'd0000040-0001-4001-8001-000000000001'::uuid, 99, 'USD', 'DEMO Sandbox Card', v_now - interval '5 days')
  on conflict (id) do update set amount = excluded.amount, issued_at = excluded.issued_at;

  update public.billing_payments set receipt_id = 'd0000060-0001-4001-8001-000000000001'::uuid, billing_invoice_id = 'd0000050-0001-4001-8001-000000000001'::uuid where id = 'd0000040-0001-4001-8001-000000000001'::uuid;
  update public.billing_invoices set billing_payment_id = 'd0000040-0001-4001-8001-000000000001'::uuid where id = 'd0000050-0001-4001-8001-000000000001'::uuid;

  insert into public.subscription_events (id, company_id, subscription_id, event_type, title, description, metadata, occurred_at) values
    ('d00000c0-0001-4001-8001-000000000001'::uuid, v_c_beta, 'd0000020-0001-4001-8001-000000000002'::uuid, 'payment_received', 'DEMO Payment Received', '99 USD succeeded', v_meta, v_now - interval '5 days'),
    ('d00000c0-0001-4001-8001-000000000002'::uuid, v_c_epsilon, 'd0000020-0001-4001-8001-000000000005'::uuid, 'suspended', 'DEMO Subscription Suspended', 'Administrative suspension', v_meta, v_now - interval '3 days'),
    ('d00000c0-0001-4001-8001-000000000003'::uuid, v_c_epsilon, 'd0000020-0001-4001-8001-000000000005'::uuid, 'restored', 'DEMO Subscription Restored', 'Access restored after review', v_meta, v_now - interval '1 day'),
    ('d00000c0-0001-4001-8001-000000000004'::uuid, v_c_beta, 'd0000020-0001-4001-8001-000000000002'::uuid, 'renewal_upcoming', 'DEMO Upcoming Renewal', 'Renews in 10 days', v_meta, v_now - interval '1 day')
  on conflict (id) do nothing;

  insert into public.billing_audit_logs (id, event_type, company_id, user_id, source, metadata, occurred_at) values
    ('d0000090-0001-4001-8001-000000000001'::uuid, 'manual_payment_recorded', v_c_beta, 'd0000001-0001-4001-8001-000000000001'::uuid, 'manual', v_meta, v_now - interval '5 days'),
    ('d0000090-0001-4001-8001-000000000002'::uuid, 'plan_changed', v_c_gamma, 'd0000001-0001-4001-8001-000000000001'::uuid, 'manual', v_meta || '{"plan_code":"enterprise"}'::jsonb, v_now - interval '70 days'),
    ('d0000090-0001-4001-8001-000000000003'::uuid, 'subscription_suspended', v_c_epsilon, 'd0000001-0001-4001-8001-000000000001'::uuid, 'manual', v_meta, v_now - interval '3 days'),
    ('d0000090-0001-4001-8001-000000000004'::uuid, 'subscription_restored', v_c_epsilon, 'd0000001-0001-4001-8001-000000000001'::uuid, 'manual', v_meta, v_now - interval '1 day')
  on conflict (id) do nothing;

  -- ── Usage & feature flags ───────────────────────────────────
  insert into public.usage_records (id, company_id, metric_code, quantity, recorded_at, billing_period, source, idempotency_key) values
    ('d00000a0-0001-4001-8001-000000000001'::uuid, v_c_beta, 'ai_tokens', 125000, v_now - interval '1 day', v_period, 'demo_seed', 'demo-usage-beta-ai'),
    ('d00000a0-0001-4001-8001-000000000002'::uuid, v_c_beta, 'api_calls', 8420, v_now - interval '1 day', v_period, 'demo_seed', 'demo-usage-beta-api'),
    ('d00000a0-0001-4001-8001-000000000003'::uuid, v_c_gamma, 'ai_tokens', 890000, v_now - interval '1 day', v_period, 'demo_seed', 'demo-usage-gamma-ai'),
    ('d00000a0-0001-4001-8001-000000000004'::uuid, v_c_alpha, 'users', 3, v_now - interval '1 day', v_period, 'demo_seed', 'demo-usage-alpha-users')
  on conflict (id) do nothing;

  insert into public.company_usage_snapshots (id, company_id, snapshot_date, metrics, source) values
    ('d00000b0-0001-4001-8001-000000000001'::uuid, v_c_alpha, current_date, '{"ai_tokens":12000,"users":3,"api_calls":400,"demo":true}'::jsonb, 'daily_rollup'),
    ('d00000b0-0001-4001-8001-000000000002'::uuid, v_c_beta, current_date, '{"ai_tokens":125000,"users":12,"api_calls":8420,"demo":true}'::jsonb, 'daily_rollup'),
    ('d00000b0-0001-4001-8001-000000000003'::uuid, v_c_gamma, current_date, '{"ai_tokens":890000,"users":45,"api_calls":52000,"demo":true}'::jsonb, 'daily_rollup')
  on conflict (company_id, snapshot_date) do update set metrics = excluded.metrics, source = excluded.source;

  insert into public.company_feature_overrides (company_id, feature_code, override_state, reason, is_active, created_by)
  select v_c_alpha, 'ai_assistant', 'enabled', 'DEMO trial AI boost', true, 'd0000001-0001-4001-8001-000000000001'::uuid
  where not exists (select 1 from public.company_feature_overrides o where o.company_id = v_c_alpha and o.feature_code = 'ai_assistant' and o.is_active = true);

  insert into public.feature_flags (feature_code, is_globally_enabled, rollout_metadata)
  values ('ai_assistant', true, v_meta)
  on conflict (feature_code) do update set rollout_metadata = public.feature_flags.rollout_metadata || v_meta;

  -- ── CRM: customers, bookings, invoices, scenarios ───────────
  insert into public.customers (id, user_id, name, email, phone, notes) values
    ('d00000d0-0001-4001-8001-000000000001'::uuid, v_beta_admin, 'DEMO | Hot Lead | Nova Retail', 'nova.demo@vaultos.local', '+15550000001', 'DEMO hot lead — high intent, requested pricing'),
    ('d00000d0-0001-4001-8001-000000000002'::uuid, v_beta_admin, 'DEMO | Cold Lead | Quiet Corp', 'quiet.demo@vaultos.local', '+15550000002', 'DEMO cold lead — no activity in 90 days'),
    ('d00000d0-0001-4001-8001-000000000003'::uuid, v_sales, 'DEMO | Won Deal | Summit Hotels', 'summit.demo@vaultos.local', '+15550000003', 'DEMO deal won — enterprise package signed'),
    ('d00000d0-0001-4001-8001-000000000004'::uuid, v_sales, 'DEMO | Lost Deal | Apex Labs', 'apex.demo@vaultos.local', '+15550000004', 'DEMO deal lost — chose competitor'),
    ('d00000d0-0001-4001-8001-000000000005'::uuid, v_sales, 'DEMO | Open Opportunity | Bright Future', 'bright.demo@vaultos.local', '+15550000005', 'DEMO open opportunity — proposal sent'),
    ('d00000d0-0001-4001-8001-000000000006'::uuid, v_beta_admin, 'DEMO | Archived Customer | Legacy Co', 'legacy.demo@vaultos.local', '+15550000006', 'DEMO archived customer — churned 2025')
  on conflict (id) do update set name = excluded.name, notes = excluded.notes, updated_at = now();

  insert into public.bookings (id, user_id, customer_id, service, booking_date, status) values
    ('d00000e0-0001-4001-8001-000000000001'::uuid, v_beta_admin, 'd00000d0-0001-4001-8001-000000000001'::uuid, 'DEMO Activity: Discovery Call', v_now + interval '2 days', 'Confirmed'),
    ('d00000e0-0001-4001-8001-000000000002'::uuid, v_sales, 'd00000d0-0001-4001-8001-000000000005'::uuid, 'DEMO Activity: Proposal Review', v_now + interval '4 days', 'Pending'),
    ('d00000e0-0001-4001-8001-000000000003'::uuid, v_support, 'd00000d0-0001-4001-8001-000000000003'::uuid, 'DEMO Activity: Onboarding Kickoff', v_now - interval '3 days', 'Confirmed')
  on conflict (id) do update set service = excluded.service, status = excluded.status, updated_at = now();

  insert into public.invoices (id, user_id, customer_id, amount, status, invoice_date, invoice_type) values
    ('d00000f0-0001-4001-8001-000000000001'::uuid, v_sales, 'd00000d0-0001-4001-8001-000000000003'::uuid, 15000, 'Paid', v_now - interval '10 days', 'customer'),
    ('d00000f0-0001-4001-8001-000000000002'::uuid, v_beta_admin, 'd00000d0-0001-4001-8001-000000000001'::uuid, 2500, 'Unpaid', v_now - interval '2 days', 'customer'),
    ('d00000f0-0001-4001-8001-000000000003'::uuid, v_beta_admin, 'd00000d0-0001-4001-8001-000000000006'::uuid, 800, 'Overdue', v_now - interval '45 days', 'customer')
  on conflict (id) do update set amount = excluded.amount, status = excluded.status, updated_at = now();

  insert into public.demo_crm_scenarios (id, company_id, scenario_type, title, status, owner_user_id, related_customer_id, metadata, due_at) values
    ('d0000200-0001-4001-8001-000000000001'::uuid, v_c_beta, 'lead_hot', 'DEMO Hot Lead — Nova Retail', 'open', v_beta_admin, 'd00000d0-0001-4001-8001-000000000001'::uuid, v_meta, v_now + interval '3 days'),
    ('d0000200-0001-4001-8001-000000000002'::uuid, v_c_beta, 'lead_cold', 'DEMO Cold Lead — Quiet Corp', 'nurture', v_beta_admin, 'd00000d0-0001-4001-8001-000000000002'::uuid, v_meta, null),
    ('d0000200-0001-4001-8001-000000000003'::uuid, v_c_gamma, 'deal_won', 'DEMO Won Deal — Summit Hotels', 'won', v_sales, 'd00000d0-0001-4001-8001-000000000003'::uuid, v_meta, v_now - interval '10 days'),
    ('d0000200-0001-4001-8001-000000000004'::uuid, v_c_gamma, 'deal_lost', 'DEMO Lost Deal — Apex Labs', 'lost', v_sales, 'd00000d0-0001-4001-8001-000000000004'::uuid, v_meta, v_now - interval '20 days'),
    ('d0000200-0001-4001-8001-000000000005'::uuid, v_c_gamma, 'opportunity_open', 'DEMO Open Opportunity — Bright Future', 'open', v_sales, 'd00000d0-0001-4001-8001-000000000005'::uuid, v_meta, v_now + interval '7 days'),
    ('d0000200-0001-4001-8001-000000000006'::uuid, v_c_beta, 'customer_archived', 'DEMO Archived — Legacy Co', 'archived', v_beta_admin, 'd00000d0-0001-4001-8001-000000000006'::uuid, v_meta, null),
    ('d0000200-0001-4001-8001-000000000007'::uuid, v_c_beta, 'task', 'DEMO Task: Follow up hot lead', 'todo', v_support, 'd00000d0-0001-4001-8001-000000000001'::uuid, v_meta, v_now + interval '1 day'),
    ('d0000200-0001-4001-8001-000000000008'::uuid, v_c_gamma, 'note', 'DEMO Note: Enterprise discount approved', 'done', v_sales, null, v_meta, null),
    ('d0000200-0001-4001-8001-000000000009'::uuid, v_c_beta, 'activity', 'DEMO Activity: Support callback scheduled', 'scheduled', v_support, 'd00000d0-0001-4001-8001-000000000003'::uuid, v_meta, v_now + interval '6 hours'),
    ('d0000200-0001-4001-8001-000000000010'::uuid, v_c_gamma, 'contact', 'DEMO Contact: VP Sales Bright Future', 'active', v_sales, 'd00000d0-0001-4001-8001-000000000005'::uuid, v_meta, null)
  on conflict (id) do update set title = excluded.title, status = excluded.status, metadata = excluded.metadata, updated_at = now();

  -- ── Demo API credentials (dummy) ────────────────────────────
  insert into public.demo_api_credentials (id, company_id, name, key_prefix, key_last_four, scopes, metadata) values
    ('d0000210-0001-4001-8001-000000000001'::uuid, v_c_beta, 'DEMO CRM Integration Key', 'vlt_demo_beta_', '7f3a', array['read:customers','write:bookings'], v_meta),
    ('d0000210-0001-4001-8001-000000000002'::uuid, v_c_gamma, 'DEMO Analytics Export Key', 'vlt_demo_gamma_', '9b2c', array['read:reports','read:billing'], v_meta)
  on conflict (company_id, name) do update set key_prefix = excluded.key_prefix, scopes = excluded.scopes, metadata = excluded.metadata;

  -- ── AI: assistants, conversations, executions ─────────────
  insert into public.ai_assistant_settings (id, company_id, assistant_name, language, tone, welcome_message, knowledge_enabled)
  values
    ('d0000100-0001-4001-8001-000000000001'::uuid, v_c_alpha, 'DEMO Alpha Assistant', 'en', 'friendly', 'DEMO: Welcome to Alpha trial assistant.', false),
    (v_ai_beta, v_c_beta, 'DEMO Beta Assistant', 'en', 'professional', 'DEMO: Beta professional assistant ready.', true),
    ('d0000100-0001-4001-8001-000000000003'::uuid, v_c_gamma, 'DEMO Gamma Assistant', 'en', 'formal', 'DEMO: Gamma enterprise assistant.', true)
  on conflict (company_id) do update set assistant_name = excluded.assistant_name, welcome_message = excluded.welcome_message, updated_at = now();

  insert into public.prompt_templates (id, company_id, key, display_name, template_type, section_order, is_enabled) values
    (v_pt_beta, v_c_beta, 'demo_conversation', 'DEMO Conversation Template', 'conversation', '["system","context","user"]'::jsonb, true)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();

  insert into public.prompt_template_versions (id, template_id, version_number, version_label, sections, is_active) values
    (v_ptv_beta, v_pt_beta, 1, '1.0.0', '{"system":"DEMO system prompt for VaultOS"}'::jsonb, true)
  on conflict (template_id, version_number) do update set sections = excluded.sections, is_active = true;

  update public.prompt_templates set active_version_id = v_ptv_beta where id = v_pt_beta;

  insert into public.conversations (id, company_id, ai_assistant_id, channel_type, state, customer_id, assigned_user_id, metadata, last_message_at) values
    (v_conv_hot, v_c_beta, v_ai_beta, 'web_chat', 'waiting_user', 'd00000d0-0001-4001-8001-000000000001'::uuid, v_support, v_meta || '{"scenario":"ai_support"}'::jsonb, v_now - interval '2 hours'),
    ('d0000110-0001-4001-8001-000000000002'::uuid, v_c_gamma, 'd0000100-0001-4001-8001-000000000003'::uuid, 'whatsapp', 'completed', 'd00000d0-0001-4001-8001-000000000005'::uuid, v_sales, v_meta || '{"scenario":"ai_sales"}'::jsonb, v_now - interval '1 day')
  on conflict (id) do update set state = excluded.state, metadata = excluded.metadata, updated_at = now();

  insert into public.conversation_participants (id, conversation_id, participant_type, display_name, profile_ref, metadata) values
    ('d0000120-0001-4001-8001-000000000001'::uuid, v_conv_hot, 'customer', 'DEMO Nova Retail', 'd00000d0-0001-4001-8001-000000000001'::uuid, v_meta),
    ('d0000120-0001-4001-8001-000000000002'::uuid, v_conv_hot, 'assistant', 'DEMO Beta Assistant', v_ai_beta, v_meta),
    ('d0000120-0001-4001-8001-000000000003'::uuid, v_conv_hot, 'employee', 'DEMO Support Agent', v_support, v_meta)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();

  insert into public.conversation_messages (id, conversation_id, participant_id, message_type, content, metadata, status) values
    ('d0000130-0001-4001-8001-000000000001'::uuid, v_conv_hot, 'd0000120-0001-4001-8001-000000000001'::uuid, 'incoming', 'DEMO: What is included in the Pro plan?', v_meta, 'read'),
    ('d0000130-0001-4001-8001-000000000002'::uuid, v_conv_hot, 'd0000120-0001-4001-8001-000000000002'::uuid, 'outgoing', 'DEMO: Pro includes advanced billing, AI assistant, and priority support.', v_meta, 'delivered')
  on conflict (id) do update set content = excluded.content, status = excluded.status;

  insert into public.prompt_builds (id, company_id, conversation_id, template_id, template_version_id, template_key, template_type, sections, final_prompt) values
    ('d0000152-0001-4001-8001-000000000001'::uuid, v_c_beta, v_conv_hot, v_pt_beta, v_ptv_beta, 'demo_conversation', 'conversation', '[]'::jsonb, 'DEMO final prompt assembled for support conversation.')
  on conflict (id) do update set final_prompt = excluded.final_prompt;

  insert into public.ai_traces (id, trace_id, correlation_id, company_id, conversation_id, status, started_at, completed_at, duration_ms) values
    ('d0000160-0001-4001-8001-000000000001'::uuid, 'd0000160-0001-4001-8001-0000000000a1'::uuid, 'd0000160-0001-4001-8001-0000000000b1'::uuid, v_c_beta, v_conv_hot, 'completed', v_now - interval '2 hours', v_now - interval '2 hours' + interval '850 milliseconds', 850)
  on conflict (id) do update set status = excluded.status, duration_ms = excluded.duration_ms;

  insert into public.ai_executions (id, company_id, conversation_id, prompt_build_id, provider_key, model, status, token_usage, started_at, completed_at, duration_ms) values
    ('d0000140-0001-4001-8001-000000000001'::uuid, v_c_beta, v_conv_hot, 'd0000152-0001-4001-8001-000000000001'::uuid, 'openai', 'gpt-4o-mini', 'succeeded', '{"prompt_tokens":420,"completion_tokens":118,"total_tokens":538}'::jsonb, v_now - interval '2 hours', v_now - interval '2 hours' + interval '850 milliseconds', 850)
  on conflict (id) do update set status = excluded.status, token_usage = excluded.token_usage;

  insert into public.ai_token_cost_records (id, company_id, trace_id, execution_id, billing_period, provider_key, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost) values
    ('d0000161-0001-4001-8001-000000000001'::uuid, v_c_beta, 'd0000160-0001-4001-8001-000000000001'::uuid, 'd0000140-0001-4001-8001-000000000001'::uuid, v_period, 'openai', 'gpt-4o-mini', 420, 118, 538, 0.002150)
  on conflict (id) do update set total_tokens = excluded.total_tokens, estimated_cost = excluded.estimated_cost;

  -- ── Knowledge / document metadata (dummy files) ───────────
  insert into public.knowledge_sources (id, company_id, key, display_name, source_type, configuration, metadata) values
    ('d0000170-0001-4001-8001-000000000001'::uuid, v_c_beta, 'demo_files', 'DEMO Document Library', 'manual', '{"demo":true}'::jsonb, v_meta),
    ('d0000170-0001-4001-8001-000000000002'::uuid, v_c_gamma, 'demo_api_docs', 'DEMO API Documentation', 'api', '{"demo":true,"endpoint":"https://demo.vaultos.local"}'::jsonb, v_meta)
  on conflict (company_id, key) do update set display_name = excluded.display_name, metadata = excluded.metadata, updated_at = now();

  insert into public.knowledge_documents (id, company_id, source_id, title, description, language, version, status, checksum, mime_type, metadata) values
    ('d0000171-0001-4001-8001-000000000001'::uuid, v_c_beta, 'd0000170-0001-4001-8001-000000000001'::uuid, 'DEMO Service Agreement.pdf', 'DEMO dummy document metadata — not a real file', 'en', 1, 'published', 'demo_checksum_agreement', 'application/pdf', v_meta || '{"file_size_bytes":245760,"storage_key":"demo/agreement.pdf"}'::jsonb),
    ('d0000171-0001-4001-8001-000000000002'::uuid, v_c_gamma, 'd0000170-0001-4001-8001-000000000002'::uuid, 'DEMO Enterprise SLA.pdf', 'DEMO dummy SLA document metadata', 'en', 1, 'published', 'demo_checksum_sla', 'application/pdf', v_meta || '{"file_size_bytes":512000,"storage_key":"demo/sla.pdf"}'::jsonb)
  on conflict (id) do update set title = excluded.title, metadata = excluded.metadata, updated_at = now();

  -- ── Notifications ───────────────────────────────────────────
  insert into public.notifications (id, company_id, user_id, title, message, type, category, is_read, created_at) values
    ('d0000180-0001-4001-8001-000000000001'::uuid, v_c_beta, v_beta_admin, 'DEMO Billing Alert', '{"messageKey":"notifications.demo.billingAlert","params":{"detail":"Payment failed for DEMO Sandbox Card"}}', 'error', 'subscription', false, v_now - interval '2 hours'),
    ('d0000180-0001-4001-8001-000000000002'::uuid, v_c_beta, v_beta_admin, 'DEMO Workspace Alert', '{"messageKey":"notifications.demo.workspace","params":{"detail":"Usage at 82% of plan limit"}}', 'warning', 'system', false, v_now - interval '5 hours'),
    ('d0000180-0001-4001-8001-000000000003'::uuid, v_c_beta, 'd0000002-0001-4001-8001-000000000005'::uuid, 'DEMO System Notice', '{"messageKey":"notifications.demo.system","params":{"detail":"New feature available"}}', 'info', 'system', true, v_now - interval '2 days'),
    ('d0000180-0001-4001-8001-000000000004'::uuid, v_c_gamma, v_gamma_admin, 'DEMO Invoice Overdue', '{"messageKey":"notifications.demo.invoice","params":{"invoice":"DEMO-INV-OVERDUE-001"}}', 'warning', 'invoice', false, v_now - interval '1 day'),
    ('d0000180-0001-4001-8001-000000000005'::uuid, v_c_beta, v_support, 'DEMO Support Queue', '{"messageKey":"notifications.demo.support","params":{"tickets":3}}', 'info', 'system', false, v_now - interval '30 minutes'),
    ('d0000180-0001-4001-8001-000000000006'::uuid, v_c_gamma, v_sales, 'DEMO Deal Won', '{"messageKey":"notifications.demo.deal","params":{"customer":"Summit Hotels"}}', 'success', 'system', true, v_now - interval '10 days')
  on conflict (id) do update set title = excluded.title, message = excluded.message, is_read = excluded.is_read;

  -- ── Platform audit logs ───────────────────────────────────
  insert into public.audit_logs (id, user_id, company_id, action, entity, entity_id, metadata, created_at) values
    ('d0000190-0001-4001-8001-000000000001'::uuid, v_beta_admin, v_c_beta, 'CREATE', 'customers', 'd00000d0-0001-4001-8001-000000000001', v_meta, v_now - interval '3 days'),
    ('d0000190-0001-4001-8001-000000000002'::uuid, v_sales, v_c_gamma, 'UPDATE', 'demo_crm_scenarios', 'd0000200-0001-4001-8001-000000000003', v_meta || '{"change":"status->won"}'::jsonb, v_now - interval '10 days'),
    ('d0000190-0001-4001-8001-000000000003'::uuid, 'd0000001-0001-4001-8001-000000000001'::uuid, v_c_epsilon, 'UPDATE', 'companies', v_c_epsilon::text, v_meta || '{"change":"restored"}'::jsonb, v_now - interval '1 day')
  on conflict (id) do nothing;

  -- ── Historical analytics (90 days) ────────────────────────
  for v_i in 0..89 loop
    v_d := current_date - v_i;
    v_mrr := 350 + (89 - v_i) * 1.4 + (random() * 20);
    insert into public.financial_analytics_snapshots (snapshot_date, granularity, metrics, dimensions, computed_at)
    values (
      v_d, 'daily',
      jsonb_build_object(
        'schema_version', 1, 'demo', true, 'demo_env', 'vaultos_enterprise_v1',
        'mrr', round(v_mrr, 2), 'arr', round(v_mrr * 12, 2),
        'arpu', 79.5, 'active_subscriptions', 3 + (v_i % 4),
        'trialing_subscriptions', 1, 'failed_payments_30d', 1 + (v_i % 3),
        'failed_payment_rate', round(2.5 + (v_i % 5) * 0.3, 2),
        'payment_success_rate', round(94.0 + (v_i % 6) * 0.5, 2),
        'user_growth', 10 + v_i, 'company_growth', 2 + (v_i / 15)::integer
      ),
      jsonb_build_object('source', 'demo_seed', 'period_index', v_i),
      v_now - (v_i || ' days')::interval
    )
    on conflict (snapshot_date, granularity) do update
      set metrics = excluded.metrics, dimensions = excluded.dimensions, computed_at = excluded.computed_at;
  end loop;

  -- ── Sandbox platform defaults ───────────────────────────────
  insert into public.billing_settings (definition_code, scope_type, scope_id, value, version)
  select 'payment_sandbox_mode', 'platform', null, 'true'::jsonb, 1
  where not exists (select 1 from public.billing_settings where definition_code = 'payment_sandbox_mode' and scope_type = 'platform' and scope_id is null);

  update public.payment_providers set is_active = true, display_name = 'DEMO Sandbox (Test)' where code = 'sandbox';

  begin
    perform public.financial_compute_analytics_snapshot_v1(current_date);
  exception when others then
    raise notice 'DEMO analytics snapshot skipped: %', sqlerrm;
  end;

  update public.demo_environment_manifest
  set seeded_at = coalesce(seeded_at, now()), last_seed_at = now(),
      metadata = metadata || jsonb_build_object('companies', 5, 'users', 8, 'last_seed', now())
  where env_key = 'vaultos_enterprise_v1';

  alter table public.companies enable trigger trg_notify_subscription_events;
  alter table public.profiles enable trigger trg_notify_profile_events;
  alter table public.roles enable trigger trg_notify_role_events;
  alter table public.customers enable trigger trg_notify_customer_created;
  alter table public.bookings enable trigger trg_notify_booking_changes;
  alter table public.audit_logs enable trigger trg_notify_audit_events;

  return jsonb_build_object(
    'status', 'seed_complete',
    'demo_env', 'vaultos_enterprise_v1',
    'companies', 5,
    'users', 8,
    'seeded_at', now()
  );
end;
$$;

revoke all on function public.seed_enterprise_demo_v1() from public;
grant execute on function public.seed_enterprise_demo_v1() to service_role;

revoke all on function public.teardown_enterprise_demo_v1() from public;
grant execute on function public.teardown_enterprise_demo_v1() to service_role;

-- Initial seed on migration apply
select public.seed_enterprise_demo_v1();
