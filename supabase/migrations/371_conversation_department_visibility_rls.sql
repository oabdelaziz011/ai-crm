-- =============================================================================
-- 371 — Conversation department-aware visibility / RLS (Phase 6D Step 2)
-- =============================================================================
-- Extends View Assigned SELECT so that:
--   ai.conversations.view            → company-wide (unchanged)
--   ai.conversations.view_assigned   → assigned_user_id = auth.uid()
--                                      OR (unassigned AND department_id = actor dept)
--                                      OR department_id IN managed departments
--
-- Manager scope matches AssignmentGovernanceDataPort.listManagedDepartmentIds:
--   organization_departments.company_id = company
--   organization_departments.manager_user_id = auth.uid()
--   organization_departments.is_active = true
--
-- Does NOT:
--   - modify migration 369 / assignment_audit_events
--   - change permission grants or role templates
--   - backfill conversations.department_id
--   - change INSERT/UPDATE/DELETE conversation policies
-- =============================================================================

-- ── Canonical managed-department helper (auth.uid() scoped) ─────────────────

create or replace function internal.list_managed_department_ids(p_company_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path to internal, public
as $$
  select coalesce(
    (
      select array_agg(d.id order by d.id)
      from public.organization_departments d
      where p_company_id is not null
        and auth.uid() is not null
        and d.company_id = p_company_id
        and d.manager_user_id = auth.uid()
        and d.is_active = true
        and (
          public.is_super_admin()
          or p_company_id is not distinct from public.current_company_id()
        )
    ),
    '{}'::uuid[]
  );
$$;

comment on function internal.list_managed_department_ids(uuid) is
  'Canonical managed department IDs for auth.uid() in a company (AG listManagedDepartmentIds equivalent). Fail-closed cross-company.';

create or replace function public.list_managed_department_ids(p_company_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path to public, internal
as $$
  select internal.list_managed_department_ids(p_company_id);
$$;

comment on function public.list_managed_department_ids(uuid) is
  'Public wrapper for internal.list_managed_department_ids — auth.uid() manager scope only.';

revoke all on function internal.list_managed_department_ids(uuid) from public;
revoke all on function internal.list_managed_department_ids(uuid) from anon;
grant execute on function internal.list_managed_department_ids(uuid) to authenticated, service_role;

revoke all on function public.list_managed_department_ids(uuid) from public;
revoke all on function public.list_managed_department_ids(uuid) from anon;
grant execute on function public.list_managed_department_ids(uuid) to authenticated, service_role;

-- ── Authoritative conversation SELECT predicate ─────────────────────────────

create or replace function public.conversation_visible_to_caller(
  p_company_id uuid,
  p_assigned_user_id uuid,
  p_department_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to public, internal
as $$
declare
  v_actor_department_id uuid;
  v_managed uuid[];
begin
  if auth.role() is distinct from 'authenticated' then
    return false;
  end if;

  if p_company_id is null then
    return false;
  end if;

  -- View All (and Super Admin via company_has_permission) wins.
  if public.company_has_permission(p_company_id, 'ai.conversations.view') then
    return true;
  end if;

  if not public.company_has_permission(p_company_id, 'ai.conversations.view_assigned') then
    return false;
  end if;

  -- Assigned to self (any department ownership).
  if p_assigned_user_id is not null and p_assigned_user_id = auth.uid() then
    return true;
  end if;

  -- Manager: durable department ownership in managed set (assigned or unassigned).
  if p_department_id is not null then
    v_managed := internal.list_managed_department_ids(p_company_id);
    if p_department_id = any (v_managed) then
      return true;
    end if;
  end if;

  -- Agent department unassigned queue (requires actor profiles.department_id).
  if p_assigned_user_id is null and p_department_id is not null then
    select p.department_id
      into v_actor_department_id
    from public.profiles p
    where p.id = auth.uid()
    limit 1;

    if v_actor_department_id is not null
       and v_actor_department_id = p_department_id then
      return true;
    end if;
  end if;

  return false;
end;
$$;

comment on function public.conversation_visible_to_caller(uuid, uuid, uuid) is
  'Phase 6D Step 2 conversation SELECT predicate: View All | View Assigned (self | own-dept unassigned queue | managed departments). Fail-closed.';

revoke all on function public.conversation_visible_to_caller(uuid, uuid, uuid) from public;
revoke all on function public.conversation_visible_to_caller(uuid, uuid, uuid) from anon;
grant execute on function public.conversation_visible_to_caller(uuid, uuid, uuid) to authenticated, service_role;

-- Optional row-id helper for security tests / future readers (uses parent predicate).
create or replace function public.can_read_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public, internal
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and c.deleted_at is null
      and public.conversation_visible_to_caller(c.company_id, c.assigned_user_id, c.department_id)
  );
$$;

comment on function public.can_read_conversation(uuid) is
  'True when auth.uid() may SELECT the conversation under Phase 6D visibility rules.';

revoke all on function public.can_read_conversation(uuid) from public;
revoke all on function public.can_read_conversation(uuid) from anon;
grant execute on function public.can_read_conversation(uuid) to authenticated, service_role;

-- ── conversations SELECT ────────────────────────────────────────────────────

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select using (
  public.conversation_visible_to_caller(company_id, assigned_user_id, department_id)
);

comment on policy conversations_select on public.conversations is
  'Phase 6D: View All, or View Assigned (self-assigned | own-dept unassigned | managed-dept ownership).';

-- ── conversation_messages SELECT ────────────────────────────────────────────

drop policy if exists conversation_messages_select on public.conversation_messages;
create policy conversation_messages_select
  on public.conversation_messages
  for select
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.deleted_at is null
        and public.conversation_visible_to_caller(c.company_id, c.assigned_user_id, c.department_id)
    )
  );

