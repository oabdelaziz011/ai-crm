-- ============================================================
-- Vault OS – Sprint D2: Enterprise Prompt Platform lifecycle
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

insert into public.permissions (code, display_name, description, category)
values
  ('prompts.publish', 'Publish Prompts', 'Publish prompt template versions.', 'prompts'),
  ('prompts.preview', 'Preview Prompts', 'Preview rendered prompt output.', 'prompts'),
  ('prompts.rollback', 'Rollback Prompts', 'Rollback prompt templates to prior versions.', 'prompts')
on conflict (code) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  category = excluded.category;

create index if not exists idx_prompt_template_versions_lifecycle
  on public.prompt_template_versions(template_id, lifecycle_status, version_number desc);

create index if not exists idx_prompt_templates_unpublished
  on public.prompt_templates(company_id, has_unpublished_draft)
  where has_unpublished_draft = true;
