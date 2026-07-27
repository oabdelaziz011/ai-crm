-- ============================================================
-- Vault OS – Sprint 7.2 Enterprise Multi-Branch Management
-- Organization hierarchy, policies, transfers, resource assignments
-- ============================================================

insert into public.permissions (code, category, module, action, description)
values
  ('organization.view', 'Organization', 'Multi-Branch', 'View', 'View organization hierarchy and analytics'),
  ('organization.manage', 'Organization', 'Multi-Branch', 'Manage', 'Manage regions, groups, and branch policies'),
  ('organization.transfer', 'Organization', 'Multi-Branch', 'Transfer', 'Initiate cross-branch transfers'),
  ('organization.transfer.approve', 'Organization', 'Multi-Branch', 'Approve', 'Approve cross-branch transfers')
on conflict (code) do nothing;

-- ── Regions ──────────────────────────────────────────────────

create table if not exists public.organization_regions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text,
  description text,
  manager_user_id uuid references auth.users(id) on delete set null,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_organization_regions_company_name
on public.organization_regions(company_id, lower(name));

create index if not exists idx_organization_regions_company
on public.organization_regions(company_id, is_active);

-- ── Branch groups ────────────────────────────────────────────

create table if not exists public.organization_branch_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  region_id uuid references public.organization_regions(id) on delete set null,
  name text not null,
  code text,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_organization_branch_groups_company_name
on public.organization_branch_groups (company_id, lower(name));

-- ── Extend branches with hierarchy ───────────────────────────

alter table public.branches
  add column if not exists region_id uuid references public.organization_regions(id) on delete set null,
  add column if not exists branch_group_id uuid references public.organization_branch_groups(id) on delete set null,
  add column if not exists currency text not null default 'USD',
  add column if not exists health_score integer not null default 100 check (health_score between 0 and 100),
  add column if not exists branding jsonb not null default '{}'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb;

create index if not exists idx_branches_region on public.branches(region_id);
create index if not exists idx_branches_group on public.branches(branch_group_id);

-- ── Departments ──────────────────────────────────────────────

create table if not exists public.organization_departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  code text,
  department_type text not null default 'general'
    check (department_type in ('general', 'clinical', 'administrative', 'support')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_organization_departments_branch_name
on public.organization_departments (branch_id, lower(name));

-- ── Resource assignments (doctors, rooms, equipment) ─────────

create table if not exists public.organization_resource_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  department_id uuid references public.organization_departments(id) on delete set null,
  resource_id uuid not null references public.scheduling_resources(id) on delete cascade,
  assignment_type text not null default 'permanent'
    check (assignment_type in ('permanent', 'temporary', 'shared')),
  starts_at timestamptz,
  ends_at timestamptz,
  utilization_target_percent integer not null default 80,
  maintenance_status text not null default 'operational'
    check (maintenance_status in ('operational', 'maintenance', 'offline')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, resource_id, assignment_type)
);

create index if not exists idx_org_resource_assignments_branch
  on public.organization_resource_assignments(branch_id, is_active);

-- ── Policy inheritance ───────────────────────────────────────

create table if not exists public.organization_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  scope_level text not null
    check (scope_level in ('organization', 'region', 'branch_group', 'branch')),
  scope_id uuid,
  policy_type text not null
    check (policy_type in (
      'working_hours', 'cancellation', 'no_show', 'pricing', 'tax',
      'communication', 'portal_branding', 'notifications', 'capacity'
    )),
  config jsonb not null default '{}'::jsonb,
  inherits_from_parent boolean not null default true,
  is_active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organization_policies_scope
  on public.organization_policies(company_id, scope_level, scope_id, policy_type);

-- ── User region assignments ──────────────────────────────────

create table if not exists public.user_region_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  region_id uuid not null references public.organization_regions(id) on delete cascade,
  role text not null default 'regional_manager'
    check (role in ('regional_manager', 'regional_viewer')),
  created_at timestamptz not null default now(),
  unique (user_id, region_id)
);

-- ── Transfers ────────────────────────────────────────────────

create table if not exists public.organization_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transfer_type text not null
    check (transfer_type in ('booking', 'doctor', 'equipment', 'room', 'staff')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'completed', 'rolled_back', 'cancelled')),
  source_branch_id uuid references public.branches(id) on delete set null,
  target_branch_id uuid references public.branches(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  rollback_snapshot jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organization_transfers_company
  on public.organization_transfers(company_id, status, created_at desc);

-- ── Transfer approvals ───────────────────────────────────────

create table if not exists public.organization_transfer_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transfer_id uuid not null references public.organization_transfers(id) on delete cascade,
  approver_id uuid references auth.users(id) on delete set null,
  decision text not null check (decision in ('approved', 'rejected')),
  notes text,
  created_at timestamptz not null default now()
);

