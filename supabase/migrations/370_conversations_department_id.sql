-- =============================================================================
-- 370 — Durable conversation department ownership (Phase 6D Step 1)
-- =============================================================================
-- Adds conversations.department_id as the durable SoT for email department
-- ownership. Does NOT change RLS visibility policies or permission grants.
-- Does NOT modify assignment_audit_events (369).
--
-- PostgreSQL 15+ required for: ON DELETE SET NULL (department_id)
-- Live verified: server_version_num >= 150000 (PG 17.x).
-- =============================================================================

-- Composite FK target: (id, company_id) must be uniquely addressable.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_departments'::regclass
      and conname = 'organization_departments_id_company_id_key'
  ) then
    alter table public.organization_departments
      add constraint organization_departments_id_company_id_key
      unique (id, company_id);
  end if;
end $$;

alter table public.conversations
  add column if not exists department_id uuid;

comment on column public.conversations.department_id is
  'Durable department ownership for Model D email visibility. Snapshot at first create; survives assignment/reassignment/unassignment. NULL = unclassified. Not derived from assigned_user_id.';

-- Prefer composite FK with column-restricted SET NULL so company_id is never nulled.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_department_company_fk'
  ) then
    alter table public.conversations
      add constraint conversations_department_company_fk
      foreign key (department_id, company_id)
      references public.organization_departments (id, company_id)
      on delete set null (department_id);
  end if;
end $$;

create index if not exists idx_conversations_company_department
  on public.conversations (company_id, department_id)
  where deleted_at is null;

create index if not exists idx_conversations_company_department_unassigned
  on public.conversations (company_id, department_id)
  where deleted_at is null and assigned_user_id is null;
