-- =============================================================================
-- 441 — Remove anon/authenticated privileges that RLS does not cover
-- =============================================================================
-- TRUNCATE ignores row-level security. TRIGGER and REFERENCES are not used by
-- PostgREST. anon keeps SELECT/INSERT/UPDATE/DELETE only when a permissive
-- policy can admit anon. Policies that require auth.role() = 'authenticated'
-- do not admit anon, so those grants are revoked.
-- authenticated keeps DML so the signed-in Data API continues to work.
-- service_role is unchanged.
-- Idempotent. Do not apply to hosted Production without an approved backup.
-- =============================================================================

do $$
declare
  r record;
  priv text;
  cmds "char"[];
  admit boolean;
  anon_oid oid := 'anon'::regrole;
begin
  for r in
    select n.nspname as schema_name, c.relname as object_name, c.oid, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    begin
      execute format(
        'revoke truncate, references, trigger on table %I.%I from public, anon, authenticated',
        r.schema_name,
        r.object_name
      );
    exception
      when insufficient_privilege then
        null;
    end;

    foreach priv in array array['select', 'insert', 'update', 'delete']
    loop
      cmds := case priv
        when 'select' then array['r', '*']::"char"[]
        when 'insert' then array['a', '*']::"char"[]
        when 'update' then array['w', '*']::"char"[]
        else array['d', '*']::"char"[]
      end;

      select exists (
        select 1
        from pg_policy p
        where p.polrelid = r.oid
          and p.polpermissive
          and p.polcmd = any (cmds)
          and (
            0::oid = any (p.polroles)
            or coalesce(cardinality(p.polroles), 0) = 0
            or anon_oid = any (p.polroles)
          )
          and coalesce(pg_get_expr(p.polqual, p.polrelid), '')
            !~* 'auth\.role\(\)\s*=\s*''authenticated'''
          and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
            !~* 'auth\.role\(\)\s*=\s*''authenticated'''
      ) into admit;

      if not admit then
        begin
          execute format(
            'revoke %s on table %I.%I from anon',
            priv,
            r.schema_name,
            r.object_name
          );
        exception
          when insufficient_privilege then
            null;
        end;
      end if;
    end loop;
  end loop;

  begin
    execute 'revoke all privileges on all sequences in schema public from anon';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;

do $$
declare
  owner name;
begin
  foreach owner in array array['postgres', 'supabase_admin']
  loop
    if not exists (select 1 from pg_roles where rolname = owner) then
      continue;
    end if;
    begin
      execute format(
        'alter default privileges for role %I in schema public revoke all on tables from anon, authenticated',
        owner
      );
      execute format(
        'alter default privileges for role %I in schema public revoke all on sequences from anon',
        owner
      );
    exception
      when insufficient_privilege then
        null;
    end;
  end loop;
end $$;
