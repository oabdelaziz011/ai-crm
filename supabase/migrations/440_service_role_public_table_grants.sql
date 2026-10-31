-- =============================================================================
-- 440 — Grant service_role the public tables it cannot already read
-- =============================================================================
-- Fresh local replay no longer auto-exposes tables created before explicit
-- grants. The webhook API uses service_role and was denied execution_policies
-- on a clean database. authenticated and anon stay unchanged.
-- Do not apply this file to hosted Production without explicit approval.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as object_name, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and not has_table_privilege('service_role', c.oid, 'select')
  loop
    if r.relkind in ('r', 'p') then
      execute format(
        'grant select, insert, update, delete on table %I.%I to service_role',
        r.schema_name,
        r.object_name
      );
    else
      execute format(
        'grant select on table %I.%I to service_role',
        r.schema_name,
        r.object_name
      );
    end if;
  end loop;

  for r in
    select n.nspname as schema_name, c.relname as object_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and not has_sequence_privilege('service_role', c.oid, 'usage')
  loop
    execute format(
      'grant usage, select on sequence %I.%I to service_role',
      r.schema_name,
      r.object_name
    );
  end loop;
end $$;
