-- Purpose-specific Meta WhatsApp template bindings (sales / worker / status).
-- approvalStatus must be set to 'approved' only after Meta shows APPROVED on the WABA.

alter table public.company_whatsapp_settings
  add column if not exists template_bindings jsonb not null default '{}'::jsonb;

comment on column public.company_whatsapp_settings.template_bindings is
  'Map of WhatsApp message purpose → { metaName, language, approvalStatus }. Only approvalStatus=approved may be sent.';
