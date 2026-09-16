-- =============================================================================
-- 358 — Conversation participants SELECT follows View All / View Assigned
-- =============================================================================
-- Migration 357 scoped conversations, messages, and attachment SELECT.
-- conversation_participants_select still used conversation_belongs_to_current_company
-- only, so an assigned-only reader could load participant rows for another
-- employee's (or unassigned) conversation by querying conversation_id.
--
-- Parent conversation is the canonical visibility source.
-- Does NOT change INSERT / UPDATE / DELETE participant policies.
-- Does NOT add permissions or assignment columns.
-- =============================================================================

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

comment on policy conversation_participants_select on public.conversation_participants is
  'Participant visibility follows parent conversation View All / View Assigned rules.';
