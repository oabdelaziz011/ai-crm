-- S6.7: Branch-configurable no-show automation rules

create table if not exists public.scheduling_no_show_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  enabled boolean not null default true,
  grace_period_minutes integer not null default 15
    check (grace_period_minutes in (5, 10, 15, 20, 30)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists idx_scheduling_no_show_rules_company_branch
  on public.scheduling_no_show_rules (company_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_scheduling_no_show_rules_company
  on public.scheduling_no_show_rules (company_id);

drop trigger if exists scheduling_no_show_rules_updated_at on public.scheduling_no_show_rules;
create trigger scheduling_no_show_rules_updated_at
  before update on public.scheduling_no_show_rules
  for each row execute function public.set_updated_at();

alter table public.scheduling_no_show_rules enable row level security;

drop policy if exists scheduling_no_show_rules_select on public.scheduling_no_show_rules;
create policy scheduling_no_show_rules_select on public.scheduling_no_show_rules for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('scheduling.view')
      )
    )
  );

drop policy if exists scheduling_no_show_rules_insert on public.scheduling_no_show_rules;
create policy scheduling_no_show_rules_insert on public.scheduling_no_show_rules for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('scheduling.edit')
      )
    )
  );

drop policy if exists scheduling_no_show_rules_update on public.scheduling_no_show_rules;
create policy scheduling_no_show_rules_update on public.scheduling_no_show_rules for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('scheduling.edit')
      )
    )
  );

comment on table public.scheduling_no_show_rules is
  'Per-branch no-show grace period rules for automatic status transitions.';
