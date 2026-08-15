-- ============================================================
-- 269 — Commercial package pricing model (Phase 7.4)
-- ============================================================
-- Pricing layer for plans ONLY. Does NOT authorize features.
-- Does NOT implement payment collection / checkout / gateways.
--
-- Semantics:
--   price_monthly = monthly LIST price (amount per month)
--   price_yearly  = annual LIST price (total billed per year, typically discounted)
--   pricing_mode  = free | fixed | custom
--   currency       = billing settings default_currency (NOT on plans)
--
-- Catalog price changes MUST NOT mutate:
--   package_feature_snapshot, company_feature_overrides, subscription periods.
-- ============================================================

-- ── 1. pricing_mode on plans ──────────────────────────────────

alter table public.plans
  add column if not exists pricing_mode text;

update public.plans
set pricing_mode = case
  when coalesce(price_monthly, 0) = 0 and coalesce(price_yearly, 0) = 0 then 'free'
  else 'fixed'
end
where pricing_mode is null
   or pricing_mode not in ('free', 'fixed', 'custom');

alter table public.plans
  alter column pricing_mode set default 'fixed';

alter table public.plans
  alter column pricing_mode set not null;

alter table public.plans
  drop constraint if exists plans_pricing_mode_check;

alter table public.plans
  add constraint plans_pricing_mode_check
  check (pricing_mode in ('free', 'fixed', 'custom'));

alter table public.plans
  drop constraint if exists plans_price_monthly_nonnegative;

alter table public.plans
  add constraint plans_price_monthly_nonnegative
  check (price_monthly is not null and price_monthly >= 0);

alter table public.plans
  drop constraint if exists plans_price_yearly_nonnegative;

alter table public.plans
  add constraint plans_price_yearly_nonnegative
  check (price_yearly is not null and price_yearly >= 0);

alter table public.plans
  drop constraint if exists plans_pricing_mode_amounts_check;

alter table public.plans
  add constraint plans_pricing_mode_amounts_check
  check (
    (pricing_mode = 'free' and price_monthly = 0 and price_yearly = 0)
    or (pricing_mode = 'fixed' and (price_monthly > 0 or price_yearly > 0))
    or (pricing_mode = 'custom')
  );

comment on column public.plans.pricing_mode is
  'Commercial list-price mode: free (0/0), fixed (paid list prices), custom (contact/negotiated — prices optional hints). NOT runtime authorization.';

comment on column public.plans.price_monthly is
  'Monthly LIST price (amount per month when billing_cycle=monthly). Currency from billing settings default_currency. NOT charged amount / NOT entitlement.';

comment on column public.plans.price_yearly is
  'Annual LIST price (total per year when billing_cycle=yearly; typically discounted vs 12× monthly). NOT "$/month with annual billing".';

-- ── 2. Audit event ────────────────────────────────────────────

insert into public.billing_audit_event_types (code, label, description)
values
  ('package_price_updated', 'Package Price Updated', 'Commercial package list pricing or pricing_mode changed')
on conflict (code) do update
set label = excluded.label, description = excluded.description, is_active = true;

-- ── 3. Pricing normalize helper ───────────────────────────────

create or replace function public._normalize_commercial_package_pricing(
  p_pricing_mode text,
  p_price_monthly numeric,
  p_price_yearly numeric
)
returns table (
  pricing_mode text,
  price_monthly numeric,
  price_yearly numeric
)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_mode text := lower(trim(coalesce(p_pricing_mode, '')));
  v_monthly numeric := coalesce(p_price_monthly, 0);
  v_yearly numeric := coalesce(p_price_yearly, 0);
begin
  if v_monthly < 0 or v_yearly < 0 then
    raise exception 'Package prices cannot be negative';
  end if;

  if v_mode = '' then
    v_mode := case
      when v_monthly = 0 and v_yearly = 0 then 'free'
      else 'fixed'
    end;
  end if;

  if v_mode not in ('free', 'fixed', 'custom') then
    raise exception 'Invalid pricing_mode: % (expected free|fixed|custom)', v_mode;
  end if;

  if v_mode = 'free' then
    v_monthly := 0;
    v_yearly := 0;
  elsif v_mode = 'fixed' and v_monthly = 0 and v_yearly = 0 then
    raise exception 'Fixed pricing requires a positive monthly and/or yearly list price (use pricing_mode=free for $0 packages)';
  end if;

  pricing_mode := v_mode;
  price_monthly := v_monthly;
  price_yearly := v_yearly;
  return next;
end;
$$;

-- ── 4. upsert_commercial_package_v1 — pricing_mode + price audit

drop function if exists public.upsert_commercial_package_v1(
  text, text, uuid, text, text, numeric, numeric, boolean, boolean, boolean,
  integer, integer, jsonb, integer, integer, numeric, bigint
);

