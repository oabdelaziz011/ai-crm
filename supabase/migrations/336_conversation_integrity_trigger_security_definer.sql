-- ============================================================
-- 336 — Conversation integrity trigger must not depend on actor RLS
--
-- Take over / assign updates conversations.metadata. The integrity
-- trigger validates ai_assistant_settings + company_channels via SELECT.
-- Those tables are RLS-gated (ai_assistant.view / channels.view), so desk
-- roles like Human Handoff Agent fail with:
--   "AI Assistant settings not found or inactive for conversation."
-- even when the assistant row exists.
--
-- Fix: run the integrity function as SECURITY DEFINER so the check is a
-- true referential integrity guard, independent of the caller's catalog
-- view permissions. Does not weaken tenant checks (company_id still matched).
-- ============================================================

create or replace function public.validate_conversation_company_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assistant_company_id uuid;
  v_channel_company_id uuid;
  v_channel_key text;
begin
  select company_id
  into v_assistant_company_id
  from public.ai_assistant_settings
  where id = new.ai_assistant_id
    and deleted_at is null;

  if v_assistant_company_id is null then
    raise exception 'AI Assistant settings not found or inactive for conversation.';
  end if;

  if v_assistant_company_id is distinct from new.company_id then
    raise exception 'AI Assistant must belong to the same company as the conversation.';
  end if;

  if new.company_channel_id is not null then
    select cc.company_id, ch.key
    into v_channel_company_id, v_channel_key
    from public.company_channels cc
    inner join public.communication_channels ch on ch.id = cc.channel_id
    where cc.id = new.company_channel_id
      and cc.deleted_at is null;

    if v_channel_company_id is null then
      raise exception 'Company channel not found or inactive for conversation.';
    end if;

    if v_channel_company_id is distinct from new.company_id then
      raise exception 'Company channel must belong to the same company as the conversation.';
    end if;

    if v_channel_key is distinct from new.channel_type then
      raise exception 'Conversation channel_type must match the registered company channel type.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_conversation_company_integrity() is
  'Ensures conversation assistant/channel FKs belong to the conversation company. SECURITY DEFINER so integrity checks are not blocked by actor RLS on catalog tables.';

revoke all on function public.validate_conversation_company_integrity() from public;
revoke all on function public.validate_conversation_company_integrity() from anon;
revoke all on function public.validate_conversation_company_integrity() from authenticated;
-- Trigger-owned; no direct EXECUTE needed for clients.
