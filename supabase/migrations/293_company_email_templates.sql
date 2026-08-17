-- Sprint 1 — Email module company-scoped email templates (CRUD + placeholders).
-- Separate from notification EMAIL_TEMPLATE_REGISTRY and billing_email_templates.

create table if not exists public.company_email_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text not null,
  subject text not null default '',
  body text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint company_email_templates_name_nonempty check (char_length(trim(name)) > 0),
  constraint company_email_templates_code_format check (
    code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint company_email_templates_company_code_unique unique (company_id, code)
);

comment on table public.company_email_templates is
  'Tenant-scoped Email-module templates with {{variable}} placeholders. Not notification/billing templates.';

create index if not exists idx_company_email_templates_company
  on public.company_email_templates(company_id);

create index if not exists idx_company_email_templates_company_enabled
  on public.company_email_templates(company_id, enabled);

drop trigger if exists set_company_email_templates_updated_at
  on public.company_email_templates;
create trigger set_company_email_templates_updated_at
  before update on public.company_email_templates
  for each row
  execute procedure public.set_updated_at();

alter table public.company_email_templates enable row level security;

drop policy if exists company_email_templates_select on public.company_email_templates;
create policy company_email_templates_select
  on public.company_email_templates for select
  using (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and (
        public.user_has_permission('settings.view')
        or public.user_has_permission('settings.edit')
      )
    )
  );

drop policy if exists company_email_templates_insert on public.company_email_templates;
create policy company_email_templates_insert
  on public.company_email_templates for insert
  with check (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('settings.edit')
    )
  );

drop policy if exists company_email_templates_update on public.company_email_templates;
create policy company_email_templates_update
  on public.company_email_templates for update
  using (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('settings.edit')
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('settings.edit')
    )
  );

drop policy if exists company_email_templates_delete on public.company_email_templates;
create policy company_email_templates_delete
  on public.company_email_templates for delete
  using (
    auth.role() = 'service_role'
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('settings.edit')
    )
  );

grant select, insert, update, delete on public.company_email_templates to authenticated;
grant all on public.company_email_templates to service_role;
