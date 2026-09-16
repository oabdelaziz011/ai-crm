-- =============================================================================
-- 347 — conversation-attachments storage RBAC (Omnichannel Phase 2B)
-- =============================================================================
-- HIGH H2: storage.objects policies for bucket conversation-attachments only
-- checked that folder[1] matched the caller's profiles.company_id. Any same-
-- company user who knew/guessed {companyId}/{conversationId}/... could
-- SELECT (signed URL) / INSERT / DELETE without conversation ownership checks.
--
-- Fix: require authoritative conversations row:
--   path folder[1] = conversations.company_id
--   path folder[2] = conversations.id (non-deleted)
--   + company_has_permission(company_id, ai.conversations.view|reply)
--
-- Aligns with conversations RLS / MessageService / migration 346 taxonomy.
-- conversation.* aliases are NOT accepted (no silent broaden).
--
-- Does NOT:
--   - rename/move objects
--   - mutate attachment rows / conversation_messages
--   - change signed URL lifetime
--   - touch other buckets / realtime
-- service_role continues to bypass storage RLS (inbound/workers).
-- =============================================================================

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

  -- Only the two Omnichannel conversation codes are accepted.
  if p_permission not in ('ai.conversations.view', 'ai.conversations.reply') then
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

  -- Authoritative conversation ownership (DEFINER bypasses conversations RLS
  -- for the ownership lookup; permission gate remains company_has_permission).
  select c.company_id
    into v_conv_company_id
  from public.conversations c
  where c.id = v_conversation_id
    and c.deleted_at is null;

  if v_conv_company_id is null then
    return false;
  end if;

  -- Path company folder must match conversation.company_id (no cross-folder plant).
  if v_conv_company_id is distinct from v_company_id then
    return false;
  end if;

  return public.company_has_permission(v_conv_company_id, p_permission);
end;
$$;

comment on function internal.can_access_conversation_attachment(text, text) is
  'Phase 2B: storage attachment gate — path company/conversation must match a live conversation; then company_has_permission(view|reply).';

create or replace function public.can_access_conversation_attachment(
  p_object_name text,
  p_permission text
)
returns boolean
language sql
stable
set search_path to public, internal
as $$
  select internal.can_access_conversation_attachment(p_object_name, p_permission);
$$;

revoke all on function public.can_access_conversation_attachment(text, text) from public;
revoke all on function public.can_access_conversation_attachment(text, text) from anon;
revoke all on function internal.can_access_conversation_attachment(text, text) from public;
revoke all on function internal.can_access_conversation_attachment(text, text) from anon;
grant execute on function public.can_access_conversation_attachment(text, text) to authenticated, service_role;
grant execute on function internal.can_access_conversation_attachment(text, text) to authenticated, service_role;

drop policy if exists "conversation_attachments_select" on storage.objects;
create policy "conversation_attachments_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'conversation-attachments'
  and public.can_access_conversation_attachment(name, 'ai.conversations.view')
);

drop policy if exists "conversation_attachments_insert" on storage.objects;
create policy "conversation_attachments_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'conversation-attachments'
  and public.can_access_conversation_attachment(name, 'ai.conversations.reply')
);

drop policy if exists "conversation_attachments_delete" on storage.objects;
create policy "conversation_attachments_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'conversation-attachments'
  and public.can_access_conversation_attachment(name, 'ai.conversations.reply')
);
