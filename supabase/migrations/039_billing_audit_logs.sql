-- ============================================================
-- Vault OS – Billing: Audit Log (Phase 1)
-- Architecture: billing-subscriptions.md v4 §3
-- ============================================================

create table if not exists public.billing_audit_event_types (
  code text primary key,
  label text not null,
  description text,
  is_active boolean not null default true
);

insert into public.billing_audit_event_types (code, label, description)
values
  ('subscription_created', 'Subscription Created', 'New subscription record created'),
  ('plan_changed', 'Plan Changed', 'Subscription plan assignment changed'),
  ('billing_contact_changed', 'Billing Contact Changed', 'Billing contact updated'),
  ('payment_method_changed', 'Payment Method Changed', 'Default or saved payment method changed'),
  ('auto_renewal_changed', 'Auto Renewal Changed', 'Auto-renewal flag toggled'),
  ('manual_invoice_created', 'Manual Invoice Created', 'Admin created invoice outside payment flow'),
  ('manual_payment_recorded', 'Manual Payment Recorded', 'Admin recorded a manual payment'),
  ('subscription_suspended', 'Subscription Suspended', 'Subscription or company access suspended'),
  ('subscription_restored', 'Subscription Restored', 'Subscription restored after payment'),
  ('invoice_voided', 'Invoice Voided', 'Invoice voided or canceled'),
  ('receipt_generated', 'Receipt Generated', 'Payment receipt issued'),
  ('billing_settings_modified', 'Billing Settings Modified', 'Billing settings changed'),
  ('billing_profile_modified', 'Billing Profile Modified', 'Company billing profile changed'),
  ('payment_retry_scheduled', 'Payment Retry Scheduled', 'Automatic payment retry scheduled'),
  ('document_number_format_changed', 'Document Number Format Changed', 'Invoice/receipt format updated'),
  ('feature_override_created', 'Feature Override Created', 'Company feature override added'),
  ('feature_override_revoked', 'Feature Override Revoked', 'Company feature override revoked'),
  ('usage_manual_adjustment', 'Usage Manual Adjustment', 'Admin manual usage correction')
on conflict (code) do update
set label = excluded.label, description = excluded.description;

create table if not exists public.billing_audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null references public.billing_audit_event_types(code),
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'system'
    check (source in ('system', 'manual', 'api')),
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_billing_audit_logs_occurred
  on public.billing_audit_logs(occurred_at desc);
create index if not exists idx_billing_audit_logs_company
  on public.billing_audit_logs(company_id, occurred_at desc);
create index if not exists idx_billing_audit_logs_event_type
  on public.billing_audit_logs(event_type);

alter table public.billing_audit_logs enable row level security;
alter table public.billing_audit_event_types enable row level security;

drop policy if exists billing_audit_event_types_select on public.billing_audit_event_types;
create policy billing_audit_event_types_select
  on public.billing_audit_event_types for select
  using (auth.role() = 'authenticated');

drop policy if exists billing_audit_logs_select on public.billing_audit_logs;
create policy billing_audit_logs_select
  on public.billing_audit_logs for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  );

drop policy if exists billing_audit_logs_insert on public.billing_audit_logs;
create policy billing_audit_logs_insert
  on public.billing_audit_logs for insert
  with check (false);

drop policy if exists billing_audit_logs_update on public.billing_audit_logs;
create policy billing_audit_logs_update
  on public.billing_audit_logs for update
  using (false)
  with check (false);

drop policy if exists billing_audit_logs_delete on public.billing_audit_logs;
create policy billing_audit_logs_delete
  on public.billing_audit_logs for delete
  using (false);
