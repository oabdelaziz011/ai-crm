-- =============================================================================
-- 361 — Admin template: email.view for Email Workspace
-- =============================================================================
-- Email Workspace now requires email.view (not channels.view).
-- This updates the platform Admin role template so newly provisioned DEFAULT
-- Admin roles receive the canonical Email Workspace permission.
--
-- Does NOT:
--   - grant channels.view to Email-only / CUSTOM roles
--   - modify PLATFORM roles or Super Admin
--   - backfill existing tenant role_permissions (review separately)
--   - change RLS
--   - remove channels.view from Admin
-- =============================================================================

insert into public.platform_role_template_permissions (template_key, permission_code)
select 'admin', 'email.view'
where exists (select 1 from public.permissions p where p.code = 'email.view')
on conflict (template_key, permission_code) do nothing;
