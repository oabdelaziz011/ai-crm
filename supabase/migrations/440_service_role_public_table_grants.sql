-- =============================================================================
-- 440 — Grant service_role the public tables it cannot already read
-- =============================================================================
-- Fresh local replay no longer auto-exposes tables created before explicit
-- grants. The webhook API reads and writes public.execution_policies with
-- service_role (select, insert, update). authenticated and anon stay unchanged.
-- Privilege helpers throw SQLSTATE 42809 when the planner evaluates them on the
-- wrong relkind (auth.instances is a table). Check privileges only after the
-- scan has already returned a public table, view, or sequence.
-- Do not apply this file to hosted Production without explicit approval.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as object_name, c.relkind, c.oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
  loop
    begin
      if has_table_privilege('service_role', r.oid, 'select') then
        continue;
      end if;
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
    exception
      when insufficient_privilege then
        null;
    end;
  end loop;

  for r in
    select n.nspname as schema_name, c.relname as object_name, c.oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
  loop
    begin
      if has_sequence_privilege('service_role', r.oid, 'usage') then
        continue;
      end if;
      execute format(
        'grant usage, select on sequence %I.%I to service_role',
        r.schema_name,
        r.object_name
      );
    exception
      when insufficient_privilege then
        null;
    end;
  end loop;
end $$;
