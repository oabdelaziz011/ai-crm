-- =============================================================================
-- 443 — Private express-session table for the API
-- =============================================================================
-- api_runtime is not in supabase/config.toml schemas, so PostgREST does not
-- expose it. RLS is on and there are no policies. anon, authenticated, and
-- service_role have no privileges. The API reads this table through
-- DATABASE_URL as the Postgres owner / BYPASSRLS pooler role, which can access
-- the table without policies. Do not grant this table to anon or authenticated.
-- public.user_sessions is unrelated and must stay untouched.
-- Do not apply this file to hosted Production without explicit approval.
-- Operator helper: supabase/ops/443_express_sessions_preflight.sql
-- =============================================================================

create schema if not exists api_runtime;

revoke all on schema api_runtime from public;
revoke all on schema api_runtime from anon;
revoke all on schema api_runtime from authenticated;
revoke all on schema api_runtime from service_role;

create table if not exists api_runtime.express_sessions (
  sid text primary key,
  sess jsonb not null,
  expire timestamptz not null
);

create index if not exists express_sessions_expire_idx
  on api_runtime.express_sessions (expire);

alter table api_runtime.express_sessions enable row level security;

revoke all on table api_runtime.express_sessions from public;
revoke all on table api_runtime.express_sessions from anon;
revoke all on table api_runtime.express_sessions from authenticated;
revoke all on table api_runtime.express_sessions from service_role;

comment on table api_runtime.express_sessions is
  'API cookie sessions. Company access is not stored here.';

-- Rollback while this schema holds only the session table:
--   drop schema if exists api_runtime cascade;
