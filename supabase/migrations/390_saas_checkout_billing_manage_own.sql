/**
 * Migration 390 — Allow billing self-manage roles to start SaaS checkout.
 * Aligns with portal canInitiateCompanyOnlinePayment (company.update OR billing.manage_own).
 * LOCAL-safe; does not change settlement or payable resolution.
 */

create or replace function public.actor_can_initiate_saas_checkout(
  p_user_id uuid,
  p_company_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_company_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.profiles pr
    where (pr.id = p_user_id or pr.user_id = p_user_id)
      and pr.is_super_admin = true
  ) then
    return true;
  end if;

  return exists (
    select 1
    from (
      values
        ('company.update'),
        ('settings.edit'),
        ('companies.edit'),
        ('billing.manage_own'),
        ('billing.payment_method.manage_own'),
        ('billing.pay')
    ) as codes(code)
    where exists (
      select 1
      from public.user_permissions up
      join public.permissions p on p.id = up.permission_id
      where up.user_id = p_user_id
        and p.code = public.resolve_permission_code(codes.code)
    )
    or exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = p_user_id
        and r.company_id is not null
        and r.company_id = p_company_id
        and p.code = public.resolve_permission_code(codes.code)
    )
  );
end;
$$;

comment on function public.actor_can_initiate_saas_checkout(uuid, uuid) is
  'RBAC for SaaS checkout: company admin OR billing self-manage (manage_own / payment_method / pay).';
