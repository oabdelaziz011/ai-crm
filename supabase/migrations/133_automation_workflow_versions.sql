-- Sprint B2-04: workflow versioning, lifecycle governance, rollback permissions

alter table public.automation_flows
  add column if not exists active_version_id uuid,
  add column if not exists has_unpublished_draft boolean not null default true;

alter table public.automation_flows
  drop constraint if exists automation_flows_status_check;

alter table public.automation_flows
  add constraint automation_flows_status_check
  check (status in ('draft', 'active', 'disabled', 'archived'));

create table if not exists public.automation_flow_versions (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.automation_flows(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'published' check (status in ('published', 'archived')),
  release_notes text not null default '',
  snapshot jsonb not null,
  is_active boolean not null default false,
  is_immutable boolean not null default true,
  published_at timestamptz,
  published_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (flow_id, version_number)
);

create index if not exists idx_automation_flow_versions_flow
  on public.automation_flow_versions (flow_id, version_number desc);

create index if not exists idx_automation_flow_versions_active
  on public.automation_flow_versions (flow_id)
  where is_active = true;

alter table public.automation_flows
  add constraint automation_flows_active_version_fk
  foreign key (active_version_id) references public.automation_flow_versions(id)
  on delete set null;

insert into public.permissions (code, name, description, module)
values
  ('automation.rollback', 'Rollback Workflows', 'Activate a previous published workflow version', 'automation'),
  ('automation.archive', 'Archive Workflows', 'Archive workflows and stop production execution', 'automation')
on conflict (code) do nothing;

insert into public.platform_role_template_permissions (role_template_id, permission_id)
select prt.id, p.id
from public.platform_role_templates prt
cross join public.permissions p
where prt.code = 'tenant_admin'
  and p.code in ('automation.rollback', 'automation.archive')
on conflict do nothing;

alter table public.automation_flow_versions enable row level security;

create policy automation_flow_versions_select on public.automation_flow_versions
  for select using (
    company_id = public.current_company_id()
    and public.has_permission('automation.view')
  );

create policy automation_flow_versions_insert on public.automation_flow_versions
  for insert with check (
    company_id = public.current_company_id()
    and public.has_permission('automation.publish')
  );

create policy automation_flow_versions_update on public.automation_flow_versions
  for update using (
    company_id = public.current_company_id()
    and (
      public.has_permission('automation.publish')
      or public.has_permission('automation.rollback')
      or public.has_permission('automation.archive')
    )
  );

create or replace function public.automation_flow_audit_events(
  p_old public.automation_flows,
  p_new public.automation_flows,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('flow_created');
  end if;

  if p_op = 'UPDATE' then
    if p_old.deleted_at is null and p_new.deleted_at is not null then
      return jsonb_build_array('flow_deleted');
    end if;

    if p_old.status is distinct from p_new.status then
      if p_new.status = 'active' then
        return jsonb_build_array('flow_published');
      elsif p_new.status = 'disabled' then
        return jsonb_build_array('flow_disabled');
      elsif p_new.status = 'archived' then
        return jsonb_build_array('flow_archived');
      end if;
    end if;

    if p_old.active_version_id is distinct from p_new.active_version_id
       and p_new.active_version_id is not null
       and p_old.active_version_id is not null then
      return jsonb_build_array('flow_rolled_back');
    end if;

    if p_old.name is distinct from p_new.name
       or p_old.description is distinct from p_new.description
       or p_old.trigger_type is distinct from p_new.trigger_type
       or p_old.version is distinct from p_new.version
       or p_old.has_unpublished_draft is distinct from p_new.has_unpublished_draft then
      return jsonb_build_array('flow_updated');
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;
