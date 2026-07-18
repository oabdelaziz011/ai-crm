-- ============================================================
-- Vault OS – Billing: Feature Entitlements (Phase 1)
-- Architecture: billing-subscriptions.md v4 §2
-- ============================================================

create table if not exists public.feature_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text not null default 'core'
    check (category in ('core', 'ai', 'channels', 'integrations', 'billing', 'admin')),
  label text not null,
  description text,
  default_enabled boolean not null default false,
  is_billable boolean not null default false,
  linked_usage_metric_code text,
  requires_subscription boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_code text not null references public.feature_definitions(code) on delete cascade,
  enabled boolean not null default true,
  limit_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique (plan_id, feature_code)
);

create index if not exists idx_plan_features_plan_id on public.plan_features(plan_id);

create table if not exists public.company_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_code text not null references public.feature_definitions(code) on delete cascade,
  override_state text not null check (override_state in ('enabled', 'disabled')),
  reason text not null,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_company_feature_overrides_active
  on public.company_feature_overrides(company_id, feature_code)
  where is_active = true;

drop trigger if exists company_feature_overrides_updated_at on public.company_feature_overrides;
create trigger company_feature_overrides_updated_at
  before update on public.company_feature_overrides
  for each row execute procedure public.set_updated_at();

insert into public.feature_definitions (code, category, label, description, default_enabled, linked_usage_metric_code, sort_order)
values
  ('core_crm', 'core', 'Core CRM', 'Customers, bookings, and invoices', true, null, 1),
  ('basic_reports', 'core', 'Basic Reports', 'Standard reporting dashboards', false, null, 2),
  ('advanced_reports', 'core', 'Advanced Reports', 'Advanced analytics and exports', false, null, 3),
  ('ai_assistant', 'ai', 'AI Assistant', 'AI assistant settings and runtime', false, 'ai_tokens', 10),
  ('whatsapp_channel', 'channels', 'WhatsApp Channel', 'WhatsApp automation channel', false, 'whatsapp_messages', 20),
  ('api_access', 'integrations', 'API Access', 'External API access', false, 'api_calls', 30)
on conflict (code) do update
set
  label = excluded.label,
  description = excluded.description,
  category = excluded.category,
  linked_usage_metric_code = excluded.linked_usage_metric_code,
  sort_order = excluded.sort_order;

-- Backfill plan_features from plans.features jsonb and tier defaults
insert into public.plan_features (plan_id, feature_code, enabled, limit_value)
select p.id, 'core_crm', true, jsonb_build_object('max_users', p.max_users, 'max_customers', p.max_customers)
from public.plans p
on conflict (plan_id, feature_code) do nothing;

insert into public.plan_features (plan_id, feature_code, enabled)
select p.id, fd.code, fd.code = any (
  array(select jsonb_array_elements_text(coalesce(p.features, '[]'::jsonb)))
)
from public.plans p
cross join public.feature_definitions fd
where fd.code <> 'core_crm'
on conflict (plan_id, feature_code) do update
set enabled = excluded.enabled;

