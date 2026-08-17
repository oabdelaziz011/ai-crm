-- ============================================================
-- 282 — Security Advisor: enable RLS on 10 public tables
-- Scope: "RLS Disabled in Public" errors only (not 594 warnings).
--
-- Sequence tables: RLS ON with NO client policies. Counters are
-- advanced only by SECURITY DEFINER BEFORE INSERT triggers so
-- booking/conversation number generation keeps working under RLS.
-- Catalogs / templates / publishers: authenticated SELECT (active-
-- only where applicable); mutations via is_super_admin() only.
-- Demo manifest: super-admin (and SECURITY DEFINER seed/teardown) only.
-- ============================================================

-- ── PHASE A: Harden sequence trigger functions ───────────────

create or replace function public.assign_scheduling_booking_confirmation_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  if new.confirmation_number is not null and btrim(new.confirmation_number) <> '' then
    return new;
  end if;

  insert into public.booking_number_sequences (company_id, last_value)
  values (new.company_id, 1)
  on conflict (company_id) do update
    set
      last_value = public.booking_number_sequences.last_value + 1,
      updated_at = now()
  returning last_value into v_next;

  new.confirmation_number := 'BK-' || lpad(v_next::text, 6, '0');
  return new;
end;
$$;

create or replace function public.assign_conversation_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  if new.conversation_number is not null and btrim(new.conversation_number) <> '' then
    return new;
  end if;

  insert into public.conversation_number_sequences (company_id, last_value)
  values (new.company_id, 1)
  on conflict (company_id) do update
    set
      last_value = public.conversation_number_sequences.last_value + 1,
      updated_at = now()
  returning last_value into v_next;

  new.conversation_number := 'CNV-' || lpad(v_next::text, 6, '0');
  new.search_text := coalesce(nullif(btrim(new.search_text), ''), new.conversation_number);

  return new;
end;
$$;

-- Trigger functions must remain executable by roles that insert bookings/conversations.
revoke all on function public.assign_scheduling_booking_confirmation_number() from public;
revoke all on function public.assign_conversation_number() from public;
grant execute on function public.assign_scheduling_booking_confirmation_number() to authenticated, service_role;
grant execute on function public.assign_conversation_number() to authenticated, service_role;

-- Internal counter tables: RLS without client CRUD policies (definer triggers only).
-- Do NOT use FORCE ROW LEVEL SECURITY — table owner / definer must retain bypass.
alter table public.booking_number_sequences enable row level security;
alter table public.conversation_number_sequences enable row level security;

-- ── PHASE B: Global / system catalogs ────────────────────────

-- entity_type_registry
alter table public.entity_type_registry enable row level security;

drop policy if exists entity_type_registry_select_authenticated on public.entity_type_registry;
create policy entity_type_registry_select_authenticated
  on public.entity_type_registry
  for select
  to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists entity_type_registry_write_super_admin on public.entity_type_registry;
create policy entity_type_registry_write_super_admin
  on public.entity_type_registry
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- billing_event_catalog (active rows only for authenticated read)
alter table public.billing_event_catalog enable row level security;

drop policy if exists billing_event_catalog_select_active_authenticated on public.billing_event_catalog;
create policy billing_event_catalog_select_active_authenticated
  on public.billing_event_catalog
  for select
  to authenticated
  using (
    auth.role() = 'authenticated'
    and is_active = true
  );

drop policy if exists billing_event_catalog_write_super_admin on public.billing_event_catalog;
create policy billing_event_catalog_write_super_admin
  on public.billing_event_catalog
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- platform_role_templates
alter table public.platform_role_templates enable row level security;

drop policy if exists platform_role_templates_select_authenticated on public.platform_role_templates;
create policy platform_role_templates_select_authenticated
  on public.platform_role_templates
  for select
  to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists platform_role_templates_write_super_admin on public.platform_role_templates;
create policy platform_role_templates_write_super_admin
  on public.platform_role_templates
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- platform_role_template_permissions
alter table public.platform_role_template_permissions enable row level security;

drop policy if exists platform_role_template_permissions_select_authenticated
  on public.platform_role_template_permissions;
create policy platform_role_template_permissions_select_authenticated
  on public.platform_role_template_permissions
  for select
  to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists platform_role_template_permissions_write_super_admin
  on public.platform_role_template_permissions;
create policy platform_role_template_permissions_write_super_admin
  on public.platform_role_template_permissions
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- configuration_domain_registry
alter table public.configuration_domain_registry enable row level security;

drop policy if exists configuration_domain_registry_select_authenticated
  on public.configuration_domain_registry;
create policy configuration_domain_registry_select_authenticated
  on public.configuration_domain_registry
  for select
  to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists configuration_domain_registry_write_super_admin
  on public.configuration_domain_registry;
create policy configuration_domain_registry_write_super_admin
  on public.configuration_domain_registry
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- platform_feature_flag_registry
alter table public.platform_feature_flag_registry enable row level security;

drop policy if exists platform_feature_flag_registry_select_authenticated
  on public.platform_feature_flag_registry;
create policy platform_feature_flag_registry_select_authenticated
  on public.platform_feature_flag_registry
  for select
  to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists platform_feature_flag_registry_write_super_admin
  on public.platform_feature_flag_registry;
create policy platform_feature_flag_registry_write_super_admin
  on public.platform_feature_flag_registry
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- plugin_publishers (aligned with marketplace catalog: authenticated read, admin write)
alter table public.plugin_publishers enable row level security;

drop policy if exists plugin_publishers_select_authenticated on public.plugin_publishers;
create policy plugin_publishers_select_authenticated
  on public.plugin_publishers
  for select
  to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists plugin_publishers_write_super_admin on public.plugin_publishers;
create policy plugin_publishers_write_super_admin
  on public.plugin_publishers
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ── PHASE C: Demo environment metadata ───────────────────────

alter table public.demo_environment_manifest enable row level security;

-- No tenant-wide authenticated access. Super-admin only for direct access.
-- SECURITY DEFINER seed/teardown RPCs continue to work as function owners.
drop policy if exists demo_environment_manifest_super_admin on public.demo_environment_manifest;
create policy demo_environment_manifest_super_admin
  on public.demo_environment_manifest
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
