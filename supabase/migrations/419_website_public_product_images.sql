-- Published sites can show up to five catalog photos per product.
-- A website-specific photo still replaces them in the site content.

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
      'imageUrl', item.image_url,
      'imageUrls', item.image_urls
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
        ) as image_url,
        coalesce((
          select jsonb_agg(photo.img order by photo.ord)
          from (
            select img, ord
            from unnest(p.image_urls) with ordinality as listed(img, ord)
            where img ~ '^(https://[^[:space:]]+|http://(localhost|127\.0\.0\.1)(:[0-9]+)?/storage/v1/object/public/company-branding/[^[:space:]]+)$'
            limit 5
          ) photo
        ), '[]'::jsonb) as image_urls
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
  'Active catalog products for a published company website, including up to five public photos.';

revoke all on function public.website_public_products(text) from public;
grant execute on function public.website_public_products(text) to anon, authenticated, service_role;

update public.tool_definitions
set
  description = 'Search the company''s active product catalog. Read-only. Never includes photo links, cost, margin, or stock. When the result is exactly one product and imageCount is greater than zero, the channel sends that product''s photos after the text. Do not promise photos for a list of products.',
  updated_at = now()
where key = 'search_products';

update public.tool_definitions
set
  description = 'Return customer-facing details for up to 3 active company products by id. Read-only. Never includes photo links, cost, margin, or stock. The channel sends photos only when exactly one product is returned and imageCount is greater than zero.',
  updated_at = now()
where key = 'get_product_details';
