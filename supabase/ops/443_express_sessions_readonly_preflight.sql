-- =============================================================================
-- READ-ONLY preflight for api_runtime.express_sessions
-- =============================================================================
-- Safe to run first. Performs SELECT only.
-- Does not INSERT/UPDATE/DELETE/DROP/TRUNCATE.
-- Leaves public.user_sessions untouched.
-- =============================================================================

select
  current_user as db_user,
  session_user as session_user,
  current_setting('is_superuser') as is_superuser,
  to_regclass('api_runtime.express_sessions') as api_runtime_express_sessions,
  to_regclass('public.user_sessions') as public_user_sessions;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  pg_catalog.pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname, c.relname) in (('api_runtime', 'express_sessions'), ('public', 'user_sessions'));

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'api_runtime'
  and tablename = 'express_sessions';

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'api_runtime'
  and table_name = 'express_sessions'
order by grantee, privilege_type;

-- Expected for a healthy production table:
-- api_runtime_express_sessions is not null
-- owner is the Postgres role used by DATABASE_URL (often postgres)
-- anon / authenticated / service_role have no grants
;