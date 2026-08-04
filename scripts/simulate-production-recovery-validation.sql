-- Post-recovery validation gate (RECOVERY_PLAN_v2 §9.2 / §9.3)

SELECT 'migration_history' AS check_group, version
FROM supabase_migrations.schema_migrations
WHERE version IN ('214','215','216','227','228','229')
ORDER BY version;

SELECT 'core_objects' AS check_group,
  to_regclass('public.support_tickets') IS NOT NULL AS tickets_ok,
  to_regclass('public.support_ticket_comments') IS NOT NULL AS ticket_comments_ok,
  to_regclass('public.leads') IS NOT NULL AS leads_ok,
  to_regclass('public.platform_company_licenses') IS NOT NULL AS licenses_ok,
  to_regclass('public.platform_feature_flags') IS NOT NULL AS flags_ok,
  to_regclass('public.handoff_queues') IS NOT NULL AS handoff_ok,
  to_regclass('public.entity_contacts') IS NOT NULL AS entities_ok,
  to_regclass('public.platform_configurations') IS NOT NULL AS config_ok,
  to_regclass('public.platform_event_audit') IS NOT NULL AS events_ok;

SELECT 'metrics_functions' AS check_group, proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'ticket_platform_company_metrics_v1',
    'handoff_platform_company_metrics_v1',
    'lead_platform_company_metrics_v1',
    'appointment_platform_company_metrics_v1'
  )
ORDER BY proname;

SELECT 'identity_columns' AS check_group, table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'conversations' AND column_name = 'lead_id')
    OR (table_name = 'scheduling_bookings' AND column_name IN ('lead_id', 'conversation_id'))
  )
ORDER BY table_name, column_name;

SELECT 'rls_enabled' AS check_group, c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('support_tickets', 'leads', 'platform_feature_flags', 'platform_company_licenses')
ORDER BY c.relname;
