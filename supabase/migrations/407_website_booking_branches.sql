-- Public booking can name a branch and the services that branch actually offers.
-- Addresses stay on branches. No second catalog.

create or replace function public.website_booking_catalog(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed boolean := false;
begin
  if p_company_id is null then
    return jsonb_build_object('branches', '[]'::jsonb, 'offers', '[]'::jsonb);
  end if;

  if auth.role() = 'authenticated'
     and (public.is_super_admin() or p_company_id = public.current_company_id()) then
    v_allowed := true;
  else
    select exists (
      select 1
      from public.web_presence_pages p
      where p.company_id = p_company_id
        and p.published
        and p.enabled
    )
    into v_allowed;
  end if;

  if not v_allowed then
    return jsonb_build_object('branches', '[]'::jsonb, 'offers', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'address', nullif(btrim(coalesce(b.address_line1, '')), ''),
        'city', nullif(btrim(coalesce(b.city, '')), ''),
        'country', nullif(btrim(coalesce(b.country, '')), '')
      ) order by b.is_primary desc nulls last, b.name)
      from public.branches b
      where b.company_id = p_company_id
        and b.status = 'active'
        and b.deleted_at is null
    ), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'branchId', r.branch_id,
        'serviceId', rs.service_id,
        'resourceId', r.id
      ))
      from public.scheduling_resources r
      join public.resource_services rs
        on rs.resource_id = r.id
       and rs.deleted_at is null
      where r.company_id = p_company_id
        and r.status = 'active'
        and r.deleted_at is null
        and r.branch_id is not null
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.website_booking_catalog(uuid) is
  'Active branches and the services each branch offers, for website booking. Unpublished sites are visible only to the signed-in company.';

revoke all on function public.website_booking_catalog(uuid) from public;
grant execute on function public.website_booking_catalog(uuid) to anon, authenticated, service_role;
