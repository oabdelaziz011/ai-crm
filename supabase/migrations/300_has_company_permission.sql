-- Sprint: Company Feature Runtime Authorization
-- Product authorization boundary (RBAC ∩ company feature availability).
-- Does NOT modify user_has_permission (RBAC-only primitive).

create or replace function public.has_company_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      nullif(trim(p_code), '') is not null
      and public.user_has_permission(p_code)
      and public.permission_available_to_company(public.current_company_id(), p_code)
    );
$$;

comment on function public.has_company_permission(text) is
  'Product authorization: RBAC (user_has_permission) AND company feature availability. Does not replace user_has_permission.';

revoke all on function public.has_company_permission(text) from public;
grant execute on function public.has_company_permission(text) to authenticated, service_role;

-- Explicit company scope (never evaluates another company than the one provided;
-- still requires actor company context match via current_company_id for non-super-admin).
create or replace function public.has_company_permission(
  p_company_id uuid,
  p_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      p_company_id is not null
      and p_company_id = public.current_company_id()
      and nullif(trim(p_code), '') is not null
      and public.user_has_permission(p_code)
      and public.permission_available_to_company(p_company_id, p_code)
    );
$$;

comment on function public.has_company_permission(uuid, text) is
  'Product authorization for a company: denies cross-company evaluation; RBAC AND permission_available_to_company.';

revoke all on function public.has_company_permission(uuid, text) from public;
grant execute on function public.has_company_permission(uuid, text) to authenticated, service_role;
