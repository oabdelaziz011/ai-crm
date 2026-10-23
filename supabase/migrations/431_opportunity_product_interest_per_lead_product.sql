-- Replace legacy one-open-product-interest-per-lead guard with per-product scope.
-- Approved rule: different products for the same customer/lead may have separate open Opportunities.
-- Keep a concurrency guard for the product_interest_after_qualify source only.
--
-- Canonical apply path: file lives in supabase/migrations/ (version 431). Local helper
-- scripts/apply-431-opportunity-product-interest-index-local.mjs mirrors other apply-NNN-*
-- helpers when `supabase db push` is blocked by remote drift — it still registers
-- supabase_migrations.schema_migrations version '431'.
--
-- ROLLBACK LIMITATIONS (manual only; do not auto-run):
--   * Recreating the legacy per-lead index will FAIL if a lead already has multiple open
--     product_interest opportunities with different primary_product_id values.
--   * Dropping the product-scoped index removes the race guard; do not drop in production
--     without a replacement. This migration does not delete or rewrite opportunity rows.

drop index if exists public.opportunities_one_open_product_interest_per_lead_idx;

do $$
declare
  conflict_count int;
  sample text;
begin
  select count(*)::int, string_agg(format('%s/%s/%s=%s', company_id, lead_id, primary_product_id, n), '; ')
  into conflict_count, sample
  from (
    select company_id, lead_id, primary_product_id, count(*)::int as n
    from public.opportunities
    where deleted_at is null
      and won_at is null
      and lost_at is null
      and lead_id is not null
      and primary_product_id is not null
      and coalesce(metadata->>'source', '') = 'product_interest_after_qualify'
    group by company_id, lead_id, primary_product_id
    having count(*) > 1
    limit 20
  ) dups;

  if coalesce(conflict_count, 0) > 0 then
    raise exception
      'Cannot create opportunities_one_open_product_interest_per_lead_product_idx: % conflicting open groups. Resolve manually (do not auto-merge). Sample: %',
      conflict_count,
      coalesce(sample, '');
  end if;
end $$;

create unique index if not exists opportunities_one_open_product_interest_per_lead_product_idx
  on public.opportunities (company_id, lead_id, primary_product_id)
  where deleted_at is null
    and lead_id is not null
    and primary_product_id is not null
    and won_at is null
    and lost_at is null
    and coalesce(metadata->>'source', '') = 'product_interest_after_qualify';

comment on index public.opportunities_one_open_product_interest_per_lead_product_idx is
  'Concurrency guard for product_interest_after_qualify: at most one open opportunity per lead + primary_product_id. Allows different products on the same lead. Soft-deleted and Won/Lost excluded. Rows missing primary_product_id are unconstrained by this index.';
