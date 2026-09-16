-- ============================================================
-- 372 — Phase 6D Step 4: conversation visibility permission packing
--
-- Aligns canonical platform role templates with Model D:
--   ai.conversations.view          → company-wide (Admin)
--   ai.conversations.view_assigned → scoped (Agent / Manager)
--
-- Changes:
--   human_handoff_agent (Agent desk):
--     REMOVE default ai.conversations.view
--     ADD/RETAIN     ai.conversations.view_assigned
--   manager:
--     ADD            ai.conversations.view_assigned
--     do NOT grant   ai.conversations.view
--   admin:
--     unchanged (keeps ai.conversations.view)
--
-- Safety:
-- - Does NOT create/rename/delete permission codes
-- - Does NOT modify CUSTOM roles (template_key IS NULL)
-- - Does NOT modify user_permissions / direct user grants
-- - Does NOT modify Super Admin bypass
-- - Does NOT touch RLS, Assignment Governance, assignment audit,
--   or conversations.department_id
-- - Instance updates are limited to roles with
--     role_type = 'DEFAULT' AND template_key in (...)
-- - Idempotent
-- ============================================================

-- Fail closed if required catalog codes are missing.
do $$
begin
  if not exists (
    select 1 from public.permissions where code = 'ai.conversations.view'
  ) then
    raise exception 'ai.conversations.view missing from permissions catalog';
  end if;
  if not exists (
    select 1 from public.permissions where code = 'ai.conversations.view_assigned'
  ) then
    raise exception 'ai.conversations.view_assigned missing from permissions catalog';
  end if;
end;
$$;

-- ── 1. Template packing: Agent (human_handoff_agent) ─────────

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('human_handoff_agent', 'ai.conversations.view_assigned')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

delete from public.platform_role_template_permissions
where template_key = 'human_handoff_agent'
  and permission_code = 'ai.conversations.view';

-- ── 2. Template packing: Manager ─────────────────────────────

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('manager', 'ai.conversations.view_assigned')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

-- Manager must not receive company-wide view via this packing step.
-- (No insert of ai.conversations.view for manager.)

-- ── 3. Additive backfill: DEFAULT platform-managed instances ─

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'ai.conversations.view_assigned'
where r.role_type = 'DEFAULT'
  and r.template_key in ('human_handoff_agent', 'manager')
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

-- ── 4. Narrow revoke: Agent DEFAULT instances only ───────────
-- Proven scope: role_type = 'DEFAULT' AND template_key =
-- 'human_handoff_agent'. CUSTOM roles have template_key IS NULL
-- and are never matched. Admin DEFAULT roles are untouched.

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and p.code = 'ai.conversations.view'
  and r.role_type = 'DEFAULT'
  and r.template_key = 'human_handoff_agent';

-- ── 5. Invariants ────────────────────────────────────────────

do $$
begin
  if exists (
    select 1
    from public.platform_role_template_permissions
    where template_key = 'human_handoff_agent'
      and permission_code = 'ai.conversations.view'
  ) then
    raise exception
      '372: human_handoff_agent must not pack ai.conversations.view';
  end if;

  if not exists (
    select 1
    from public.platform_role_template_permissions
    where template_key = 'human_handoff_agent'
      and permission_code = 'ai.conversations.view_assigned'
  ) then
    raise exception
      '372: human_handoff_agent must pack ai.conversations.view_assigned';
  end if;

  if not exists (
    select 1
    from public.platform_role_template_permissions
    where template_key = 'manager'
      and permission_code = 'ai.conversations.view_assigned'
  ) then
    raise exception
      '372: manager must pack ai.conversations.view_assigned';
  end if;

  if exists (
    select 1
    from public.platform_role_template_permissions
    where template_key = 'manager'
      and permission_code = 'ai.conversations.view'
  ) then
    raise exception
      '372: manager must not pack company-wide ai.conversations.view';
  end if;

  if not exists (
    select 1
    from public.platform_role_template_permissions
    where template_key = 'admin'
      and permission_code = 'ai.conversations.view'
  ) then
    raise exception
      '372: admin must retain ai.conversations.view';
  end if;
end;
$$;