create or replace function public.is_feature_enabled(
  p_company_id uuid,
  p_feature_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_override text;
  v_plan_enabled boolean;
  v_default_enabled boolean;
  v_plan_id uuid;
begin
  select o.override_state
  into v_override
  from public.company_feature_overrides o
  where o.company_id = p_company_id
    and o.feature_code = p_feature_code
    and o.is_active = true
    and (o.expires_at is null or o.expires_at > now())
  limit 1;

  if v_override = 'enabled' then
    return true;
  elsif v_override = 'disabled' then
    return false;
  end if;

  select cs.plan_id into v_plan_id
  from public.company_subscriptions cs
  where cs.company_id = p_company_id;

  if v_plan_id is not null then
    select pf.enabled
    into v_plan_enabled
    from public.plan_features pf
    where pf.plan_id = v_plan_id
      and pf.feature_code = p_feature_code
    limit 1;

    if v_plan_enabled is not null then
      return v_plan_enabled;
    end if;
  end if;

  select fd.default_enabled
  into v_default_enabled
  from public.feature_definitions fd
  where fd.code = p_feature_code
    and fd.is_active = true
  limit 1;

  return coalesce(v_default_enabled, false);
end;
$$;

create or replace function public.get_company_entitlements(p_company_id uuid)
returns table (
  feature_code text,
  label text,
  enabled boolean,
  source text,
  limit_value jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    fd.code,
    fd.label,
    public.is_feature_enabled(p_company_id, fd.code) as enabled,
    case
      when o.id is not null and o.is_active and (o.expires_at is null or o.expires_at > now()) then 'override'
      when pf.id is not null then 'plan'
      else 'default'
    end as source,
    coalesce(pf.limit_value, '{}'::jsonb) as limit_value
  from public.feature_definitions fd
  left join public.company_feature_overrides o
    on o.company_id = p_company_id
   and o.feature_code = fd.code
   and o.is_active = true
   and (o.expires_at is null or o.expires_at > now())
  left join public.company_subscriptions cs
    on cs.company_id = p_company_id
  left join public.plan_features pf
    on pf.plan_id = cs.plan_id
   and pf.feature_code = fd.code
  where fd.is_active = true
  order by fd.sort_order, fd.code;
end;
$$;

create or replace function public.set_company_feature_override(
  p_company_id uuid,
  p_feature_code text,
  p_override_state text,
  p_reason text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_previous jsonb;
begin
  if not public.is_super_admin() and not public.user_has_permission('billing.features.edit') then
    raise exception 'Insufficient permissions to manage feature overrides';
  end if;

  select jsonb_build_object(
    'override_state', o.override_state,
    'reason', o.reason,
    'expires_at', o.expires_at
  )
  into v_previous
  from public.company_feature_overrides o
  where o.company_id = p_company_id
    and o.feature_code = p_feature_code
    and o.is_active = true
  limit 1;

  update public.company_feature_overrides
  set is_active = false,
      updated_by = auth.uid(),
      updated_at = now()
  where company_id = p_company_id
    and feature_code = p_feature_code
    and is_active = true;

  insert into public.company_feature_overrides (
    company_id,
    feature_code,
    override_state,
    reason,
    expires_at,
    created_by,
    updated_by
  )
  values (
    p_company_id,
    p_feature_code,
    p_override_state,
    p_reason,
    p_expires_at,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  perform public.write_billing_audit_log(
    'feature_override_created',
    p_company_id,
    v_previous,
    jsonb_build_object(
      'override_state', p_override_state,
      'reason', p_reason,
      'expires_at', p_expires_at
    ),
    'manual',
    jsonb_build_object('feature_code', p_feature_code, 'override_id', v_id)
  );

  return v_id;
end;
$$;

alter table public.feature_definitions enable row level security;
alter table public.plan_features enable row level security;
alter table public.company_feature_overrides enable row level security;

drop policy if exists feature_definitions_select on public.feature_definitions;
create policy feature_definitions_select
  on public.feature_definitions for select
  using (auth.role() = 'authenticated');

drop policy if exists feature_definitions_write on public.feature_definitions;
create policy feature_definitions_write
  on public.feature_definitions for all
  using (public.is_super_admin() or public.user_has_permission('billing.features.manage_catalog'))
  with check (public.is_super_admin() or public.user_has_permission('billing.features.manage_catalog'));

drop policy if exists plan_features_select on public.plan_features;
create policy plan_features_select
  on public.plan_features for select
  using (auth.role() = 'authenticated');

drop policy if exists plan_features_write on public.plan_features;
create policy plan_features_write
  on public.plan_features for all
  using (public.is_super_admin() or public.user_has_permission('billing.manage_plans'))
  with check (public.is_super_admin() or public.user_has_permission('billing.manage_plans'));

drop policy if exists company_feature_overrides_select on public.company_feature_overrides;
create policy company_feature_overrides_select
  on public.company_feature_overrides for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or public.user_has_permission('billing.features.view')
      or company_id = public.current_company_id()
    )
  );

drop policy if exists company_feature_overrides_write on public.company_feature_overrides;
create policy company_feature_overrides_write
  on public.company_feature_overrides for all
  using (false)
  with check (false);

grant execute on function public.is_feature_enabled(uuid, text) to authenticated;
grant execute on function public.get_company_entitlements(uuid) to authenticated;
grant execute on function public.set_company_feature_override(uuid, text, text, text, timestamptz) to authenticated;
