-- =============================================================================
-- 367 — profiles.department_id (Phase 1 canonical Employee → Department)
-- =============================================================================
-- Additive only:
--   - nullable profiles.department_id → organization_departments.id ON DELETE SET NULL
--   - company integrity trigger (SECURITY DEFINER; no recursive RLS)
--   - safe unambiguous backfill (no LIMIT 1 guesses)
--   - organization_merge_departments remaps profiles.department_id
--
-- Does NOT:
--   - drop / rename profiles.department
--   - make department_id NOT NULL
--   - change assignment / RBAC / Super Admin / AI routing
--   - add profiles.branch_id
--   - invent a new manager model
-- =============================================================================

-- 1) Additive FK (nullable) — keep profiles.department text.
alter table public.profiles
  add column if not exists department_id uuid
    references public.organization_departments(id)
    on delete set null;

create index if not exists idx_profiles_company_department_id
  on public.profiles (company_id, department_id)
  where department_id is not null;

comment on column public.profiles.department_id is
  'Canonical department membership FK → organization_departments.id. profiles.department text remains legacy/display during transition.';

-- 2) Company integrity: profiles.company_id must equal organization_departments.company_id.
-- Composite FK is unsafe here: ON DELETE SET NULL on (department_id, company_id) would
-- null profiles.company_id. Use a SECURITY DEFINER trigger instead (no client EXECUTE).
create or replace function public.profiles_validate_department_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept_company_id uuid;
begin
  if new.department_id is null then
    return new;
  end if;

  if new.company_id is null then
    raise exception 'profiles.department_id requires profiles.company_id';
  end if;

  select d.company_id
    into v_dept_company_id
  from public.organization_departments d
  where d.id = new.department_id;

  if v_dept_company_id is null then
    raise exception 'profiles.department_id must reference an existing organization_departments row';
  end if;

  if v_dept_company_id is distinct from new.company_id then
    raise exception 'profiles.department_id must reference a department in the same company';
  end if;

  return new;
end;
$$;

comment on function public.profiles_validate_department_company() is
  'Ensures profiles.department_id belongs to profiles.company_id. SECURITY DEFINER so integrity is independent of actor RLS on organization_departments.';

revoke all on function public.profiles_validate_department_company() from public;
revoke all on function public.profiles_validate_department_company() from anon;
revoke all on function public.profiles_validate_department_company() from authenticated;

drop trigger if exists trg_profiles_validate_department_company on public.profiles;
create trigger trg_profiles_validate_department_company
  before insert or update of department_id, company_id
  on public.profiles
  for each row
  execute function public.profiles_validate_department_company();

-- 3) Safe backfill — unambiguous matches only.
-- Classification (no LIMIT 1):
--   A) Has ≥1 user_branch_assignments → match active dept by company + name + branch_id
--      in the employee's assigned branches; require exactly one match.
--   B) No branch assignments → match active dept by company + name; require exactly one.
-- Ambiguous / unmatched remain NULL. Never create departments. Never guess branch.
do $$
declare
  v_candidates int := 0;
  v_branch_resolved int := 0;
  v_company_resolved int := 0;
  v_ambiguous int := 0;
  v_unmatched int := 0;
  v_already int := 0;
  v_updated int := 0;