create or replace function public.upsert_commercial_package_v1(
  p_code text,
  p_name text,
  p_id uuid default null,
  p_display_name text default null,
  p_description text default null,
  p_price_monthly numeric default 0,
  p_price_yearly numeric default 0,
  p_is_active boolean default true,
  p_is_highlighted boolean default false,
  p_is_public boolean default true,
  p_sort_order integer default 0,
  p_tier_rank integer default 0,
  p_metadata jsonb default '{}'::jsonb,
  p_max_users integer default null,
  p_max_customers integer default null,
  p_storage_gb numeric default null,
  p_ai_tokens_monthly bigint default null,
  p_pricing_mode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_previous public.plans%rowtype;
  v_row public.plans%rowtype;
  v_created boolean := false;
  v_was_active boolean;
  v_pricing record;
  v_price_changed boolean := false;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public._can_manage_commercial_packages() then
    raise exception 'Insufficient permissions to manage commercial packages';
  end if;

  if v_code = '' or v_name = '' then
    raise exception 'code and name are required';
  end if;

  select * into v_pricing
  from public._normalize_commercial_package_pricing(
    p_pricing_mode,
    p_price_monthly,
    p_price_yearly
  );

  if p_id is not null then
    select * into v_previous from public.plans where id = p_id;
    if not found then
      raise exception 'Package not found: %', p_id;
    end if;
  else
    select * into v_previous from public.plans where code = v_code;
  end if;

  if v_previous.id is not null then
    v_was_active := v_previous.is_active;
    v_price_changed :=
      v_previous.price_monthly is distinct from v_pricing.price_monthly
      or v_previous.price_yearly is distinct from v_pricing.price_yearly
      or v_previous.pricing_mode is distinct from v_pricing.pricing_mode;

    update public.plans
    set
      code = v_code,
      name = v_name,
      display_name = coalesce(nullif(trim(p_display_name), ''), v_name),
      description = coalesce(p_description, description, ''),
      pricing_mode = v_pricing.pricing_mode,
      price_monthly = v_pricing.price_monthly,
      price_yearly = v_pricing.price_yearly,
      is_active = coalesce(p_is_active, is_active, true),
      is_highlighted = coalesce(p_is_highlighted, is_highlighted, false),
      is_public = coalesce(p_is_public, is_public, true),
      sort_order = coalesce(p_sort_order, sort_order, 0),
      tier_rank = coalesce(p_tier_rank, tier_rank, 0),
      metadata = coalesce(p_metadata, metadata, '{}'::jsonb),
      max_users = p_max_users,
      max_customers = p_max_customers,
      storage_gb = p_storage_gb,
      ai_tokens_monthly = p_ai_tokens_monthly,
      updated_at = now()
    where id = v_previous.id
    returning * into v_row;

    perform public.write_billing_audit_log(
      'package_updated',
      null,
      jsonb_build_object(
        'id', v_previous.id,
        'code', v_previous.code,
        'name', v_previous.name,
        'is_active', v_previous.is_active,
        'pricing_mode', v_previous.pricing_mode,
        'price_monthly', v_previous.price_monthly,
        'price_yearly', v_previous.price_yearly
      ),
      jsonb_build_object(
        'id', v_row.id,
        'code', v_row.code,
        'name', v_row.name,
        'is_active', v_row.is_active,
        'pricing_mode', v_row.pricing_mode,
        'price_monthly', v_row.price_monthly,
        'price_yearly', v_row.price_yearly,
        'is_highlighted', v_row.is_highlighted,
        'is_public', v_row.is_public
      ),
      'manual',
      jsonb_build_object('package_id', v_row.id, 'package_code', v_row.code)
    );

    if v_price_changed then
      perform public.write_billing_audit_log(
        'package_price_updated',
        null,
        jsonb_build_object(
          'pricing_mode', v_previous.pricing_mode,
          'price_monthly', v_previous.price_monthly,
          'price_yearly', v_previous.price_yearly
        ),
        jsonb_build_object(
          'pricing_mode', v_row.pricing_mode,
          'price_monthly', v_row.price_monthly,
          'price_yearly', v_row.price_yearly
        ),
        'manual',
        jsonb_build_object(
          'package_id', v_row.id,
          'package_code', v_row.code,
          'note', 'catalog list price change does not mutate snapshots or grants'
        )
      );
    end if;

    if v_was_active is distinct from v_row.is_active then
      perform public.write_billing_audit_log(
        case when v_row.is_active then 'package_activated' else 'package_deactivated' end,
        null,
        jsonb_build_object('id', v_previous.id, 'is_active', v_was_active),
        jsonb_build_object('id', v_row.id, 'is_active', v_row.is_active),
        'manual',
        jsonb_build_object('package_id', v_row.id, 'package_code', v_row.code)
      );
    end if;
  else
    v_created := true;

    insert into public.plans (
      code, name, display_name, description,
      pricing_mode, price_monthly, price_yearly,
      is_active, is_highlighted, is_public,
      sort_order, tier_rank, metadata,
      max_users, max_customers, storage_gb, ai_tokens_monthly
    )
    values (
      v_code, v_name, coalesce(nullif(trim(p_display_name), ''), v_name), coalesce(p_description, ''),
      v_pricing.pricing_mode, v_pricing.price_monthly, v_pricing.price_yearly,
      coalesce(p_is_active, true), coalesce(p_is_highlighted, false), coalesce(p_is_public, true),
      coalesce(p_sort_order, 0), coalesce(p_tier_rank, 0), coalesce(p_metadata, '{}'::jsonb),
      p_max_users, p_max_customers, p_storage_gb, p_ai_tokens_monthly
    )
    returning * into v_row;

    perform public.write_billing_audit_log(
      'package_created',
      null,
      null,
      jsonb_build_object(
        'id', v_row.id,
        'code', v_row.code,
        'name', v_row.name,
        'is_active', v_row.is_active,
        'pricing_mode', v_row.pricing_mode,
        'price_monthly', v_row.price_monthly,
        'price_yearly', v_row.price_yearly
      ),
      'manual',
      jsonb_build_object('package_id', v_row.id, 'package_code', v_row.code)
    );

    if v_row.is_active then
      perform public.write_billing_audit_log(
        'package_activated',
        null,
        null,
        jsonb_build_object('id', v_row.id, 'is_active', true),
        'manual',
        jsonb_build_object('package_id', v_row.id, 'package_code', v_row.code)
      );
    end if;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'code', v_row.code,
    'name', v_row.name,
    'display_name', v_row.display_name,
    'is_active', v_row.is_active,
    'is_highlighted', v_row.is_highlighted,
    'is_public', v_row.is_public,
    'pricing_mode', v_row.pricing_mode,
    'price_monthly', v_row.price_monthly,
    'price_yearly', v_row.price_yearly,
    'created', v_created
  );
