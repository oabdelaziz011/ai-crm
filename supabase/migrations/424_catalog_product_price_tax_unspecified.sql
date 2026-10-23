-- Third catalog tax display mode: 'unspecified' = do not mention tax in
-- customer-facing responses. Display-only: price math matches 'inclusive'.
-- Default stays 'inclusive'; existing rows are not rewritten.

alter table public.catalog_products
  drop constraint if exists catalog_products_price_tax_mode_check;

alter table public.catalog_products
  add constraint catalog_products_price_tax_mode_check
  check (price_tax_mode in ('inclusive', 'exclusive', 'unspecified'));

comment on column public.catalog_products.price_tax_mode is
  'inclusive: price includes tax. exclusive: tax is added on top. unspecified: do not mention tax to customers (display-only; priced like inclusive). Customers are shown the computed gross only.';
