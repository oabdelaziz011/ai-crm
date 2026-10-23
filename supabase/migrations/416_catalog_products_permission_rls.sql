-- Catalog write authorization.
--
-- Root cause: migration 249 created permissive FOR ALL policies that allow every
-- command when company_has_permission(company_id, 'products.view') is true.
-- A second permissive policy would be OR-ed with that policy, so the old
-- policies are dropped before the split policies are created.
--
-- This does not grant or consult the employee runtime price-disclosure flag.
-- Customer price disclosure stays on ai_employees.runtime_configuration and is enforced in the tool layer.
-- AI product tools remain read-only; this migration does not give them a write role.
-- Service role bypasses RLS. The column trigger skips non-authenticated roles so
-- existing platform jobs are not given a new denial. Authenticated writes cannot
-- use that skip.
--
-- Do not apply until the impact notes in the review are accepted.
-- Does not modify migration 414.

drop policy if exists catalog_products_tenant on public.catalog_products;
drop policy if exists catalog_products_select on public.catalog_products;
drop policy if exists catalog_products_insert on public.catalog_products;
drop policy if exists catalog_products_update on public.catalog_products;
drop policy if exists catalog_products_delete on public.catalog_products;

-- PostgreSQL applies SELECT policies to existing rows before UPDATE.
-- products.edit and products.delete are included so those permissions can
-- reach the rows they are allowed to change. They still cannot insert, and
-- the trigger below still separates price changes from other edits.
create policy catalog_products_select
  on public.catalog_products
  for select
  to authenticated
  using (
    public.company_has_permission(company_id, 'products.view')
    or public.company_has_permission(company_id, 'web_presence.manage')
    or public.company_has_permission(company_id, 'products.edit')
    or public.company_has_permission(company_id, 'products.delete')
  );

create policy catalog_products_insert
  on public.catalog_products
  for insert
  to authenticated
  with check (public.company_has_permission(company_id, 'products.create'));

create policy catalog_products_update
  on public.catalog_products
  for update
  to authenticated
  using (
    public.company_has_permission(company_id, 'products.edit')
    or public.company_has_permission(company_id, 'products.delete')
  )
  with check (
    public.company_has_permission(company_id, 'products.edit')
    or public.company_has_permission(company_id, 'products.delete')
  );

create policy catalog_products_delete
  on public.catalog_products
  for delete
  to authenticated
  using (public.company_has_permission(company_id, 'products.delete'));

create or replace function public.catalog_products_enforce_sensitive_update()
returns trigger
language plpgsql
set search_path to public
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
    or new.subscription_interval is distinct from old.subscription_interval;
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

revoke all on function public.catalog_products_enforce_sensitive_update() from public;
revoke all on function public.catalog_products_enforce_sensitive_update() from anon;
grant execute on function public.catalog_products_enforce_sensitive_update() to authenticated, service_role;

drop trigger if exists catalog_products_enforce_sensitive_update on public.catalog_products;
create trigger catalog_products_enforce_sensitive_update
  before update on public.catalog_products
  for each row
  execute function public.catalog_products_enforce_sensitive_update();

drop policy if exists product_categories_tenant on public.product_categories;
drop policy if exists product_categories_select on public.product_categories;
drop policy if exists product_categories_insert on public.product_categories;
drop policy if exists product_categories_update on public.product_categories;
drop policy if exists product_categories_delete on public.product_categories;

create policy product_categories_select
  on public.product_categories for select to authenticated
  using (public.company_has_permission(company_id, 'products.view'));
create policy product_categories_insert
  on public.product_categories for insert to authenticated
  with check (public.company_has_permission(company_id, 'products.create'));
create policy product_categories_update
  on public.product_categories for update to authenticated
  using (public.company_has_permission(company_id, 'products.edit'))
  with check (public.company_has_permission(company_id, 'products.edit'));
create policy product_categories_delete
  on public.product_categories for delete to authenticated
  using (public.company_has_permission(company_id, 'products.delete'));

drop policy if exists product_regional_prices_tenant on public.product_regional_prices;
drop policy if exists product_regional_prices_select on public.product_regional_prices;
drop policy if exists product_regional_prices_insert on public.product_regional_prices;
drop policy if exists product_regional_prices_update on public.product_regional_prices;
drop policy if exists product_regional_prices_delete on public.product_regional_prices;

create policy product_regional_prices_select
  on public.product_regional_prices for select to authenticated
  using (public.company_has_permission(company_id, 'products.view'));
create policy product_regional_prices_insert
  on public.product_regional_prices for insert to authenticated
  with check (public.company_has_permission(company_id, 'products.pricing'));
create policy product_regional_prices_update
  on public.product_regional_prices for update to authenticated
  using (public.company_has_permission(company_id, 'products.pricing'))
  with check (public.company_has_permission(company_id, 'products.pricing'));
create policy product_regional_prices_delete
  on public.product_regional_prices for delete to authenticated
  using (public.company_has_permission(company_id, 'products.pricing'));

drop policy if exists product_bundle_items_tenant on public.product_bundle_items;
drop policy if exists product_bundle_items_select on public.product_bundle_items;
drop policy if exists product_bundle_items_insert on public.product_bundle_items;
drop policy if exists product_bundle_items_update on public.product_bundle_items;
drop policy if exists product_bundle_items_delete on public.product_bundle_items;

create policy product_bundle_items_select
  on public.product_bundle_items for select to authenticated
  using (public.company_has_permission(company_id, 'products.view'));
create policy product_bundle_items_insert
  on public.product_bundle_items for insert to authenticated
  with check (public.company_has_permission(company_id, 'products.edit'));
create policy product_bundle_items_update
  on public.product_bundle_items for update to authenticated
  using (public.company_has_permission(company_id, 'products.edit'))
  with check (public.company_has_permission(company_id, 'products.edit'));
create policy product_bundle_items_delete
  on public.product_bundle_items for delete to authenticated
  using (public.company_has_permission(company_id, 'products.edit'));

drop policy if exists product_history_tenant on public.product_history;
drop policy if exists product_history_select on public.product_history;
drop policy if exists product_history_insert on public.product_history;

create policy product_history_select
  on public.product_history for select to authenticated
  using (public.company_has_permission(company_id, 'products.view'));
create policy product_history_insert
  on public.product_history for insert to authenticated
  with check (
    public.company_has_permission(company_id, 'products.create')
    or public.company_has_permission(company_id, 'products.edit')
    or public.company_has_permission(company_id, 'products.delete')
    or public.company_has_permission(company_id, 'products.pricing')
  );
