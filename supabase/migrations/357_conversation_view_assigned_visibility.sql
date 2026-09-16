-- =============================================================================
-- 357 — Conversation View Assigned (Email / inbox visibility foundation)
-- =============================================================================
-- Adds ai.conversations.view_assigned and scopes RLS so:
--   ai.conversations.view            → all company conversations (unchanged)
--   ai.conversations.view_assigned   → only assigned_user_id = auth.uid()
--   unassigned rows                  → View All only
--
-- Does NOT rename/remove ai.conversations.view.
-- Does NOT add assignment columns.
-- =============================================================================

insert into public.permissions (code, category, module, action, description)
values (
  'ai.conversations.view_assigned',
  'AI',
  'Conversations',
  'View Assigned',
  'View only conversations assigned to the current user'
)
on conflict (code) do nothing;

-- Commercial entitlement map: same AI assistant feature as view/reply.
insert into public.feature_definition_permissions (feature_code, permission_code, is_active)
values ('ai_assistant', 'ai.conversations.view_assigned', true)
on conflict (feature_code, permission_code) do nothing;

-- ── conversations SELECT ────────────────────────────────────────────────────

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select using (
  public.company_has_permission(company_id, 'ai.conversations.view')
  or (
    public.company_has_permission(company_id, 'ai.conversations.view_assigned')
    and assigned_user_id is not null
    and assigned_user_id = auth.uid()
  )
);

comment on policy conversations_select on public.conversations is
  'View All (ai.conversations.view) or View Assigned (assigned_user_id = auth.uid()). Unassigned requires View All.';

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
        and (
          public.company_has_permission(c.company_id, 'ai.conversations.view')
          or (
            public.company_has_permission(c.company_id, 'ai.conversations.view_assigned')
            and c.assigned_user_id is not null
            and c.assigned_user_id = auth.uid()
          )
        )
    )
  );

comment on policy conversation_messages_select on public.conversation_messages is
  'Message visibility follows parent conversation View All / View Assigned rules.';

-- ── conversation-attachments storage SELECT (assigned-only readers) ─────────

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

  select c.company_id, c.assigned_user_id
    into v_conv_company_id, v_assigned_user_id
  from public.conversations c
  where c.id = v_conversation_id
    and c.deleted_at is null;

  if v_conv_company_id is null then
    return false;
  end if;

  if v_conv_company_id is distinct from v_company_id then
    return false;
  end if;

  if p_permission = 'ai.conversations.view_assigned' then
    if v_assigned_user_id is null or v_assigned_user_id is distinct from auth.uid() then
      return false;
    end if;
  end if;

  return public.company_has_permission(v_conv_company_id, p_permission);
end;
$$;

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
