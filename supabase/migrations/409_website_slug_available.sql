-- The published site address is the company name. Another company cannot take the same name.

create or replace function public.website_slug_available(p_company_id uuid, p_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text;
begin
  if p_company_id is null
     or auth.role() is distinct from 'authenticated'
     or not (public.is_super_admin() or p_company_id = public.current_company_id()) then
    return false;
  end if;

  v_slug := lower(btrim(coalesce(p_slug, '')));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  if char_length(v_slug) < 2
     or char_length(v_slug) > 48
     or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    return false;
  end if;

  return not exists (
    select 1
    from public.customer_portal_settings portal
    where portal.slug = v_slug
      and portal.company_id <> p_company_id
  );
end;
$$;

comment on function public.website_slug_available(uuid, text) is
  'True when this company may publish its site at this name. Does not reveal which company already owns a name.';

revoke all on function public.website_slug_available(uuid, text) from public;
grant execute on function public.website_slug_available(uuid, text) to authenticated, service_role;