begin
  select count(*)::int into v_already
  from public.profiles
  where department_id is not null;

  with candidates as (
    select
      p.id as profile_id,
      p.company_id,
      lower(trim(p.department)) as dept_key,
      exists (
        select 1
        from public.user_branch_assignments uba
        where uba.user_id = p.id
          and uba.company_id = p.company_id
      ) as has_branch
    from public.profiles p
    where p.department_id is null
      and p.company_id is not null
      and p.department is not null
      and length(trim(p.department)) > 0
  ),
  branch_matches as (
    select
      c.profile_id,
      count(d.id)::int as match_count
    from candidates c
    join public.user_branch_assignments uba
      on uba.user_id = c.profile_id
     and uba.company_id = c.company_id
    join public.organization_departments d
      on d.company_id = c.company_id
     and d.branch_id = uba.branch_id
     and d.is_active is true
     and lower(trim(d.name)) = c.dept_key
    where c.has_branch
    group by c.profile_id
  ),
  company_matches as (
    select
      c.profile_id,
      count(d.id)::int as match_count
    from candidates c
    join public.organization_departments d
      on d.company_id = c.company_id
     and d.is_active is true
     and lower(trim(d.name)) = c.dept_key
    where not c.has_branch
    group by c.profile_id
  ),
  classified as (
    select
      c.profile_id,
      c.has_branch,
      case
        when c.has_branch and coalesce(bm.match_count, 0) = 1 then 'branch_resolved'
        when c.has_branch and coalesce(bm.match_count, 0) > 1 then 'ambiguous'
        when c.has_branch then 'unmatched'
        when coalesce(cm.match_count, 0) = 1 then 'company_resolved'
        when coalesce(cm.match_count, 0) > 1 then 'ambiguous'
        else 'unmatched'
      end as class
    from candidates c
    left join branch_matches bm on bm.profile_id = c.profile_id
    left join company_matches cm on cm.profile_id = c.profile_id
  )
  select
    count(*)::int,
    count(*) filter (where class = 'branch_resolved')::int,
    count(*) filter (where class = 'company_resolved')::int,
    count(*) filter (where class = 'ambiguous')::int,
    count(*) filter (where class = 'unmatched')::int
  into v_candidates, v_branch_resolved, v_company_resolved, v_ambiguous, v_unmatched
  from classified;

  raise notice '367 backfill preflight: candidates=%, branch_resolved=%, company_resolved=%, ambiguous=%, unmatched=%, already_assigned=%',
    v_candidates, v_branch_resolved, v_company_resolved, v_ambiguous, v_unmatched, v_already;

  with candidates as (
    select
      p.id as profile_id,
      p.company_id,
      lower(trim(p.department)) as dept_key,
      exists (
        select 1
        from public.user_branch_assignments uba
        where uba.user_id = p.id
          and uba.company_id = p.company_id
      ) as has_branch
    from public.profiles p
    where p.department_id is null
      and p.company_id is not null
      and p.department is not null
      and length(trim(p.department)) > 0
  ),
  branch_matches as (
    select
      c.profile_id,
      (array_agg(d.id order by d.id))[1] as department_id
    from candidates c
    join public.user_branch_assignments uba
      on uba.user_id = c.profile_id
     and uba.company_id = c.company_id
    join public.organization_departments d
      on d.company_id = c.company_id
     and d.branch_id = uba.branch_id
     and d.is_active is true
     and lower(trim(d.name)) = c.dept_key
    where c.has_branch
    group by c.profile_id
    having count(d.id) = 1
  ),
  company_matches as (
    select
      c.profile_id,
      (array_agg(d.id order by d.id))[1] as department_id
    from candidates c
    join public.organization_departments d
      on d.company_id = c.company_id
     and d.is_active is true
     and lower(trim(d.name)) = c.dept_key
    where not c.has_branch
    group by c.profile_id
    having count(d.id) = 1
  ),
  resolved as (
    select profile_id, department_id from branch_matches
    union all
    select profile_id, department_id from company_matches
  )
  update public.profiles p
  set department_id = r.department_id
  from resolved r
  where p.id = r.profile_id
    and p.department_id is null;

  get diagnostics v_updated = row_count;

  raise notice '367 backfill applied: rows_updated=%', v_updated;
end;
$$;

-- 4) Merge remaps profiles.department_id → surviving department (keeps text sync).
create or replace function internal.organization_merge_departments(
  p_source_id uuid,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path to internal, public
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

  -- Canonical membership remap
  update public.profiles
  set department_id = v_target.id
  where company_id = v_source.company_id
    and department_id = v_source.id;

  -- Legacy text label remap (unchanged behavior)
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

comment on function public.organization_merge_departments(uuid, uuid) is
  'Merges a source department into a target: resources, children, profiles.department_id, employee labels; deactivates source.';

comment on function internal.organization_merge_departments(uuid, uuid) is
  'Merges a source department into a target: resources, children, profiles.department_id, employee labels; deactivates source.';
