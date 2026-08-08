-- Sprint 3.10.6 — Company admins may update company-scoped billing settings
-- (e.g. default_currency from Settings → Profile) without platform-only billing.edit.

create or replace function public.can_edit_billing_settings(
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
      public.is_super_admin() or public.user_has_permission('billing.settings.edit')
    when p_scope_type = 'company' then
      public.is_super_admin()
      or (
        p_company_id is not null
        and p_company_id = public.current_company_id()
        and (
          public.is_company_admin()
          or public.user_has_permission('billing.settings.edit')
          or public.user_has_permission('settings.edit')
          or public.user_has_permission('company.update')
        )
      )
    else false
  end;
$$;
