-- Sprint 3.10.6 — Company members can read company-scoped billing settings
-- (default_currency for CompanyLocaleProvider / Profile currency selector).

create or replace function public.can_view_billing_settings(
  p_scope_type text,
  p_company_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_scope_type = 'platform' then
      public.is_super_admin()
      or public.user_has_permission('billing.settings.view')
      or public.is_platform_billing_operator()
    when p_scope_type = 'company' then
      public.is_super_admin()
      or public.user_has_permission('billing.settings.view')
      or (
        p_company_id is not null
        and p_company_id = public.current_company_id()
      )
    else false
  end;
$$;
