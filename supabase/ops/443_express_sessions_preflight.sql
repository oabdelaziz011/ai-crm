-- =============================================================================
-- 443 preflight / apply helper for api_runtime.express_sessions
-- =============================================================================
-- Manual only. Do not run from deploy scripts.
-- Leaves public.user_sessions untouched.
--
-- DATABASE_URL for the API must connect as a role that can read/write this
-- table. The migration enables RLS with no policies and revokes API roles from
-- PostgREST (anon/authenticated/service_role). The Postgres owner / BYPASSRLS
-- session-pooler role used by DATABASE_URL can still access the table.
-- =============================================================================

-- 1) Preflight: current objects (safe, read-only)
select
  current_user as db_user,
  current_setting('role') as role_setting,
  to_regclass('api_runtime.express_sessions') as api_runtime_express_sessions,
  to_regclass('public.user_sessions') as public_user_sessions;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname, c.relname) in (('api_runtime', 'express_sessions'), ('public', 'user_sessions'));

-- 2) Apply (idempotent). Run only after explicit production approval.
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

-- 3) Verification (run as the same role DATABASE_URL will use)
select to_regclass('api_runtime.express_sessions') as table_ok;

do $$
declare
  probe_sid text := 'valueor-session-preflight';
begin
  insert into api_runtime.express_sessions (sid, sess, expire)
  values (probe_sid, '{"cookie":{"originalMaxAge":1000}}'::jsonb, now() + interval '1 minute')
  on conflict (sid) do update
    set sess = excluded.sess,
        expire = excluded.expire;

  if not exists (
    select 1 from api_runtime.express_sessions where sid = probe_sid and expire > now()
  ) then
    raise exception 'session preflight read failed';
  end if;

  delete from api_runtime.express_sessions where sid = probe_sid;
end $$;

select 'api_runtime.express_sessions write/read/delete ok' as status;
