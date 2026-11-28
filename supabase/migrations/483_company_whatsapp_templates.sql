-- Phase 1: company-scoped WhatsApp template inventory synced from Meta.
-- Depends on: company_whatsapp_settings (150+), companies, current_company_id/is_super_admin helpers.
-- Does NOT create Meta templates (Phase 2). Migration 482 (template_bindings jsonb) is independent and optional.

create table if not exists public.company_whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purpose_key text not null,
  language_code text not null,
  meta_template_name text not null,
  meta_template_id text,
  meta_status text not null default 'NOT_CREATED'
    check (meta_status in (
      'NOT_CREATED',
      'PENDING',
      'APPROVED',
      'REJECTED',
      'PAUSED',
      'DISABLED',
      'IN_APPEAL',
      'DELETED',
      'UNKNOWN'
    )),
  category text,
  recipient text,
  last_synced_at timestamptz,
  last_error text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_whatsapp_templates_purpose_lang_uniq
    unique (company_id, purpose_key, language_code),
  constraint company_whatsapp_templates_meta_name_lang_uniq
    unique (company_id, meta_template_name, language_code)
);

create index if not exists company_whatsapp_templates_company_idx
  on public.company_whatsapp_templates (company_id);

create index if not exists company_whatsapp_templates_company_status_idx
  on public.company_whatsapp_templates (company_id, meta_status);

comment on table public.company_whatsapp_templates is
  'Per-company WhatsApp template rows. meta_status is sourced from Meta Graph sync (not frontend).';

alter table public.company_whatsapp_templates enable row level security;

drop policy if exists company_whatsapp_templates_select on public.company_whatsapp_templates;
create policy company_whatsapp_templates_select
  on public.company_whatsapp_templates
  for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists company_whatsapp_templates_write on public.company_whatsapp_templates;
create policy company_whatsapp_templates_write
  on public.company_whatsapp_templates
  for all
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.is_company_admin())
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (company_id = public.current_company_id() and public.is_company_admin())
    )
  );

revoke all on table public.company_whatsapp_templates from anon, public;
grant select on table public.company_whatsapp_templates to authenticated;
grant select, insert, update, delete on table public.company_whatsapp_templates to service_role;
