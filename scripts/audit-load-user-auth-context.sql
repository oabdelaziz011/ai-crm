SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'load_user_auth_context'
ORDER BY p.oid DESC
LIMIT 1;

SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN ('178', '181')
ORDER BY version;
