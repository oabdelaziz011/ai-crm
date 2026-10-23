-- Catalog selling price: inclusive vs exclusive of tax, plus the percent used
-- to derive net/gross internally. Customers only ever see the gross total.

alter table public.catalog_products
  add column if not exists price_tax_mode text not null default 'inclusive';

alter table public.catalog_products
  drop constraint if exists catalog_products_price_tax_mode_check;

alter table public.catalog_products
  add constraint catalog_products_price_tax_mode_check
  check (price_tax_mode in ('inclusive', 'exclusive'));

alter table public.catalog_products
  add column if not exists tax_percent numeric(6, 3) not null default 0;

alter table public.catalog_products
  drop constraint if exists catalog_products_tax_percent_check;

alter table public.catalog_products
  add constraint catalog_products_tax_percent_check
  check (tax_percent >= 0 and tax_percent <= 100);

comment on column public.catalog_products.price_tax_mode is
  'Whether base_price (or subscription_price) already includes tax. Customers are shown the computed gross only.';

comment on column public.catalog_products.tax_percent is
  'Tax rate used to derive net and gross. Never published as a customer-facing amount.';

create or replace function public.catalog_products_enforce_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_archive boolean;
  v_content_changed boolean;
  v_price_changed boolean;
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  v_archive := new.deleted_at is distinct from old.deleted_at and new.deleted_at is not null;
  v_price_changed :=
    new.base_price is distinct from old.base_price
    or new.cost is distinct from old.cost
    or new.margin_percent is distinct from old.margin_percent
    or new.subscription_price is distinct from old.subscription_price
    or new.currency is distinct from old.currency
    or new.subscription_interval is distinct from old.subscription_interval
    or new.price_tax_mode is distinct from old.price_tax_mode
    or new.tax_percent is distinct from old.tax_percent;
  v_content_changed :=
    new.company_id is distinct from old.company_id
    or new.category_id is distinct from old.category_id
    or new.product_type is distinct from old.product_type
    or new.name is distinct from old.name
    or new.sku is distinct from old.sku
    or new.brand is distinct from old.brand
    or new.description is distinct from old.description
    or new.tax_class is distinct from old.tax_class
    or new.track_inventory is distinct from old.track_inventory
    or new.stock_quantity is distinct from old.stock_quantity
    or new.unit is distinct from old.unit
    or new.tags is distinct from old.tags
    or new.image_urls is distinct from old.image_urls
    or new.document_urls is distinct from old.document_urls
    or new.metadata is distinct from old.metadata
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or (new.is_active is distinct from old.is_active and not v_archive);

  if v_archive and not public.company_has_permission(old.company_id, 'products.delete') then
    raise exception 'product_permission_denied: products.delete' using errcode = '42501';
  end if;
  if v_content_changed and not public.company_has_permission(old.company_id, 'products.edit') then
    raise exception 'product_permission_denied: products.edit' using errcode = '42501';
  end if;
  if v_price_changed and not public.company_has_permission(old.company_id, 'products.pricing') then
    raise exception 'product_permission_denied: products.pricing' using errcode = '42501';
  end if;
  return new;
end;
$$;

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
      'price', item.customer_price,
      'currency', coalesce(nullif(btrim(item.currency), ''), 'USD'),
      'imageUrl', item.image_url,
      'imageUrls', item.image_urls
    ) order by item.name)
    from (
      select
        p.id,
        p.name,
        p.description,
        case
          when coalesce(p.tax_percent, 0) <= 0 then p.base_price
          when coalesce(p.price_tax_mode, 'inclusive') = 'exclusive'
            then round((p.base_price * (1 + p.tax_percent / 100.0))::numeric, 2)
          else p.base_price
        end as customer_price,
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
  'Active catalog products for a published company website. Price is the customer gross total only.';
