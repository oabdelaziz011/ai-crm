-- Sprint P1: auth bootstrap RPC + CRM list indexes

create index if not exists idx_customers_company_created_at
  on public.customers(company_id, created_at desc);

create index if not exists idx_invoices_company_invoice_date
  on public.invoices(company_id, invoice_date desc);

create or replace function public.load_user_auth_context(p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_profile_id uuid;
  v_company_id uuid;
  v_full_name text;
  v_is_super_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if v_user_id is distinct from auth.uid() and not public.is_super_admin() then
    raise exception 'Forbidden';
  end if;

  select p.id, p.company_id, p.full_name, coalesce(p.is_super_admin, false)
  into v_profile_id, v_company_id, v_full_name, v_is_super_admin
  from public.profiles p
  where p.id = v_user_id or p.user_id = v_user_id
  order by case when p.id = v_user_id then 0 else 1 end
  limit 1;

  if v_profile_id is null then
    return jsonb_build_object(
      'profile', null,
      'company', null,
      'roles', '[]'::jsonb,
      'permissions', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile_id,
      'company_id', v_company_id,
      'full_name', v_full_name,
      'is_super_admin', v_is_super_admin
    ),
    'company', (
      select to_jsonb(row)
      from (
        select
          c.id,
          c.name,
          c.logo_url,
          c.status,
          c.subscription_status,
          c.billing_cycle,
          c.subscription_expires_at
        from public.companies c
        where c.id = v_company_id
      ) row
    ),
    'roles', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'company_id', r.company_id,
            'name', r.name,
            'description', r.description,
            'is_system', r.is_system
          )
          order by r.name nulls last
        )
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = v_profile_id or ur.user_id = v_user_id
      ),
      '[]'::jsonb
    ),
    'permissions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'category', p.category,
            'module', p.module,
            'action', p.action,
            'code', p.code,
            'description', p.description
          )
          order by p.code nulls last
        )
        from (
          select distinct rp.permission_id
          from public.role_permissions rp
          join public.user_roles ur on ur.role_id = rp.role_id
          where ur.user_id = v_profile_id or ur.user_id = v_user_id
          union
          select up.permission_id
          from public.user_permissions up
          where up.user_id = v_profile_id or up.user_id = v_user_id
        ) perm_ids
        join public.permissions p on p.id = perm_ids.permission_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.load_user_auth_context(uuid) from public;
grant execute on function public.load_user_auth_context(uuid) to authenticated;

comment on function public.load_user_auth_context(uuid) is
  'Single-round-trip auth bootstrap: profile, company, roles, permissions for the signed-in user.';
