-- Additive metadata for WhatsApp Embedded Signup / Coexistence preparation.
-- Does NOT store secrets. Does NOT alter company_whatsapp_settings credential columns.
-- Does NOT rewrite existing production rows.

create table if not exists public.company_whatsapp_embedded_signup (
  company_id uuid primary key references public.companies(id) on delete cascade,
  onboarding_method text not null default 'embedded_signup'
    check (onboarding_method in ('manual', 'embedded_signup')),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'blocked_existing_connection')),
  meta_app_id text,
  business_portfolio_id text,
  phone_number_id text,
  business_account_id text,
  coexistence_eligible boolean,
  coexistence_enabled boolean not null default false,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_wa_es_phone_number_id
  on public.company_whatsapp_embedded_signup(phone_number_id)
  where phone_number_id is not null and phone_number_id <> '';

alter table public.company_whatsapp_embedded_signup enable row level security;

drop policy if exists company_whatsapp_embedded_signup_select on public.company_whatsapp_embedded_signup;
create policy company_whatsapp_embedded_signup_select
  on public.company_whatsapp_embedded_signup for select
  using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (
        public.is_super_admin()
        or (
          company_id = public.current_company_id()
          and public.whatsapp_settings_can_manage(company_id)
        )
      )
    )
  );

drop policy if exists company_whatsapp_embedded_signup_write on public.company_whatsapp_embedded_signup;
create policy company_whatsapp_embedded_signup_write
  on public.company_whatsapp_embedded_signup for all
  using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (
        public.is_super_admin()
        or (
          company_id = public.current_company_id()
          and public.whatsapp_settings_can_manage(company_id)
        )
      )
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (
        public.is_super_admin()
        or (
          company_id = public.current_company_id()
          and public.whatsapp_settings_can_manage(company_id)
        )
      )
    )
  );

comment on table public.company_whatsapp_embedded_signup is
  'Non-secret Embedded Signup / Coexistence metadata. Secrets remain in company_whatsapp_settings.';
