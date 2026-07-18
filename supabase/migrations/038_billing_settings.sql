-- ============================================================
-- Vault OS – Billing: Settings Module (Phase 1)
-- Architecture: billing-subscriptions.md v4 §2, §6
-- ============================================================

create table if not exists public.billing_setting_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text not null
    check (category in ('general', 'subscription', 'documents', 'branding', 'payments', 'communications', 'webhooks', 'usage', 'health', 'entitlements')),
  label text not null,
  description text,
  value_type text not null
    check (value_type in ('string', 'integer', 'decimal', 'boolean', 'json', 'template_ref')),
  scope_type text not null default 'platform'
    check (scope_type in ('platform', 'company', 'both')),
  default_value jsonb not null default 'null'::jsonb,
  validation_schema jsonb not null default '{}'::jsonb,
  is_sensitive boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_settings (
  id uuid primary key default gen_random_uuid(),
  definition_code text not null references public.billing_setting_definitions(code) on delete cascade,
  scope_type text not null check (scope_type in ('platform', 'company')),
  scope_id uuid references public.companies(id) on delete cascade,
  value jsonb not null,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (definition_code, scope_type, scope_id)
);

create index if not exists idx_billing_settings_scope
  on public.billing_settings(scope_type, scope_id);

create table if not exists public.billing_email_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text not null unique,
  scope_type text not null default 'platform' check (scope_type in ('platform', 'company')),
  subject jsonb not null default '{"en":"","ar":""}'::jsonb,
  body_html jsonb not null default '{"en":"","ar":""}'::jsonb,
  body_text jsonb not null default '{"en":"","ar":""}'::jsonb,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists billing_email_templates_updated_at on public.billing_email_templates;
create trigger billing_email_templates_updated_at
  before update on public.billing_email_templates
  for each row execute procedure public.set_updated_at();

-- Seed definitions
insert into public.billing_setting_definitions (code, category, label, description, value_type, scope_type, default_value, sort_order)
values
  ('default_currency', 'general', 'Default Currency', 'Platform default billing currency', 'string', 'platform', '"USD"'::jsonb, 1),
  ('vat_percentage', 'general', 'VAT / Tax Percentage', 'Default tax rate applied to invoices', 'decimal', 'platform', '0'::jsonb, 2),
  ('tax_inclusive_pricing', 'general', 'Tax Inclusive Pricing', 'Whether plan prices include tax', 'boolean', 'platform', 'false'::jsonb, 3),
  ('grace_period_days', 'subscription', 'Grace Period Duration', 'Days after failed renewal before expiration', 'integer', 'platform', '7'::jsonb, 10),
  ('auto_renewal_default', 'subscription', 'Auto Renewal Default', 'Default auto-renewal for new subscriptions', 'boolean', 'platform', 'true'::jsonb, 11),
  ('trial_duration_days', 'subscription', 'Trial Duration', 'Default trial length in days', 'integer', 'platform', '14'::jsonb, 12),
  ('invoice_number_format', 'documents', 'Invoice Number Format', 'Tokens: {YYYY},{MM},{COMPANY_ID_SHORT},{SEQ}', 'string', 'platform', '"INV-{YYYY}{MM}-{SEQ}"'::jsonb, 20),
  ('receipt_number_format', 'documents', 'Receipt Number Format', 'Tokens: {YYYY},{MM},{COMPANY_ID_SHORT},{SEQ}', 'string', 'platform', '"RCPT-{YYYY}{MM}-{SEQ}"'::jsonb, 21),
  ('default_payment_terms_days', 'documents', 'Default Payment Terms', 'Days until invoice due date', 'integer', 'both', '30'::jsonb, 22),
  ('invoice_logo_url', 'branding', 'Invoice Logo URL', 'Platform issuer logo for documents', 'string', 'platform', 'null'::jsonb, 30),
  ('invoice_footer_text', 'branding', 'Invoice Footer Text', 'Footer on platform billing documents', 'string', 'platform', '"Thank you for your business."'::jsonb, 31),
  ('issuer_legal_name', 'branding', 'Issuer Legal Name', 'Legal entity name on invoices', 'string', 'platform', '"VaultOS Inc."'::jsonb, 32),
  ('issuer_address', 'branding', 'Issuer Address', 'Legal address on invoices', 'string', 'platform', 'null'::jsonb, 33),
  ('issuer_tax_id', 'branding', 'Issuer Tax ID', 'Tax identifier on invoices', 'string', 'platform', 'null'::jsonb, 34),
  ('payment_retry_max_attempts', 'payments', 'Payment Retry Max Attempts', 'Maximum automatic payment retries', 'integer', 'platform', '3'::jsonb, 40),
  ('payment_retry_interval_hours', 'payments', 'Payment Retry Interval', 'Hours between payment retries', 'integer', 'platform', '24'::jsonb, 41),
  ('supported_payment_method_codes', 'payments', 'Supported Payment Methods', 'Enabled payment method type codes', 'json', 'platform', '["visa","mastercard","manual"]'::jsonb, 42),
  ('billing_from_email', 'communications', 'Billing From Email', 'Sender address for billing emails', 'string', 'platform', '"billing@vaultos.app"'::jsonb, 50),
  ('email_template_payment_success', 'communications', 'Payment Success Template', 'Template code for successful payment email', 'template_ref', 'platform', '"payment_success"'::jsonb, 51),
  ('email_template_payment_failed', 'communications', 'Payment Failed Template', 'Template code for failed payment email', 'template_ref', 'platform', '"payment_failed"'::jsonb, 52),
  ('email_template_expiring_soon', 'communications', 'Expiring Soon Template', 'Template code for renewal reminder', 'template_ref', 'platform', '"expiring_soon"'::jsonb, 53),
  ('email_template_grace_period', 'communications', 'Grace Period Template', 'Template code for grace period notice', 'template_ref', 'platform', '"grace_period"'::jsonb, 54),
  ('webhook_retry_max_attempts', 'webhooks', 'Webhook Retry Max Attempts', 'Max delivery retries for outbound webhooks', 'integer', 'platform', '5'::jsonb, 60),
  ('webhook_retry_backoff_seconds', 'webhooks', 'Webhook Retry Backoff', 'Base backoff seconds for webhook retries', 'integer', 'platform', '60'::jsonb, 61),
  ('webhook_signature_tolerance_seconds', 'webhooks', 'Webhook Signature Tolerance', 'Allowed clock skew for webhook signatures', 'integer', 'platform', '300'::jsonb, 62),
  ('usage_rollup_schedule_cron', 'usage', 'Usage Rollup Schedule', 'Cron expression for usage aggregation', 'string', 'platform', '"0 * * * *"'::jsonb, 70),
  ('usage_record_retention_days', 'usage', 'Usage Record Retention', 'Days to retain granular usage records', 'integer', 'platform', '90'::jsonb, 71),
  ('health_probe_interval_seconds', 'health', 'Health Probe Interval', 'Seconds between billing health probes', 'integer', 'platform', '300'::jsonb, 80),
  ('health_alert_threshold_failed_payments', 'health', 'Failed Payment Alert Threshold', 'Failed payments in 24h before degraded status', 'integer', 'platform', '10'::jsonb, 81),
  ('entitlements_cache_ttl_seconds', 'entitlements', 'Entitlements Cache TTL', 'Client-side entitlements cache TTL', 'integer', 'platform', '60'::jsonb, 90)
