-- Ensure Messenger / Instagram settings save creates a company_channels row when missing.
-- Mirror 376_sync_whatsapp_channel_create_if_missing.sql (and 377/378 SMS/Email).
--
-- Bare GET /api/webhooks/messenger and /api/webhooks/instagram verification resolves by
-- verify-token → settings company → channel catalog key (exactly one). Sync previously
-- only updated existing channels and never created one, so settings-only tenants got 403
-- from Meta during webhook subscription.
--
-- Does NOT invent Page IDs / IG business account IDs: configuration only copies values
-- already stored on company_*_settings. Newly created channels use status/is_enabled from
-- settings.enabled (default false) — never fabricated "connected" credentials.

create or replace function public.sync_messenger_channel_references(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.company_messenger_settings;
  channel_row record;
  next_configuration jsonb;
  messenger_channel_type_id uuid;
  existing_count integer;
  has_company_default boolean;
begin
  select * into settings_row
  from public.company_messenger_settings
  where company_id = p_company_id;

  if settings_row.company_id is null then
    return;
  end if;

  select count(*)::int into existing_count
  from public.company_channels cc
  join public.communication_channels ch on ch.id = cc.channel_id
  where cc.company_id = p_company_id
    and cc.deleted_at is null
    and ch.key = 'messenger';

  if existing_count = 0 then
    select id into messenger_channel_type_id
    from public.communication_channels
    where key = 'messenger'
    limit 1;

    if messenger_channel_type_id is null then
      raise exception 'Messenger communication channel catalog row is missing';
    end if;

    select exists (
      select 1
      from public.company_channels cc
      where cc.company_id = p_company_id
        and cc.deleted_at is null
        and cc.is_default = true
    ) into has_company_default;

    next_configuration := jsonb_build_object(
      'credentialsSource', 'company_messenger_settings'
    );

    if nullif(trim(settings_row.page_id), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{pageId}',
        to_jsonb(trim(settings_row.page_id)),
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
      messenger_channel_type_id,
      'Messenger',
      case when settings_row.enabled then 'active' else 'pending' end,
      coalesce(nullif(trim(settings_row.provider), ''), 'meta_messenger'),
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
      and ch.key = 'messenger'
  loop
    next_configuration := coalesce(channel_row.configuration, '{}'::jsonb)
      - 'accessToken'
      - 'verifyToken'
      - 'appSecret';

    if nullif(trim(settings_row.page_id), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{pageId}',
        to_jsonb(trim(settings_row.page_id)),
        true
      );
    else
      next_configuration := next_configuration - 'pageId';
    end if;

    next_configuration := jsonb_set(
      next_configuration,
      '{credentialsSource}',
      '"company_messenger_settings"'::jsonb,
      true
    );

    update public.company_channels
    set configuration = next_configuration,
        is_enabled = settings_row.enabled,
        status = case
          when settings_row.enabled then 'active'
          else case when status = 'active' then 'disabled' else status end
        end,
        provider = coalesce(nullif(trim(settings_row.provider), ''), provider, 'meta_messenger'),
        updated_at = now()
    where id = channel_row.id;
  end loop;
end;
$$;

create or replace function public.sync_instagram_channel_references(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.company_instagram_settings;
  channel_row record;
  next_configuration jsonb;
  instagram_channel_type_id uuid;
  existing_count integer;
  has_company_default boolean;
begin
  select * into settings_row
  from public.company_instagram_settings
  where company_id = p_company_id;

  if settings_row.company_id is null then
    return;
  end if;

  select count(*)::int into existing_count
  from public.company_channels cc
  join public.communication_channels ch on ch.id = cc.channel_id
  where cc.company_id = p_company_id
    and cc.deleted_at is null
    and ch.key = 'instagram';

  if existing_count = 0 then
    select id into instagram_channel_type_id
    from public.communication_channels
    where key = 'instagram'
    limit 1;

    if instagram_channel_type_id is null then
      raise exception 'Instagram communication channel catalog row is missing';
    end if;

    select exists (
      select 1
      from public.company_channels cc
      where cc.company_id = p_company_id
        and cc.deleted_at is null
        and cc.is_default = true
    ) into has_company_default;

    next_configuration := jsonb_build_object(
      'credentialsSource', 'company_instagram_settings'
    );

    if nullif(trim(settings_row.instagram_business_account_id), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{instagramBusinessAccountId}',
        to_jsonb(trim(settings_row.instagram_business_account_id)),
        true
      );
    end if;

    if nullif(trim(settings_row.page_id), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{pageId}',
        to_jsonb(trim(settings_row.page_id)),
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
      instagram_channel_type_id,
      'Instagram',
      case when settings_row.enabled then 'active' else 'pending' end,
      coalesce(nullif(trim(settings_row.provider), ''), 'meta_instagram'),
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
      and ch.key = 'instagram'
  loop
    next_configuration := coalesce(channel_row.configuration, '{}'::jsonb)
      - 'accessToken'
      - 'verifyToken'
      - 'appSecret';

    if nullif(trim(settings_row.instagram_business_account_id), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{instagramBusinessAccountId}',
        to_jsonb(trim(settings_row.instagram_business_account_id)),
        true
      );
    else
      next_configuration := next_configuration - 'instagramBusinessAccountId';
    end if;

    if nullif(trim(settings_row.page_id), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{pageId}',
        to_jsonb(trim(settings_row.page_id)),
        true
      );
    else
      next_configuration := next_configuration - 'pageId';
    end if;

    next_configuration := jsonb_set(
      next_configuration,
      '{credentialsSource}',
      '"company_instagram_settings"'::jsonb,
      true
    );

    update public.company_channels
    set configuration = next_configuration,
        is_enabled = settings_row.enabled,
        status = case
          when settings_row.enabled then 'active'
          else case when status = 'active' then 'disabled' else status end
        end,
        provider = coalesce(nullif(trim(settings_row.provider), ''), provider, 'meta_instagram'),
        updated_at = now()
    where id = channel_row.id;
  end loop;
end;
$$;

-- Backfill companies that already have settings but no matching company_channels row.
-- Safe: only inserts catalog-linked rows using existing settings fields; no secret copies.
do $$
declare
  company_row record;
begin
  for company_row in
    select company_id from public.company_messenger_settings
  loop
    perform public.sync_messenger_channel_references(company_row.company_id);
  end loop;

  for company_row in
    select company_id from public.company_instagram_settings
  loop
    perform public.sync_instagram_channel_references(company_row.company_id);
  end loop;
end;
$$;

revoke all on function public.sync_messenger_channel_references(uuid) from public;
revoke all on function public.sync_messenger_channel_references(uuid) from anon;
revoke all on function public.sync_messenger_channel_references(uuid) from authenticated;
grant execute on function public.sync_messenger_channel_references(uuid) to service_role;

revoke all on function public.sync_instagram_channel_references(uuid) from public;
revoke all on function public.sync_instagram_channel_references(uuid) from anon;
revoke all on function public.sync_instagram_channel_references(uuid) from authenticated;
grant execute on function public.sync_instagram_channel_references(uuid) to service_role;
