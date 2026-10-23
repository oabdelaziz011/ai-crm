-- Enabling the official website widget must revive its dedicated channel.
-- CompanyChannelRepository.softDelete sets status=disabled and deleted_at, and
-- web_chat_widget_available requires deleted_at is null. The previous sync only
-- flipped is_enabled/status, and the BEFORE ref check rejected the enable while
-- the channel was still deleted, so the public endpoint stayed unavailable.
-- Entitlement and origin checks are unchanged. A disabled widget cannot point at
-- a deleted channel. Disabling does not delete the channel.

create or replace function internal.web_chat_widgets_validate_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_company uuid;
  v_channel_key text;
  v_channel_provider text;
  v_channel_deleted timestamptz;
  v_employee_company uuid;
  v_employee_status text;
  v_employee_deleted timestamptz;
begin
  select cc.company_id, ch.key, cc.provider, cc.deleted_at
    into v_channel_company, v_channel_key, v_channel_provider, v_channel_deleted
  from public.company_channels cc
  join public.communication_channels ch on ch.id = cc.channel_id
  where cc.id = new.company_channel_id;

  if v_channel_company is null or v_channel_company is distinct from new.company_id then
    raise exception 'Widget channel must belong to the same company';
  end if;
  if v_channel_key is distinct from 'web_chat'
     or v_channel_provider is distinct from 'valueor.web_widget' then
    raise exception 'Widget channel must be a dedicated valueor.web_widget channel';
  end if;
  -- Enable is the official restore. The AFTER sync clears deleted_at.
  if v_channel_deleted is not null and not new.enabled then
    raise exception 'Widget channel is deleted';
  end if;

  if new.ai_employee_id is not null
     and (tg_op = 'INSERT' or new.ai_employee_id is distinct from old.ai_employee_id) then
    select e.company_id, e.status, e.deleted_at
      into v_employee_company, v_employee_status, v_employee_deleted
    from public.ai_employees e
    where e.id = new.ai_employee_id;

    if v_employee_company is null or v_employee_company is distinct from new.company_id then
      raise exception 'AI Employee must belong to the same company';
    end if;
    if v_employee_deleted is not null or v_employee_status = 'archived' then
      raise exception 'AI Employee is not available';
    end if;
  end if;

  return new;
end;
$$;


create or replace function internal.web_chat_widgets_sync_channel_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.enabled is distinct from old.enabled then
    update public.company_channels cc
    set is_enabled = new.enabled,
        status = case when new.enabled then 'active' else 'pending' end,
        deleted_at = case when new.enabled then null else cc.deleted_at end,
        deleted_by = case when new.enabled then null else cc.deleted_by end
    where cc.id = new.company_channel_id
      and cc.company_id = new.company_id
      and cc.provider = 'valueor.web_widget'
      and (
        cc.is_enabled is distinct from new.enabled
        or cc.status is distinct from case when new.enabled then 'active' else 'pending' end
        or (new.enabled and cc.deleted_at is not null)
      );
  end if;
  return new;
end;
$$;
