-- Ensure email settings sync creates a company_channels row when missing,
-- and repair orphan channel_id values that no longer join communication_channels
-- (common after cloud → local catalog UUID drift).
-- Mirror 376 (WhatsApp) / 377 (SMS). Sync previously only updated existing
-- email channels (ch.key = 'email') and never created one, so settings alone
-- left channel-outbound-health returning email_channel_not_found.

create or replace function public.sync_email_channel_references(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.company_email_settings;
  channel_row record;
  next_configuration jsonb;
  email_channel_type_id uuid;
  existing_count integer;
  has_company_default boolean;
begin
  select * into settings_row
  from public.company_email_settings
  where company_id = p_company_id;

  if settings_row.company_id is null then
    return;
  end if;

  select id into email_channel_type_id
  from public.communication_channels
  where key = 'email'
  limit 1;

  if email_channel_type_id is null then
    raise exception 'Email communication channel catalog row is missing';
  end if;

  -- Repair email-like rows whose channel_id no longer joins the catalog.
  update public.company_channels cc
  set channel_id = email_channel_type_id,
      updated_at = now()
  where cc.company_id = p_company_id
    and cc.deleted_at is null
    and not exists (
      select 1 from public.communication_channels ch where ch.id = cc.channel_id
    )
    and (
      lower(coalesce(cc.provider, '')) in ('email', 'generic.email', 'smtp')
      or lower(coalesce(cc.configuration->>'credentialsSource', '')) = 'company_email_settings'
      or lower(coalesce(cc.configuration->>'channelKey', '')) = 'email'
    );

  select count(*)::int into existing_count
  from public.company_channels cc
  join public.communication_channels ch on ch.id = cc.channel_id
  where cc.company_id = p_company_id
    and cc.deleted_at is null
    and ch.key = 'email';

  if existing_count = 0 then
    select exists (
      select 1
      from public.company_channels cc
      where cc.company_id = p_company_id
        and cc.deleted_at is null
        and cc.is_default = true
    ) into has_company_default;

    next_configuration := jsonb_build_object(
      'credentialsSource', 'company_email_settings'
    );

    if nullif(trim(settings_row.from_email), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{fromEmail}',
        to_jsonb(trim(settings_row.from_email)),
        true
      );
    end if;

    if nullif(trim(settings_row.reply_to_email), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{replyToEmail}',
        to_jsonb(trim(settings_row.reply_to_email)),
        true
      );
    end if;

    if nullif(trim(settings_row.from_name), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{fromName}',
        to_jsonb(trim(settings_row.from_name)),
        true
      );
    end if;

    if nullif(trim(settings_row.mailbox_provider), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{mailboxProvider}',
        to_jsonb(trim(settings_row.mailbox_provider)),
        true
      );
    end if;

    if nullif(trim(settings_row.connection_status), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{connectionStatus}',
        to_jsonb(trim(settings_row.connection_status)),
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
      email_channel_type_id,
      'Email',
      case when settings_row.enabled then 'active' else 'pending' end,
      'generic.email',
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
      and ch.key = 'email'
  loop
    next_configuration := coalesce(channel_row.configuration, '{}'::jsonb)
      - 'smtpPassword'
      - 'imapPassword'
      - 'oauthToken'
      - 'oauthRefreshToken'
      - 'accessToken'
      - 'refreshToken';

    if nullif(trim(settings_row.from_email), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{fromEmail}',
        to_jsonb(trim(settings_row.from_email)),
        true
      );
    end if;

    if nullif(trim(settings_row.reply_to_email), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{replyToEmail}',
        to_jsonb(trim(settings_row.reply_to_email)),
        true
      );
    end if;

    if nullif(trim(settings_row.from_name), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{fromName}',
        to_jsonb(trim(settings_row.from_name)),
        true
      );
    end if;

    next_configuration := jsonb_set(
      next_configuration,
      '{credentialsSource}',
      '"company_email_settings"'::jsonb,
      true
    );

    next_configuration := jsonb_set(
      next_configuration,
      '{mailboxProvider}',
      to_jsonb(settings_row.mailbox_provider),
      true
    );

    next_configuration := jsonb_set(
      next_configuration,
      '{connectionStatus}',
      to_jsonb(settings_row.connection_status),
      true
    );

    update public.company_channels
    set configuration = next_configuration,
        is_enabled = settings_row.enabled,
        status = case
          when settings_row.enabled then 'active'
          else case when status = 'active' then 'disabled' else status end
        end,
        updated_at = now()
    where id = channel_row.id;
  end loop;
end;
$$;

-- Backfill companies that already have email settings (repairs orphans + creates if needed).
do $$
declare
  company_row record;
begin
  for company_row in
    select company_id from public.company_email_settings
  loop
    perform public.sync_email_channel_references(company_row.company_id);
  end loop;
end;
$$;

revoke all on function public.sync_email_channel_references(uuid) from public;
revoke all on function public.sync_email_channel_references(uuid) from anon;
revoke all on function public.sync_email_channel_references(uuid) from authenticated;
grant execute on function public.sync_email_channel_references(uuid) to service_role;
