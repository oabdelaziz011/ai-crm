-- P1d — Persistent company-scoped lead qualification policy settings.
-- Absent row = application defaults (b2c motion); do not auto-insert on qualify.
-- Apply only against local/dev databases — never production from agent tooling.
-- RLS follows company_ticket_sla_settings (permission-bound), not the weaker
-- sales_follow_up_settings company_id-only policy.

create table if not exists public.lead_qualification_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  schema_version integer not null default 1,
  sales_motion text not null default 'b2c',
  required_evidence_fields text[] not null default '{}',
  require_human_review_when_incomplete boolean not null default false,
  require_human_review_on_conflict boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_qualification_settings_sales_motion_check
    check (sales_motion in ('b2b', 'b2c', 'mixed')),
  constraint lead_qualification_settings_schema_version_check
    check (schema_version >= 1)
);

comment on table public.lead_qualification_settings is
  'Per-company lead qualification policy knobs (sales motion, required evidence, human-review flags). No secrets. Absent row means application defaults.';

drop trigger if exists set_lead_qualification_settings_updated_at on public.lead_qualification_settings;
create trigger set_lead_qualification_settings_updated_at
  before update on public.lead_qualification_settings
  for each row
  execute procedure public.set_updated_at();

alter table public.lead_qualification_settings enable row level security;

drop policy if exists lead_qualification_settings_select on public.lead_qualification_settings;
create policy lead_qualification_settings_select
  on public.lead_qualification_settings for select
  using (
    auth.role() = 'service_role'
    or public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and (
        public.company_has_permission(company_id, 'leads.view')
        or public.company_has_permission(company_id, 'leads.qualify')
        or public.company_has_permission(company_id, 'leads.manage')
      )
    )
  );

drop policy if exists lead_qualification_settings_write on public.lead_qualification_settings;
create policy lead_qualification_settings_write
  on public.lead_qualification_settings for all
  using (
    auth.role() = 'service_role'
    or public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'leads.manage')
    )
  )
  with check (
    auth.role() = 'service_role'
    or public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.company_has_permission(company_id, 'leads.manage')
    )
  );

revoke all on table public.lead_qualification_settings from anon, public;
grant select, insert, update on table public.lead_qualification_settings to authenticated;
grant select, insert, update on table public.lead_qualification_settings to service_role;
