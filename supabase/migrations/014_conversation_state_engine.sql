-- ============================================================
-- Vault OS – Phase 2 Sprint 2.3: Conversation State Engine
-- ============================================================
-- Enriches audit metadata for semantic state transition events.

create or replace function public.conversation_audit_events(
  p_old public.conversations,
  p_new public.conversations,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_events jsonb := '[]'::jsonb;
  v_semantic_event text;
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('conversation_created');
  end if;

  if p_old.state is distinct from p_new.state then
    v_semantic_event := p_new.metadata #>> '{state_engine,last_audit_event}';

    if v_semantic_event is not null and btrim(v_semantic_event) <> '' then
      v_events := v_events || jsonb_build_array(v_semantic_event);
    end if;

    if p_new.state = 'closed'
      and coalesce(v_semantic_event, '') <> 'conversation_closed'
    then
      v_events := v_events || jsonb_build_array('conversation_closed');
    end if;

    if coalesce(v_semantic_event, 'state_changed') <> 'state_changed' then
      v_events := v_events || jsonb_build_array('state_changed');
    elsif v_semantic_event is null then
      v_events := v_events || jsonb_build_array('state_changed');
    end if;
  end if;

  if p_old.assigned_user_id is distinct from p_new.assigned_user_id then
    v_events := v_events || jsonb_build_array('assignment_changed');
  end if;

  if p_old.priority is distinct from p_new.priority then
    v_events := v_events || jsonb_build_array('priority_changed');
  end if;

  if p_old.locked_by is distinct from p_new.locked_by and p_new.locked_by is not null then
    v_events := v_events || jsonb_build_array('conversation_locked');
  end if;

  if (
    p_old.unread_count_employee is distinct from p_new.unread_count_employee
    and p_new.unread_count_employee = 0
    and p_old.unread_count_employee > 0
  ) or (
    p_old.unread_count_customer is distinct from p_new.unread_count_customer
    and p_new.unread_count_customer = 0
    and p_old.unread_count_customer > 0
  ) then
    v_events := v_events || jsonb_build_array('unread_reset');
  end if;

  if p_old.metadata is distinct from p_new.metadata
    and v_events = '[]'::jsonb
    and p_old.state is not distinct from p_new.state
    and p_old.assigned_user_id is not distinct from p_new.assigned_user_id
    and p_old.priority is not distinct from p_new.priority
    and p_old.locked_by is not distinct from p_new.locked_by
    and p_old.unread_count_employee is not distinct from p_new.unread_count_employee
    and p_old.unread_count_customer is not distinct from p_new.unread_count_customer
  then
    v_events := v_events || jsonb_build_array('metadata_updated');
  elsif p_old.metadata is distinct from p_new.metadata
    and p_old.state is not distinct from p_new.state
  then
    v_events := v_events || jsonb_build_array('metadata_updated');
  end if;

  if p_old.deleted_at is distinct from p_new.deleted_at and p_new.deleted_at is not null then
    v_events := v_events || jsonb_build_array('conversation_closed');
  end if;

  return v_events;
end;
$$;
