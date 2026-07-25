-- S4.8.1: Scheduling production hardening — RBAC provisioning + resource_services partial unique index

-- ── Task 2: RBAC — platform role templates ───────────────────────────────────

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'scheduling.view'),
    ('admin', 'scheduling.edit'),
    ('manager', 'scheduling.view'),
    ('manager', 'scheduling.edit'),
    ('employee', 'scheduling.view')
) as seed(template_key, permission_code)
where exists (
  select 1
  from public.permissions p
  where p.code = seed.permission_code
)
on conflict (template_key, permission_code) do nothing;

-- Backfill tenant DEFAULT roles from templates (admin = Company Admin)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is not null
  and r.template_key = 'admin'
  and p.code in ('scheduling.view', 'scheduling.edit')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is not null
  and r.template_key = 'manager'
  and p.code in ('scheduling.view', 'scheduling.edit')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is not null
  and r.template_key = 'employee'
  and p.code = 'scheduling.view'
on conflict do nothing;

-- ── Task 3: resource_services partial unique index ───────────────────────────

-- Resolve any duplicate active pairs before adding partial unique constraint
with ranked as (
  select
    id,
    row_number() over (
      partition by resource_id, service_id
      order by created_at desc nulls last, id desc
    ) as rn
  from public.resource_services
  where deleted_at is null
)
update public.resource_services rs
set deleted_at = now()
from ranked r
where rs.id = r.id
  and r.rn > 1;

drop index if exists public.idx_resource_services_pair;

create unique index if not exists idx_resource_services_pair_active
  on public.resource_services (resource_id, service_id)
  where deleted_at is null;

comment on index public.idx_resource_services_pair_active is
  'One active capability mapping per resource/service pair; soft-deleted rows may coexist.';
