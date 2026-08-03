-- Enable Supabase Realtime for Omnichannel inbox list + message thread updates.
-- Without these tables in supabase_realtime, useConversationRealtime never fires and
-- the inbox stays stale until manual refresh (React Query staleTime).

do $$
begin
  begin
    alter publication supabase_realtime add table public.conversations;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.conversation_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.channel_sessions;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

comment on table public.conversations is
  'Omnichannel conversations; included in supabase_realtime (migration 214) for inbox live updates.';
