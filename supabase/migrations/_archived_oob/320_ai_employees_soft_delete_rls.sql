-- Fix soft-delete RLS: setting deleted_at must not fail WITH CHECK.
-- Root cause: single UPDATE policy blocked rows once deleted_at became non-null
-- (Postgres evaluates the new row; SELECT requires deleted_at IS NULL).
-- Split into active-row edits vs archive (soft delete) vs restore.

drop policy if exists ai_employees_update on public.ai_employees;
drop policy if exists ai_employees_update_active on public.ai_employees;
drop policy if exists ai_employees_soft_delete on public.ai_employees;
drop policy if exists ai_employees_restore on public.ai_employees;

create policy ai_employees_update_active on public.ai_employees
for update
using (
  deleted_at is null
  and (
    internal.company_has_agents_access(company_id, 'agents.edit')
    or internal.company_has_agents_access(company_id, 'agents.delete')
  )
)
with check (
  deleted_at is null
  and (
    internal.company_has_agents_access(company_id, 'agents.edit')
    or internal.company_has_agents_access(company_id, 'agents.delete')
  )
);

create policy ai_employees_soft_delete on public.ai_employees
for update
using (
  deleted_at is null
  and internal.company_has_agents_access(company_id, 'agents.delete')
)
with check (
  deleted_at is not null
  and status = 'archived'
  and internal.company_has_agents_access(company_id, 'agents.delete')
);

create policy ai_employees_restore on public.ai_employees
for update
using (
  deleted_at is not null
  and internal.company_has_agents_access(company_id, 'agents.edit')
)
with check (
  deleted_at is null
  and internal.company_has_agents_access(company_id, 'agents.edit')
);

comment on policy ai_employees_update_active on public.ai_employees is
  'Edit in-place updates for non-deleted AI employees (agents.edit or agents.delete).';
comment on policy ai_employees_soft_delete on public.ai_employees is
  'Archive soft-delete: sets deleted_at + status=archived (agents.delete only).';
comment on policy ai_employees_restore on public.ai_employees is
  'Restore archived AI employees (agents.edit).';
