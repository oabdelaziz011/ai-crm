-- ============================================================
-- Vault OS – Sprint 7.5.1 Enterprise Production Certification
-- Fix undefined get_user_company_id() referenced by migrations 161/162
-- Align RLS helper with current_company_id() used elsewhere
-- ============================================================

create or replace function public.get_user_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.current_company_id();
$$;

grant execute on function public.get_user_company_id() to authenticated, service_role;

-- Extend health check to verify RLS helper exists
create or replace function public.platform_health_check_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checks jsonb := '{}'::jsonb;
begin
  v_checks := v_checks || jsonb_build_object(
    'customer_portal', exists(select 1 from information_schema.tables where table_name = 'customer_portal_settings'),
    'financial_platform', exists(select 1 from information_schema.tables where table_name = 'customer_payments'),
    'executive_intelligence', exists(select 1 from information_schema.tables where table_name = 'executive_alerts'),
    'organization_hierarchy', exists(select 1 from information_schema.tables where table_name = 'organization_regions'),
    'integration_hub', exists(select 1 from information_schema.tables where table_name = 'integration_api_keys'),
    'plugin_marketplace', exists(select 1 from information_schema.tables where table_name = 'plugin_registry'),
    'rls_helper', exists(
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'get_user_company_id'
    )
  );

  return jsonb_build_object(
    'status', case when v_checks @> '{"customer_portal":true,"financial_platform":true,"executive_intelligence":true,"organization_hierarchy":true,"integration_hub":true,"plugin_marketplace":true,"rls_helper":true}'::jsonb
      then 'ready' else 'degraded' end,
    'checks', v_checks,
    'checked_at', now()
  );
end;
$$;

grant execute on function public.platform_health_check_v1() to authenticated, service_role;
