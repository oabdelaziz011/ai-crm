-- Website booking reads the service pricing rules that already exist.
-- No second price list. Unpublished sites stay visible only to the signed-in company.

create or replace function public.website_service_pricing(p_company_id uuid, p_service_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed boolean := false;
begin
  if p_company_id is null or p_service_id is null then
    return '[]'::jsonb;
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
    return '[]'::jsonb;
  end if;

  if not exists (
    select 1
    from public.scheduling_services s
    where s.id = p_service_id
      and s.company_id = p_company_id
      and s.status = 'active'
      and s.deleted_at is null
  ) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'code', t.code,
      'label', t.label,
      'priceCents', r.price_cents,
      'currency', r.currency,
      'durationMinutes', r.duration_minutes,
      'isDefault', r.is_default
    ) order by r.is_default desc, t.sort_order, t.label)
    from public.scheduling_service_pricing_rules r
    join public.scheduling_pricing_rule_types t
      on t.id = r.type_id
     and t.company_id = r.company_id
     and t.active
    where r.company_id = p_company_id
      and r.service_id = p_service_id
      and r.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

comment on function public.website_service_pricing(uuid, uuid) is
  'Pricing rules for one active service, for website booking. Does not reveal other companies.';

revoke all on function public.website_service_pricing(uuid, uuid) from public;
grant execute on function public.website_service_pricing(uuid, uuid) to anon, authenticated, service_role;
