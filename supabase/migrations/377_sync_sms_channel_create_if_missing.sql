-- Ensure SMS settings save creates a company_channels row when missing.
-- Mirror 376_sync_whatsapp_channel_create_if_missing.sql for Twilio SMS.
-- Sync previously only updated existing SMS channels and never created one,
-- so settings alone left inbound To-number resolution and workspace outbound broken.

create or replace function public.sync_sms_channel_references(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.company_sms_settings;
  channel_row record;
  next_configuration jsonb;
  sms_channel_type_id uuid;
  existing_count integer;
  has_company_default boolean;
begin
  select * into settings_row
  from public.company_sms_settings
  where company_id = p_company_id;

  if settings_row.company_id is null then
    return;
  end if;

  select count(*)::int into existing_count
  from public.company_channels cc
  join public.communication_channels ch on ch.id = cc.channel_id
  where cc.company_id = p_company_id
    and cc.deleted_at is null
    and ch.key = 'sms';

  if existing_count = 0 then
    select id into sms_channel_type_id
    from public.communication_channels
    where key = 'sms'
    limit 1;

    if sms_channel_type_id is null then
      raise exception 'SMS communication channel catalog row is missing';
    end if;

    select exists (
      select 1
      from public.company_channels cc
      where cc.company_id = p_company_id
        and cc.deleted_at is null
        and cc.is_default = true
    ) into has_company_default;

    next_configuration := jsonb_build_object(
      'credentialsSource', 'company_sms_settings'
    );

    if nullif(trim(settings_row.account_sid), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{accountSid}',
        to_jsonb(trim(settings_row.account_sid)),
        true
      );
    end if;

    if nullif(trim(settings_row.from_number), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{fromNumber}',
        to_jsonb(trim(settings_row.from_number)),
        true
      );
    end if;

    if nullif(trim(settings_row.provider), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{provider}',
        to_jsonb(trim(settings_row.provider)),
        true
      );
    end if;

    insert into public.company_channels (
      company_id,
      channel_id,
      display_name,
      status,
      provider,
      configuration,
      webhook_url,
      is_default,
      is_enabled,
      health_status
    ) values (
      p_company_id,
      sms_channel_type_id,
      'SMS',
      case when settings_row.enabled then 'active' else 'pending' end,
      coalesce(nullif(trim(settings_row.provider), ''), 'twilio'),
      next_configuration,
      null,
      not has_company_default,
      settings_row.enabled,
      'unknown'
    );
  end if;

  for channel_row in
    select cc.id, cc.configuration
    from public.company_channels cc
    join public.communication_channels ch on ch.id = cc.channel_id
    where cc.company_id = p_company_id
      and cc.deleted_at is null
      and ch.key = 'sms'
  loop
    next_configuration := coalesce(channel_row.configuration, '{}'::jsonb)
      - 'authToken'
      - 'accountSid'
      - 'fromNumber';

    if nullif(trim(settings_row.account_sid), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{accountSid}',
        to_jsonb(trim(settings_row.account_sid)),
        true
      );
    end if;

    if nullif(trim(settings_row.from_number), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{fromNumber}',
        to_jsonb(trim(settings_row.from_number)),
        true
      );
    end if;

    if nullif(trim(settings_row.provider), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{provider}',
        to_jsonb(trim(settings_row.provider)),
        true
      );
    end if;

    next_configuration := jsonb_set(
      next_configuration,
      '{credentialsSource}',
      '"company_sms_settings"'::jsonb,
      true
    );

    update public.company_channels
    set configuration = next_configuration,
        is_enabled = settings_row.enabled,
        status = case
          when settings_row.enabled then 'active'
          else case when status = 'active' then 'disabled' else status end
        end,
        provider = coalesce(nullif(trim(settings_row.provider), ''), provider, 'twilio'),
        updated_at = now()
    where id = channel_row.id;
  end loop;
end;
$$;

-- Backfill any companies that already have SMS settings but no channel row.
do $$
declare
  company_row record;
begin
  for company_row in
    select company_id from public.company_sms_settings
  loop
    perform public.sync_sms_channel_references(company_row.company_id);
  end loop;
end;
$$;

revoke all on function public.sync_sms_channel_references(uuid) from public;
revoke all on function public.sync_sms_channel_references(uuid) from anon;
revoke all on function public.sync_sms_channel_references(uuid) from authenticated;
grant execute on function public.sync_sms_channel_references(uuid) to service_role;
