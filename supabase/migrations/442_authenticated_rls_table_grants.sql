-- =============================================================================
-- 442 — Grant authenticated the DML its RLS policies already allow
-- =============================================================================
-- Fresh databases no longer auto-expose public tables. The browser uses the
-- authenticated role. company_subscriptions has a select policy for that role
-- and no table GRANT, so PostgREST returns permission denied before RLS runs.
-- Grant only the command a permissive policy can admit. Never grant to anon.
-- Never grant TRUNCATE, REFERENCES, or TRIGGER. Do not change policies.
-- Idempotent. Do not apply to hosted Production without an approved backup.
-- =============================================================================

do $$
declare
  r record;
  priv text;
  cmds "char"[];
  admit boolean;
  auth_oid oid := 'authenticated'::regrole;
begin
  for r in
    select n.nspname as schema_name, c.relname as object_name, c.oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  loop
    foreach priv in array array['select', 'insert', 'update', 'delete']
    loop
      if has_table_privilege(auth_oid, r.oid, priv) then
        continue;
      end if;

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
            or auth_oid = any (p.polroles)
          )
          and case priv
            when 'insert' then btrim(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) is distinct from 'false'
            when 'update' then btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) is distinct from 'false'
              or btrim(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) is distinct from 'false'
            else btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) is distinct from 'false'
          end
      ) into admit;

      if not admit then
        continue;
      end if;

      begin
        execute format(
          'grant %s on table %I.%I to authenticated',
          priv,
          r.schema_name,
          r.object_name
        );
      exception
        when insufficient_privilege then
          null;
      end;
    end loop;
  end loop;
end $$;
