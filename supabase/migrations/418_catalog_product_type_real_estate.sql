-- Allow real-estate catalog items alongside existing product types.
-- Named constraint so later type additions can drop/recreate safely.

alter table public.catalog_products
  drop constraint if exists catalog_products_product_type_check;

alter table public.catalog_products
  add constraint catalog_products_product_type_check
  check (
    product_type in (
      'product',
      'service',
      'subscription',
      'bundle',
      'addon',
      'real_estate'
    )
  );
