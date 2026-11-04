-- =============================================================================
-- APPLY api_runtime.express_sessions (idempotent)
-- =============================================================================
-- Requires explicit production approval.
-- Does NOT drop or truncate public.user_sessions.
-- Does NOT drop api_runtime if it already contains other objects.
-- Creates schema/table/index if missing and revokes PostgREST roles.
-- Verification probe inserts/deletes one temporary row, then removes it.
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

-- Verification as the same role DATABASE_URL will use:
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
    raise exception 'session apply verification read failed';
  end if;

  delete from api_runtime.express_sessions where sid = probe_sid;
end $$;

select 'api_runtime.express_sessions write/read/delete ok' as status;
