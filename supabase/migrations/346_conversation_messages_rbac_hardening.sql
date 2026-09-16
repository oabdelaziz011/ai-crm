-- =============================================================================
-- 346 — conversation_messages RBAC hardening (Omnichannel Phase 2A)
-- =============================================================================
-- HIGH finding: conversation_messages SELECT/INSERT previously required only
-- conversation_belongs_to_current_company (company membership), allowing any
-- authenticated company member to bypass Omnichannel RBAC via PostgREST.
--
-- Align with conversations RLS (113) + MessageService (@workspace/ai-conversation):
--   SELECT → ai.conversations.view
--   INSERT → ai.conversations.reply
--
-- Authoritative taxonomy: ai.conversations.* (same as conversations table).
-- conversation.view / conversation.reply remain lifecycle/UI aliases and are
-- NOT used here (would silently broaden DB access vs conversations policies).
--
-- Tenant isolation: company_has_permission requires
--   p_company_id = current_company_id() (or is_super_admin, same as conversations).
--
-- service_role: continues to bypass RLS (webhook/worker/inbound paths).
-- UPDATE/DELETE: unchanged (denied + append-only triggers).
-- Does NOT modify: conversations, participants, attachments, realtime.
-- =============================================================================

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
        and public.company_has_permission(c.company_id, 'ai.conversations.view')
    )
  );

drop policy if exists conversation_messages_insert on public.conversation_messages;
create policy conversation_messages_insert
  on public.conversation_messages
  for insert
  with check (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.deleted_at is null
        and public.company_has_permission(c.company_id, 'ai.conversations.reply')
    )
  );

comment on policy conversation_messages_select on public.conversation_messages is
  'Phase 2A: company-owned conversation + ai.conversations.view (via company_has_permission).';

comment on policy conversation_messages_insert on public.conversation_messages is
  'Phase 2A: company-owned conversation + ai.conversations.reply (via company_has_permission).';