end;
$$;

revoke all on function public.upsert_commercial_package_v1(
  text, text, uuid, text, text, numeric, numeric, boolean, boolean, boolean,
  integer, integer, jsonb, integer, integer, numeric, bigint, text
) from public;
grant execute on function public.upsert_commercial_package_v1(
  text, text, uuid, text, text, numeric, numeric, boolean, boolean, boolean,
  integer, integer, jsonb, integer, integer, numeric, bigint, text
) to authenticated, service_role;

-- ── 5. Refresh matrix view with pricing_mode ──────────────────

drop view if exists public.commercial_package_feature_matrix_v1;

create view public.commercial_package_feature_matrix_v1
with (security_invoker = true)
as
select
  p.id as plan_id,
  p.code as package_code,
  p.name as package_name,
  p.is_active as package_is_active,
  p.is_public as package_is_public,
  p.pricing_mode,
  p.price_monthly,
  p.price_yearly,
  pf.feature_code,
  pf.enabled as included,
  pf.limit_value,
  fd.label as feature_label,
  fd.category as feature_category,
  fd.is_billable,
  fd.requires_subscription,
  fd.is_active as feature_is_active,
  (coalesce(fd.is_billable, false) or coalesce(fd.requires_subscription, false)) as is_commercial
from public.plans p
join public.plan_features pf on pf.plan_id = p.id
join public.feature_definitions fd on fd.code = pf.feature_code
where pf.enabled = true;

comment on view public.commercial_package_feature_matrix_v1 is
  'Canonical package↔feature packaging matrix + list pricing. Packaging/pricing metadata only — not runtime authorization.';

grant select on public.commercial_package_feature_matrix_v1 to authenticated, service_role;

-- ── 6. Pricing integrity helper ───────────────────────────────

create or replace function public.verify_commercial_package_pricing_integrity_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_negative int;
  v_mode_bad int;
  v_free_bad int;
  v_fixed_bad int;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role'
     and not (
       public.is_super_admin()
       or public.can_edit_billing()
       or public.can_view_billing_audit(null)
     ) then
    raise exception 'Insufficient permissions';
  end if;

  select count(*)::int into v_negative
  from public.plans
  where price_monthly < 0 or price_yearly < 0;

  select count(*)::int into v_mode_bad
  from public.plans
  where pricing_mode not in ('free', 'fixed', 'custom');

  select count(*)::int into v_free_bad
  from public.plans
  where pricing_mode = 'free'
    and (price_monthly <> 0 or price_yearly <> 0);

  select count(*)::int into v_fixed_bad
  from public.plans
  where pricing_mode = 'fixed'
    and price_monthly = 0 and price_yearly = 0;

  return jsonb_build_object(
    'ok', (v_negative = 0 and v_mode_bad = 0 and v_free_bad = 0 and v_fixed_bad = 0),
    'negative_prices', v_negative,
    'invalid_pricing_mode', v_mode_bad,
    'free_with_nonzero_price', v_free_bad,
    'fixed_with_zero_prices', v_fixed_bad,
    'currency_authority', 'billing_settings.default_currency',
    'note', 'Catalog list prices only. Pricing does not authorize features or mutate existing grants/snapshots.'
  );
end;
$$;

revoke all on function public.verify_commercial_package_pricing_integrity_v1() from public;
grant execute on function public.verify_commercial_package_pricing_integrity_v1() to authenticated, service_role;
