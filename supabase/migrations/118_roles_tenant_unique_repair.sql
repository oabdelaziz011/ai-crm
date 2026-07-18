-- ============================================================
-- Vault OS – Repair roles tenant uniqueness (production drift)
--
-- Root cause: public.roles predates migration 004 composite unique.
-- CREATE TABLE IF NOT EXISTS in 004_rbac.sql (line 5–13) never replaced
-- legacy UNIQUE(name) (roles_name_key) on the linked project.
--
-- Intended: UNIQUE(company_id, name) per 004_rbac.sql line 13.
-- Idempotent. No data deletion.
-- ============================================================

do $$
declare
  v_constraint record;
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'roles'
      and c.contype = 'u'
      and c.conname = 'roles_name_key'
  ) then
    execute 'alter table public.roles drop constraint roles_name_key';
  end if;

  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = c.conkey[1]
     and not a.attisdropped
    where n.nspname = 'public'
      and t.relname = 'roles'
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 1
      and a.attname = 'name'
  loop
    execute format(
      'alter table public.roles drop constraint if exists %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'roles'
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 2
      and exists (
        select 1
        from pg_attribute a_company
        where a_company.attrelid = c.conrelid
          and a_company.attnum = c.conkey[1]
          and a_company.attname = 'company_id'
          and not a_company.attisdropped
      )
      and exists (
        select 1
        from pg_attribute a_name
        where a_name.attrelid = c.conrelid
          and a_name.attnum = c.conkey[2]
          and a_name.attname = 'name'
          and not a_name.attisdropped
      )
  ) then
    if exists (
      select 1
      from public.roles r
      where r.company_id is not null
      group by r.company_id, r.name
      having count(*) > 1
    ) then
      raise exception
        'cannot add UNIQUE(company_id, name): duplicate tenant role names exist';
    end if;

    alter table public.roles
      add constraint roles_company_id_name_key unique (company_id, name);
  end if;
end;
$$;
