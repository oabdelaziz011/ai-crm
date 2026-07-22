-- ============================================================
-- Vault OS – Sprint D2: Enterprise Prompt Platform lifecycle
--
-- RBAC aligned with canonical schema:
--   permissions(code, category, module, action, description) — 004_rbac.sql
--   platform_role_template_permissions(template_key, permission_code) — 119_company_role_provisioning.sql
--   platform_role_templates.template_key in ('admin', 'manager', 'employee')
--   role_permissions backfill for DEFAULT admin roles — 123_enterprise_tenant_provisioning.sql / 131
-- ============================================================

alter table public.prompt_templates
  add column if not exists has_unpublished_draft boolean not null default false;

alter table public.prompt_template_versions
  add column if not exists lifecycle_status text not null default 'published'
    check (lifecycle_status in ('draft', 'published', 'archived'));

alter table public.prompt_template_versions
  add column if not exists policies jsonb not null default '{}'::jsonb;

alter table public.prompt_builds
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_prompt_template_versions_lifecycle
  on public.prompt_template_versions(template_id, lifecycle_status, version_number desc);

create index if not exists idx_prompt_templates_unpublished
  on public.prompt_templates(company_id, has_unpublished_draft)
  where has_unpublished_draft = true;

-- ── RBAC permissions (canonical shape) ────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  (
    'prompts.publish',
    'Prompts',
    'Prompts',
    'Publish',
    'Publish prompt template versions.'
  ),
  (
    'prompts.preview',
    'Prompts',
    'Prompts',
    'Preview',
    'Preview rendered prompt output.'
  ),
  (
    'prompts.rollback',
    'Prompts',
    'Prompts',
    'Rollback',
    'Rollback prompt templates to prior versions.'
  )
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'prompts.publish'),
    ('admin', 'prompts.preview'),
    ('admin', 'prompts.rollback')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.code in ('prompts.publish', 'prompts.preview', 'prompts.rollback')
where r.role_type = 'DEFAULT'
  and r.template_key = 'admin'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );
