-- =============================================================================
-- PENDING — Sprint 3.9.2 Part B: Department normalization (DO NOT APPLY YET)
-- =============================================================================
-- Goal: add profiles.department_id FK while KEEPING profiles.department (text).
-- Destructive drop of `department` is OUT OF SCOPE for this file.
--
-- Sequence (when approved):
--   1) Additive schema (this file)
--   2) Backfill
--   3) App compatibility layer (read/write both)
--   4) Later sprint: stop writing free-text, then optionally deprecate text column
-- =============================================================================

-- 1) Additive FK (nullable) — does not remove `department` text.
alter table public.profiles
  add column if not exists department_id uuid
    references public.organization_departments(id)
    on delete set null;

create index if not exists idx_profiles_company_department_id
  on public.profiles (company_id, department_id)
  where department_id is not null;

comment on column public.profiles.department_id is
  'Normalized department FK. profiles.department text remains for compatibility.';

-- 2) Backfill strategy (company-scoped, case-insensitive name match).
-- Prefer active departments; if multiple matches, pick oldest created.
-- Only fill when department_id is null and department text is non-empty.
/*
update public.profiles p
set department_id = matched.id
from lateral (
  select d.id
  from public.organization_departments d
  where d.company_id = p.company_id
    and lower(trim(d.name)) = lower(trim(p.department))
  order by d.is_active desc, d.created_at asc nulls last
  limit 1
) matched
where p.department_id is null
  and p.company_id is not null
  and p.department is not null
  and length(trim(p.department)) > 0;
*/

-- 3) Compatibility layer (application — not SQL):
--   READ:  prefer department_id → join name; fallback to profiles.department
--   WRITE: if department_id set → sync department = org name;
--          if only text set → keep text, leave department_id null until matched
--   FILTER: prefer department_id; fallback equality on text during transition
--
-- 4) Repository changes (login-app):
--   - OrganizationRepository unchanged for departments CRUD
--   - Managed user update/create accept optional departmentId
--   - DepartmentSearchableSelect persists department_id + mirrored name
--   - Employee filters use department_id when present
--
-- 5) Do NOT:
--   - drop profiles.department
--   - make department_id NOT NULL until backfill coverage is verified
--   - force-create departments from orphan free-text without admin review
-- =============================================================================
