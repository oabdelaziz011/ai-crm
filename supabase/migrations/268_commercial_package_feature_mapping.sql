-- ============================================================
-- 268 — Commercial package ↔ feature mapping cleanup (Phase 7.3)
-- ============================================================
-- Hardens packaging integrity. Does NOT change Phase 6 runtime SoT.
--
-- Authority reminder:
--   feature_definitions          = product feature catalog
--   plans                        = sellable package catalog + pricing
--   plan_features                = package contents (PACKAGING ONLY)
--   company_subscriptions        = subscription lifecycle + snapshot
--   package_feature_snapshot     = historical package contents at assign
--   company_feature_overrides    = runtime commercial access
--   feature_flags / kill-switches + RBAC = separate layers
--
-- plan_features MUST NOT be used as runtime authorization.
-- ============================================================

-- ── 1. Responsibility comments ────────────────────────────────

comment on table public.feature_definitions is
  'MASTER product feature catalog. Answers what features exist — NOT what a company currently has.';

comment on table public.plans is
  'Sellable commercial package catalog + list prices. NOT runtime authorization (Phase 7.2/7.3).';

comment on column public.plans.price_monthly is
  'List price charged per month when billing_cycle=monthly. Currency from billing settings (default_currency), not this column.';

comment on column public.plans.price_yearly is
  'List price charged per year when billing_cycle=yearly (typically a discounted annual total, not 12× monthly). Currency from billing settings.';

comment on table public.plan_features is
  'Package content / packaging metadata (which catalog features a package includes). MUST NOT authorize runtime access.';

comment on column public.company_subscriptions.package_feature_snapshot is
  'Frozen feature_definitions.code list at last package assignment. Catalog edits do not mutate this.';

comment on table public.company_feature_overrides is
  'Runtime commercial access grants (source trial|manual|contract|system|package). Phase 6 SoT with is_feature_enabled.';

comment on table public.company_subscriptions is
  'Subscription lifecycle (one row per company). plan_id → plans.id. billing_cycle is authoritative for cycle.';

-- ── 2. Integrity: disable packaging rows for inactive catalog ─
-- FK prevents unknown codes; inactive features must not stay "enabled" in packages.

update public.plan_features pf
set enabled = false
where pf.enabled = true
  and exists (
    select 1
    from public.feature_definitions fd
    where fd.code = pf.feature_code
      and fd.is_active = false
  );

-- Orphans should be impossible with FK; defensive cleanup if any slip through.
delete from public.plan_features pf
where not exists (
  select 1 from public.feature_definitions fd where fd.code = pf.feature_code
);

-- ── 3. Re-assert stock Basic / Pro / Enterprise packaging ─────
-- Source of truth for stock packages: this matrix (DB), not frontend hardcoding.
-- Includes core features for marketing/display; core access remains free via Phase 6.

-- Preserve Phase 7.2 stock composition (do not invent a new product strategy).
insert into public.plan_features (plan_id, feature_code, enabled)
select p.id, f.code, true
from public.plans p
cross join lateral (
  values
    ('basic', array['core_crm','customers','ticketing','basic_reports','bookings']),
    ('pro', array[
      'core_crm','customers','ticketing','basic_reports','bookings','leads','opportunities',
      'ai_assistant','whatsapp_channel'
    ]),
    ('enterprise', array[
      'core_crm','customers','ticketing','basic_reports','bookings','leads','opportunities',
      'operations','ai_assistant','ai_employee','whatsapp_channel','email_channel','omnichannel',
      'workflow_automation','advanced_reports','api_access'
    ])
) as pack(code, codes)
cross join lateral unnest(pack.codes) as f(code)
where p.code = pack.code
  and exists (
    select 1 from public.feature_definitions fd
    where fd.code = f.code and fd.is_active = true
  )
on conflict (plan_id, feature_code) do update
set enabled = true;

-- Disable stock-package features that are not in the intended matrix
update public.plan_features pf
set enabled = false
from public.plans p
where pf.plan_id = p.id
  and p.code in ('basic', 'pro', 'enterprise')
  and pf.enabled = true
  and not (
    (p.code = 'basic' and pf.feature_code = any (array[
      'core_crm','customers','ticketing','basic_reports','bookings'
    ]))
    or (p.code = 'pro' and pf.feature_code = any (array[
      'core_crm','customers','ticketing','basic_reports','bookings','leads','opportunities',
      'ai_assistant','whatsapp_channel'
    ]))
    or (p.code = 'enterprise' and pf.feature_code = any (array[
      'core_crm','customers','ticketing','basic_reports','bookings','leads','opportunities',
      'operations','ai_assistant','ai_employee','whatsapp_channel','email_channel','omnichannel',
      'workflow_automation','advanced_reports','api_access'
    ]))
  );