on conflict (code) do update
set
  category = excluded.category,
  label = excluded.label,
  description = excluded.description,
  value_type = excluded.value_type,
  scope_type = excluded.scope_type,
  default_value = excluded.default_value,
  sort_order = excluded.sort_order;

insert into public.billing_email_templates (template_code, subject, body_html, variables)
values
  (
    'payment_success',
    '{"en":"Payment received","ar":"تم استلام الدفع"}'::jsonb,
    '{"en":"<p>Your payment was successful.</p>","ar":"<p>تم الدفع بنجاح.</p>"}'::jsonb,
    '["company_name","amount","currency","invoice_number"]'::jsonb
  ),
  (
    'payment_failed',
    '{"en":"Payment failed","ar":"فشل الدفع"}'::jsonb,
    '{"en":"<p>Your payment could not be processed.</p>","ar":"<p>تعذر معالجة الدفع.</p>"}'::jsonb,
    '["company_name","amount","currency"]'::jsonb
  ),
  (
    'expiring_soon',
    '{"en":"Subscription expiring soon","ar":"الاشتراك ينتهي قريباً"}'::jsonb,
    '{"en":"<p>Your subscription renews soon.</p>","ar":"<p>اشتراكك سيتجدد قريباً.</p>"}'::jsonb,
    '["company_name","renewal_date"]'::jsonb
  ),
  (
    'grace_period',
    '{"en":"Grace period started","ar":"بدأت فترة السماح"}'::jsonb,
    '{"en":"<p>Your subscription is in grace period.</p>","ar":"<p>اشتراكك في فترة السماح.</p>"}'::jsonb,
    '["company_name","grace_period_ends_at"]'::jsonb
  )
on conflict (template_code) do nothing;

-- Seed platform values from defaults
insert into public.billing_settings (definition_code, scope_type, scope_id, value)
select d.code, 'platform', null, d.default_value
from public.billing_setting_definitions d
on conflict (definition_code, scope_type, scope_id) do nothing;

alter table public.billing_setting_definitions enable row level security;
alter table public.billing_settings enable row level security;
alter table public.billing_email_templates enable row level security;

drop policy if exists billing_setting_definitions_select on public.billing_setting_definitions;
create policy billing_setting_definitions_select
  on public.billing_setting_definitions for select
  using (auth.role() = 'authenticated');

drop policy if exists billing_setting_definitions_write on public.billing_setting_definitions;
create policy billing_setting_definitions_write
  on public.billing_setting_definitions for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists billing_settings_select on public.billing_settings;
create policy billing_settings_select
  on public.billing_settings for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or scope_type = 'platform'
      or scope_id = public.current_company_id()
    )
  );

drop policy if exists billing_settings_write on public.billing_settings;
create policy billing_settings_write
  on public.billing_settings for all
  using (false)
  with check (false);

drop policy if exists billing_email_templates_select on public.billing_email_templates;
create policy billing_email_templates_select
  on public.billing_email_templates for select
  using (auth.role() = 'authenticated');

drop policy if exists billing_email_templates_write on public.billing_email_templates;
create policy billing_email_templates_write
  on public.billing_email_templates for all
  using (false)
  with check (false);