-- ── Organization audit log ───────────────────────────────────

create table if not exists public.organization_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  region_id uuid references public.organization_regions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_organization_audit_company
  on public.organization_audit_log(company_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.organization_regions enable row level security;
alter table public.organization_branch_groups enable row level security;
alter table public.organization_departments enable row level security;
alter table public.organization_resource_assignments enable row level security;
alter table public.organization_policies enable row level security;
alter table public.user_region_assignments enable row level security;
alter table public.organization_transfers enable row level security;
alter table public.organization_transfer_approvals enable row level security;
alter table public.organization_audit_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'organization_regions', 'organization_branch_groups', 'organization_departments',
    'organization_resource_assignments', 'organization_policies', 'user_region_assignments',
    'organization_transfers', 'organization_transfer_approvals', 'organization_audit_log'
  ] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select using (
        auth.role() = ''authenticated'' and (public.is_super_admin() or company_id = public.current_company_id())
      )', t, t
    );
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (
        auth.role() = ''authenticated'' and (public.is_super_admin() or company_id = public.current_company_id())
      ) with check (
        auth.role() = ''authenticated'' and (public.is_super_admin() or company_id = public.current_company_id())
      )', t, t
    );
  end loop;
end $$;

-- Grant permissions to admin/owner
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name in ('admin', 'owner', 'manager')
  and p.code in ('organization.view', 'organization.manage', 'organization.transfer', 'organization.transfer.approve')
on conflict do nothing;

-- ── RPC: resolve effective policy ────────────────────────────

create or replace function public.organization_resolve_policy(
  p_company_id uuid,
  p_branch_id uuid,
  p_policy_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb;
  v_region_id uuid;
  v_group_id uuid;
begin
  select region_id, branch_group_id into v_region_id, v_group_id
  from public.branches where id = p_branch_id and company_id = p_company_id;

  select config into v_config from public.organization_policies
  where company_id = p_company_id and scope_level = 'branch' and scope_id = p_branch_id
    and policy_type = p_policy_type and is_active = true
  order by priority desc limit 1;
  if v_config is not null then return v_config; end if;

  if v_group_id is not null then
    select config into v_config from public.organization_policies
    where company_id = p_company_id and scope_level = 'branch_group' and scope_id = v_group_id
      and policy_type = p_policy_type and is_active = true
    order by priority desc limit 1;
    if v_config is not null then return v_config; end if;
  end if;

  if v_region_id is not null then
    select config into v_config from public.organization_policies
    where company_id = p_company_id and scope_level = 'region' and scope_id = v_region_id
      and policy_type = p_policy_type and is_active = true
    order by priority desc limit 1;
    if v_config is not null then return v_config; end if;
  end if;

  select config into v_config from public.organization_policies
  where company_id = p_company_id and scope_level = 'organization' and scope_id is null
    and policy_type = p_policy_type and is_active = true
  order by priority desc limit 1;

  return coalesce(v_config, '{}'::jsonb);
end;
$$;

-- ── RPC: enterprise search ───────────────────────────────────

create or replace function public.organization_search(
  p_company_id uuid,
  p_query text,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_q text := '%' || lower(trim(p_query)) || '%';
begin
  v_result := v_result || coalesce((
    select jsonb_agg(jsonb_build_object('type', 'branch', 'id', id, 'label', name))
    from (select id, name from public.branches where company_id = p_company_id and deleted_at is null and lower(name) like v_q limit p_limit) b
  ), '[]'::jsonb);

  v_result := v_result || coalesce((
    select jsonb_agg(jsonb_build_object('type', 'region', 'id', id, 'label', name))
    from (select id, name from public.organization_regions where company_id = p_company_id and is_active and lower(name) like v_q limit p_limit) r
  ), '[]'::jsonb);

  v_result := v_result || coalesce((
    select jsonb_agg(jsonb_build_object('type', 'customer', 'id', id, 'label', name))
    from (select id, name from public.customers where lower(name) like v_q limit p_limit) c
  ), '[]'::jsonb);

  return v_result;
end;
$$;

grant execute on function public.organization_resolve_policy(uuid, uuid, text) to authenticated;
grant execute on function public.organization_search(uuid, text, integer) to authenticated;
