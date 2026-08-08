-- Sprint 3.7 — Company Workspace Departments production completion
-- Extends organization_departments (no duplicate department tables).

alter table public.organization_departments
  add column if not exists manager_user_id uuid references auth.users(id) on delete set null,
  add column if not exists parent_id uuid references public.organization_departments(id) on delete set null,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_organization_departments_manager
  on public.organization_departments(manager_user_id)
  where manager_user_id is not null;

create index if not exists idx_organization_departments_parent
  on public.organization_departments(parent_id)
  where parent_id is not null;

drop trigger if exists organization_departments_updated_at on public.organization_departments;
create trigger organization_departments_updated_at
  before update on public.organization_departments
  for each row execute procedure public.set_updated_at();

-- Prevent parent cycles / cross-company parents
create or replace function public.organization_departments_validate_parent()
returns trigger
language plpgsql
as $$
declare
  v_walk uuid;
  v_guard int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Department cannot be its own parent';
  end if;

  if not exists (
    select 1
    from public.organization_departments p
    where p.id = new.parent_id
      and p.company_id = new.company_id
      and p.branch_id = new.branch_id
  ) then
    raise exception 'Parent department must belong to the same company and branch';
  end if;

  v_walk := new.parent_id;
  while v_walk is not null loop
    v_guard := v_guard + 1;
    if v_guard > 50 then
      raise exception 'Department parent cycle detected';
    end if;
    if v_walk = new.id then
      raise exception 'Department parent cycle detected';
    end if;
    select parent_id into v_walk
    from public.organization_departments
    where id = v_walk;
  end loop;

  return new;
end;
$$;

drop trigger if exists organization_departments_parent_check on public.organization_departments;
create trigger organization_departments_parent_check
  before insert or update of parent_id, company_id, branch_id on public.organization_departments
  for each row execute function public.organization_departments_validate_parent();

-- Merge source into target: reassign resources/employees/children, deactivate source
create or replace function public.organization_merge_departments(
  p_source_id uuid,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.organization_departments%rowtype;
  v_target public.organization_departments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
    raise exception 'Invalid merge departments';
  end if;

  select * into v_source from public.organization_departments where id = p_source_id;
  select * into v_target from public.organization_departments where id = p_target_id;

  if v_source.id is null or v_target.id is null then
    raise exception 'Department not found';
  end if;

  if v_source.company_id <> v_target.company_id then
    raise exception 'Departments must belong to the same company';
  end if;

  if not (
    public.is_super_admin()
    or (
      public.current_company_id() = v_source.company_id
      and (
        public.user_has_permission('departments.manage')
        or public.user_has_permission('organization.manage')
        or public.user_has_permission('settings.edit')
      )
    )
  ) then
    raise exception 'Forbidden';
  end if;

  update public.organization_resource_assignments
  set department_id = v_target.id, updated_at = now()
  where department_id = v_source.id
    and company_id = v_source.company_id;

  update public.organization_departments
  set parent_id = v_target.id, updated_at = now()
  where parent_id = v_source.id
    and company_id = v_source.company_id
    and id <> v_target.id;

  update public.profiles
  set department = v_target.name
  where company_id = v_source.company_id
    and department is not null
    and lower(trim(department)) = lower(trim(v_source.name));

  update public.organization_departments
  set
    is_active = false,
    parent_id = null,
    updated_at = now()
  where id = v_source.id;
end;
$$;

revoke all on function public.organization_merge_departments(uuid, uuid) from public;
grant execute on function public.organization_merge_departments(uuid, uuid) to authenticated;

comment on function public.organization_merge_departments(uuid, uuid) is
  'Merges a source department into a target: resources, children, employee labels; deactivates source.';