-- Keep plans.features jsonb mirror in sync for stock packages (display only)
update public.plans p
set features = coalesce((
  select jsonb_agg(pf.feature_code order by pf.feature_code)
  from public.plan_features pf
  where pf.plan_id = p.id and pf.enabled = true
), '[]'::jsonb),
    updated_at = now()
where p.code in ('basic', 'pro', 'enterprise');

-- ── 4. Commercial classification guard (core vs commercial) ───
-- Core must remain non-paywalled; commercial must remain grant-required.

update public.feature_definitions
set
  default_enabled = true,
  is_billable = false,
  requires_subscription = false
where code in ('core_crm', 'customers')
  and (
    default_enabled is distinct from true
    or is_billable is distinct from false
    or requires_subscription is distinct from false
  );

update public.feature_definitions
set
  default_enabled = false,
  is_billable = true,
  requires_subscription = true
where code in (
  'leads', 'opportunities', 'bookings', 'operations', 'ticketing',
  'ai_employee', 'ai_assistant', 'ai_email_routing', 'ai_ticketing', 'ai_suggested_replies',
  'whatsapp_channel', 'facebook_channel', 'instagram_channel', 'email_channel', 'sms_channel',
  'omnichannel', 'workflow_automation', 'basic_reports', 'advanced_reports', 'api_access'
)
and (
  default_enabled is distinct from false
  or is_billable is distinct from true
  or requires_subscription is distinct from true
);

-- ── 5. Canonical package-feature matrix view (DB-driven) ──────

create or replace view public.commercial_package_feature_matrix_v1
with (security_invoker = true)
as
select
  p.id as plan_id,
  p.code as package_code,
  p.name as package_name,
  p.is_active as package_is_active,
  p.is_public as package_is_public,
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
  'Canonical package↔feature packaging matrix. Packaging metadata only — not runtime authorization.';

grant select on public.commercial_package_feature_matrix_v1 to authenticated, service_role;

-- ── 6. Integrity helper (read-only checks for admins/tests) ───

create or replace function public.verify_commercial_package_mapping_integrity_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_orphan int;
  v_inactive_enabled int;
  v_dup int;
  v_core_misclass int;
  v_commercial_misclass int;
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

  select count(*)::int into v_orphan
  from public.plan_features pf
  where not exists (
    select 1 from public.feature_definitions fd where fd.code = pf.feature_code
  );

  select count(*)::int into v_inactive_enabled
  from public.plan_features pf
  join public.feature_definitions fd on fd.code = pf.feature_code
  where pf.enabled = true and fd.is_active = false;

  select count(*)::int into v_dup
  from (
    select plan_id, feature_code, count(*) as c
    from public.plan_features
    group by plan_id, feature_code
    having count(*) > 1
  ) d;

  select count(*)::int into v_core_misclass
  from public.feature_definitions
  where code in ('core_crm', 'customers')
    and (is_billable = true or requires_subscription = true or default_enabled = false);

  select count(*)::int into v_commercial_misclass
  from public.feature_definitions
  where code in (
    'leads', 'opportunities', 'bookings', 'operations', 'ticketing',
    'ai_employee', 'ai_assistant', 'ai_email_routing', 'ai_ticketing', 'ai_suggested_replies',
    'whatsapp_channel', 'facebook_channel', 'instagram_channel', 'email_channel', 'sms_channel',
    'omnichannel', 'workflow_automation', 'basic_reports', 'advanced_reports', 'api_access'
  )
  and (is_billable = false or requires_subscription = false or default_enabled = true);

  return jsonb_build_object(
    'ok', (v_orphan = 0 and v_inactive_enabled = 0 and v_dup = 0
           and v_core_misclass = 0 and v_commercial_misclass = 0),
    'orphan_plan_features', v_orphan,
    'inactive_features_enabled_in_packages', v_inactive_enabled,
    'duplicate_plan_feature_pairs', v_dup,
    'core_misclassified', v_core_misclass,
    'commercial_misclassified', v_commercial_misclass,
    'note', 'plan_features is packaging metadata only; runtime uses company_feature_overrides + is_feature_enabled'
  );
end;
$$;

revoke all on function public.verify_commercial_package_mapping_integrity_v1() from public;
grant execute on function public.verify_commercial_package_mapping_integrity_v1() to authenticated, service_role;
