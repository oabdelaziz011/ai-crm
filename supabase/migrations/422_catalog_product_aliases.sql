-- Phase 1: optional product aliases / synonyms for AI catalog search.
-- Additive and non-destructive: default empty array; existing rows keep working.

alter table public.catalog_products
  add column if not exists aliases text[] not null default '{}'::text[];

comment on column public.catalog_products.aliases is
  'Optional customer-facing synonyms and trade names used by AI catalog search when VALUEOR_PRODUCT_ALIAS_SEARCH is enabled. Never includes cost/margin.';

create index if not exists idx_catalog_products_aliases_gin
  on public.catalog_products using gin (aliases)
  where deleted_at is null;
