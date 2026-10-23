-- Published websites can show the company product catalog. Prices and photos stay on catalog_products.

create or replace function public.website_public_products(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, internal
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from internal.website_published_context(p_slug) limit 1;
  if not found or coalesce((v_ctx.sections->>'products')::boolean, false) is not true then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', item.id,
      'name', item.name,
      'description', left(coalesce(item.description, ''), 280),
      'price', item.base_price,
      'currency', coalesce(nullif(btrim(item.currency), ''), 'USD'),
      'imageUrl', item.image_url
    ) order by item.name)
    from (
      select
        p.id,
        p.name,
        p.description,
        p.base_price,
        p.currency,
        (
          select img
          from unnest(p.image_urls) as img
          where img ~ '^(https://[^[:space:]]+|http://(localhost|127\.0\.0\.1)(:[0-9]+)?/storage/v1/object/public/company-branding/[^[:space:]]+)$'
          limit 1
        ) as image_url
      from public.catalog_products p
      where p.company_id = v_ctx.company_id
        and p.is_active
        and p.deleted_at is null
      order by p.name
      limit 24
    ) item
  ), '[]'::jsonb);
end;
$$;

comment on function public.website_public_products(text) is
  'Active catalog products for a published company website. No second product store.';

revoke all on function public.website_public_products(text) from public;
grant execute on function public.website_public_products(text) to anon, authenticated, service_role;
