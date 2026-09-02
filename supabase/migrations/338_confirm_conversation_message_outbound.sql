-- ============================================================
-- 338 — Confirm outbound delivery on conversation_messages
--
-- conversation_messages are append-only for content, but team-inbox
-- stamps metadata.outboundPhase='preparing' then invalidates the
-- query after WhatsApp dispatch succeeds. Delivery truth lives in
-- channel_delivery_events, so the UI stayed on "Preparing" forever.
--
-- Allow delivery-field updates only, add a confirm RPC, backfill
-- from existing delivery events, and keep content immutable.
-- ============================================================

create or replace function public.prevent_conversation_message_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Conversation messages are append-only and cannot be deleted.';
  end if;

  -- Content/identity remain immutable; delivery confirmation fields may change.
  if new.conversation_id is distinct from old.conversation_id
     or new.participant_id is distinct from old.participant_id
     or new.sequence_number is distinct from old.sequence_number
     or new.message_type is distinct from old.message_type
     or new.content_type is distinct from old.content_type
     or new.content is distinct from old.content
     or new.attachment_type is distinct from old.attachment_type
     or new.attachment_url is distinct from old.attachment_url
     or new.mime_type is distinct from old.mime_type
     or new.file_size is distinct from old.file_size
     or new.search_text is distinct from old.search_text
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
  then
    raise exception 'Conversation messages are append-only and cannot be modified or deleted.';
  end if;

  return new;
end;
$$;

comment on function public.prevent_conversation_message_mutation() is
  'Blocks delete and content mutation on conversation_messages; allows delivery status / external id / metadata confirmation updates.';

create or replace function public.confirm_conversation_message_outbound(
  p_message_id uuid,
  p_status text,
  p_external_message_id text default null
)
returns public.conversation_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.conversation_messages%rowtype;
  v_company_id uuid;
  v_status text;
begin
  if auth.role() <> 'service_role' and auth.role() <> 'authenticated' then
    raise exception 'Authentication required';
  end if;

  if p_message_id is null then
    raise exception 'message_id is required';
  end if;

  v_status := lower(coalesce(nullif(trim(p_status), ''), 'sent'));
  if v_status not in ('sent', 'delivered', 'read', 'failed', 'pending') then
    v_status := 'sent';
  end if;

  select m.*
  into v_row
  from public.conversation_messages m
  where m.id = p_message_id
  for update of m;

  if not found then
    raise exception 'Conversation message % not found', p_message_id;
  end if;

  select c.company_id
  into v_company_id
  from public.conversations c
  where c.id = v_row.conversation_id;

  if auth.role() = 'authenticated' then
    if v_company_id is distinct from public.current_company_id()
       and not public.is_super_admin() then
      raise exception 'Insufficient permissions to confirm outbound message';
    end if;
    if not public.is_super_admin()
       and not public.user_has_permission('channel.platform.dispatch')
       and not public.user_has_permission('conversation.reply')
       and not public.user_has_permission('ai.conversations.reply') then
      raise exception 'Insufficient permissions to confirm outbound message';
    end if;
  end if;

  begin
    update public.conversation_messages
    set
      status = case when v_status = 'pending' then status else v_status end,
      external_message_id = coalesce(nullif(trim(p_external_message_id), ''), external_message_id),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'outboundPhase', case when v_status = 'pending' then 'dispatching' else v_status end,
        'dispatchConfirmed', (v_status in ('sent', 'delivered', 'read')),
        'dispatchFailed', (v_status = 'failed'),
        'optimistic', false
      )
    where id = p_message_id
    returning * into v_row;
  exception
    when unique_violation then
      update public.conversation_messages
      set
        status = case when v_status = 'pending' then status else v_status end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'outboundPhase', case when v_status = 'pending' then 'dispatching' else v_status end,
          'dispatchConfirmed', (v_status in ('sent', 'delivered', 'read')),
          'dispatchFailed', (v_status = 'failed'),
          'optimistic', false
        )
      where id = p_message_id
      returning * into v_row;
  end;

  return v_row;
end;
$$;

revoke all on function public.confirm_conversation_message_outbound(uuid, text, text) from public;
grant execute on function public.confirm_conversation_message_outbound(uuid, text, text) to authenticated, service_role;

comment on function public.confirm_conversation_message_outbound(uuid, text, text) is
  'Marks a pre-persisted outgoing conversation message as dispatched using delivery status fields only.';

-- Heal rows that already have a successful channel delivery event.
-- Update status/metadata always; set external_message_id only when safe.
do $$
declare
  r record;
  v_ext text;
begin
  for r in
    select
      m.id as message_id,
      m.conversation_id,
      m.external_message_id as existing_external_id,
      e.delivery_status,
      e.external_message_id
    from public.conversation_messages m
    join lateral (
      select e2.delivery_status, e2.external_message_id
      from public.channel_delivery_events e2
      where e2.outbound_message_id = m.id
        and e2.delivery_status in ('sent', 'delivered', 'read')
      order by e2.sent_at desc nulls last, e2.created_at desc
      limit 1
    ) e on true
    where m.status = 'pending'
       or coalesce(m.metadata->>'outboundPhase', '') in ('preparing', 'dispatching')
       or m.external_message_id is null
  loop
    v_ext := coalesce(r.existing_external_id, r.external_message_id);

    if v_ext is not null
       and r.existing_external_id is null
       and exists (
         select 1
         from public.conversation_messages other
         where other.conversation_id = r.conversation_id
           and other.external_message_id = v_ext
           and other.id <> r.message_id
       )
    then
      v_ext := null;
    end if;

    begin
      update public.conversation_messages
      set
        status = case
          when r.delivery_status in ('sent', 'delivered', 'read', 'failed') then r.delivery_status
          else 'sent'
        end,
        external_message_id = coalesce(external_message_id, v_ext),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'outboundPhase', case
            when r.delivery_status in ('sent', 'delivered', 'read', 'failed') then r.delivery_status
            else 'sent'
          end,
          'dispatchConfirmed', r.delivery_status in ('sent', 'delivered', 'read'),
          'dispatchFailed', r.delivery_status = 'failed',
          'optimistic', false
        )
      where id = r.message_id;
    exception
      when unique_violation then
        update public.conversation_messages
        set
          status = case
            when r.delivery_status in ('sent', 'delivered', 'read', 'failed') then r.delivery_status
            else 'sent'
          end,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'outboundPhase', case
              when r.delivery_status in ('sent', 'delivered', 'read', 'failed') then r.delivery_status
              else 'sent'
            end,
            'dispatchConfirmed', r.delivery_status in ('sent', 'delivered', 'read'),
            'dispatchFailed', r.delivery_status = 'failed',
            'optimistic', false
          )
        where id = r.message_id;
    end;
  end loop;
end;
$$;
