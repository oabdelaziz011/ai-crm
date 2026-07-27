-- Sprint 6.5.2 — Enterprise Branch Management Platform
-- Extends existing branches table; adds user branch assignments.

alter table public.branches
  add column if not exists code text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists is_primary boolean not null default false;

create unique index if not exists idx_branches_company_code_active
  on public.branches(company_id, lower(code))
  where deleted_at is null and code is not null;

create unique index if not exists idx_branches_one_primary_per_company
  on public.branches(company_id)
  where deleted_at is null and is_primary = true;

-- ── User branch assignments ─────────────────────────────────

create table if not exists public.user_branch_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, branch_id)
);

create index if not exists idx_user_branch_assignments_company
  on public.user_branch_assignments(company_id);

create index if not exists idx_user_branch_assignments_user
  on public.user_branch_assignments(user_id);

create index if not exists idx_user_branch_assignments_branch
  on public.user_branch_assignments(branch_id);

alter table public.user_branch_assignments enable row level security;

drop policy if exists user_branch_assignments_select on public.user_branch_assignments;
create policy user_branch_assignments_select on public.user_branch_assignments for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists user_branch_assignments_insert on public.user_branch_assignments;
create policy user_branch_assignments_insert on public.user_branch_assignments for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and (public.user_has_permission('users.edit') or public.user_has_permission('scheduling.edit'))
      )
    )
  );

drop policy if exists user_branch_assignments_update on public.user_branch_assignments;
create policy user_branch_assignments_update on public.user_branch_assignments for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and (public.user_has_permission('users.edit') or public.user_has_permission('scheduling.edit'))
      )
    )
  );

drop policy if exists user_branch_assignments_delete on public.user_branch_assignments;
create policy user_branch_assignments_delete on public.user_branch_assignments for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and (public.user_has_permission('users.edit') or public.user_has_permission('scheduling.edit'))
      )
    )
  );