comment on policy conversation_messages_select on public.conversation_messages is
  'Message visibility inherits parent conversation Phase 6D visibility.';

-- ── conversation_participants SELECT ────────────────────────────────────────

drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select
  on public.conversation_participants
  for select
  using (
    deleted_at is null
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.deleted_at is null
        and public.conversation_visible_to_caller(c.company_id, c.assigned_user_id, c.department_id)
    )
  );

comment on policy conversation_participants_select on public.conversation_participants is
  'Participant visibility inherits parent conversation Phase 6D visibility.';

-- ── conversation-attachments storage SELECT ─────────────────────────────────

create or replace function internal.can_access_conversation_attachment(
  p_object_name text,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path to internal, public
as $$
declare
  v_company_text text;
  v_conversation_text text;
  v_company_id uuid;
  v_conversation_id uuid;
  v_conv_company_id uuid;
  v_assigned_user_id uuid;
  v_department_id uuid;
begin
  if auth.role() is distinct from 'authenticated' then
    return false;
  end if;

  if p_object_name is null or length(trim(p_object_name)) = 0 then
    return false;
  end if;

  if p_permission is null or length(trim(p_permission)) = 0 then
    return false;
  end if;

  if p_permission not in (
    'ai.conversations.view',
    'ai.conversations.view_assigned',
    'ai.conversations.reply'
  ) then
    return false;
  end if;

  v_company_text := (storage.foldername(p_object_name))[1];
  v_conversation_text := (storage.foldername(p_object_name))[2];

  if v_company_text is null or v_conversation_text is null then
    return false;
  end if;

  begin
    v_company_id := v_company_text::uuid;
    v_conversation_id := v_conversation_text::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  select c.company_id, c.assigned_user_id, c.department_id
    into v_conv_company_id, v_assigned_user_id, v_department_id
  from public.conversations c
  where c.id = v_conversation_id
    and c.deleted_at is null;

  if v_conv_company_id is null then
    return false;
  end if;

  if v_conv_company_id is distinct from v_company_id then
    return false;
  end if;

  if p_permission in ('ai.conversations.view', 'ai.conversations.view_assigned') then
    return public.conversation_visible_to_caller(
      v_conv_company_id,
      v_assigned_user_id,
      v_department_id
    );
  end if;

  return public.company_has_permission(v_conv_company_id, p_permission);
end;
$$;

comment on function internal.can_access_conversation_attachment(text, text) is
  'Storage attachment access: path company/conversation must match row; view/view_assigned use conversation_visible_to_caller.';

drop policy if exists "conversation_attachments_select" on storage.objects;
create policy "conversation_attachments_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'conversation-attachments'
  and (
    public.can_access_conversation_attachment(name, 'ai.conversations.view')
    or public.can_access_conversation_attachment(name, 'ai.conversations.view_assigned')
  )
);
