-- ============================================================
-- Vault OS – Repair migration 134 RBAC drift (forward-only)
--
-- Root cause: 134_enterprise_prompt_platform.sql inserts into
-- public.permissions using a non-existent "display_name" column.
--
-- Canonical permissions schema (004_rbac.sql / 018_prompt_orchestration.sql):
--   code, category, module, action, description
--
-- Deployment (134 cannot succeed as written):
--   1. supabase migration repair 134 --status applied
--   2. supabase db push
--
-- Idempotent. Preserves existing RBAC rows (ON CONFLICT only).
-- Does not modify prior migration files.
-- ============================================================

-- ── Sprint D2 DDL (134 intent, idempotent) ────────────────────

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

-- ── RBAC (correct shape; additive only) ───────────────────────

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
