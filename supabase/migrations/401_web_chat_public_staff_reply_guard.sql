-- ============================================================
-- 401 — Public Web Chat: staff replies require Web Presence access
--
-- For the public website widget (provider valueor.web_widget) persisting an
-- outgoing conversation_message IS delivery: the visitor widget polls
-- web_chat_public_list_messages. conversation_messages_insert only checks
-- ai.conversations.reply + conversation visibility, so a user granted other
-- channels could reach a website visitor without Web Chat access.
--
-- Additive guard, scoped to authenticated outgoing inserts on public widget
-- conversations. Service-role writes (visitor pipeline, AI, fallback) and every
-- other channel, internal AI chat and internal notes are unaffected.
-- ============================================================

create or replace function internal.enforce_public_web_chat_staff_reply()
returns trigger
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_company_id uuid;
  v_channel_type text;
  v_metadata jsonb;
begin
  if new.message_type is distinct from 'outgoing'
     or auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  select c.company_id, c.channel_type, c.metadata
  into v_company_id, v_channel_type, v_metadata
  from public.conversations c
  where c.id = new.conversation_id;

  if v_channel_type = 'web_chat'
     and coalesce(v_metadata->>'publicWebChat', '') = 'true'
     and v_metadata->>'channelProvider' = 'valueor.web_widget'
     and not internal.company_has_permission(v_company_id, 'web_presence.view')
     and not internal.company_has_permission(v_company_id, 'web_presence.manage') then
    raise exception 'Web Chat access is required to reply to this conversation.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function internal.enforce_public_web_chat_staff_reply() from public, anon, authenticated;

drop trigger if exists conversation_messages_public_web_chat_staff_reply on public.conversation_messages;
create trigger conversation_messages_public_web_chat_staff_reply
  before insert on public.conversation_messages
  for each row execute function internal.enforce_public_web_chat_staff_reply();

comment on function internal.enforce_public_web_chat_staff_reply() is
  'Public Web Chat (valueor.web_widget): authenticated outgoing replies require web_presence.view or web_presence.manage.';
