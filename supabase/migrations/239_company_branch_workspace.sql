-- Sprint 3.6 — Company Workspace Branches production completion
-- Branch manager on existing branches table (no duplicate branch models).

alter table public.branches
  add column if not exists manager_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_branches_manager_user
  on public.branches(manager_user_id)
  where manager_user_id is not null;

comment on column public.branches.manager_user_id is
  'Optional branch manager profile/user id for Company Workspace.';
