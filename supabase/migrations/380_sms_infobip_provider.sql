-- Phase: Infobip as second SMS provider (backward-compatible with Twilio).
-- Secrets stay in company_sms_settings; company_channels keeps non-secret refs only.

-- 1) Widen provider CHECK + Infobip columns
alter table public.company_sms_settings
  drop constraint if exists company_sms_settings_provider_check;

alter table public.company_sms_settings
  add constraint company_sms_settings_provider_check
  check (provider in ('', 'twilio', 'infobip'));

alter table public.company_sms_settings
  add column if not exists api_key_encrypted bytea,
  add column if not exists api_key_hint text not null default '',
  add column if not exists base_url text not null default '';

-- Existing enabled Twilio rows without provider stay as twilio for safety
update public.company_sms_settings
set provider = 'twilio'
where enabled = true
  and coalesce(nullif(trim(provider), ''), '') = '';

-- 2) Public / decrypted helpers
create or replace function public.sms_settings_has_api_key(settings_row public.company_sms_settings)
returns boolean
language sql
immutable
as $$
  select settings_row.api_key_encrypted is not null;
$$;

create or replace function public.sms_settings_row_to_public(settings_row public.company_sms_settings)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'company_id', settings_row.company_id,
    'enabled', settings_row.enabled,
    'provider', settings_row.provider,
    'account_sid', settings_row.account_sid,
    'from_number', settings_row.from_number,
    'auth_token', public.whatsapp_mask_secret(
      settings_row.auth_token_hint,
      public.sms_settings_has_auth_token(settings_row)
    ),
    'has_auth_token', public.sms_settings_has_auth_token(settings_row),
    'api_key', public.whatsapp_mask_secret(
      settings_row.api_key_hint,
      public.sms_settings_has_api_key(settings_row)
    ),
    'has_api_key', public.sms_settings_has_api_key(settings_row),
    'base_url', settings_row.base_url,
    'updated_at', settings_row.updated_at
  );
$$;

create or replace function public.get_company_sms_settings(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_sms_settings;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role'
    and not (public.is_super_admin() or p_company_id = public.current_company_id()) then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_sms_settings where company_id = p_company_id;
  if not found then
    return jsonb_build_object(
      'company_id', p_company_id,
      'enabled', false,
      'provider', '',
      'account_sid', '',
      'from_number', '',
      'auth_token', '',
      'has_auth_token', false,
      'api_key', '',
      'has_api_key', false,
      'base_url', ''
    );
  end if;

  return public.sms_settings_row_to_public(row);
end;
$$;

create or replace function public.get_company_sms_settings_decrypted(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_sms_settings;
  v_auth_token text;
  v_api_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_sms_settings where company_id = p_company_id;
  if not found then
    return null;
  end if;

  v_auth_token := '';
  if row.auth_token_encrypted is not null then
    v_auth_token := public.whatsapp_decrypt_secret(row.auth_token_encrypted);
  end if;

  v_api_key := '';
  if row.api_key_encrypted is not null then
    v_api_key := public.whatsapp_decrypt_secret(row.api_key_encrypted);
  end if;

  return jsonb_build_object(
    'company_id', row.company_id,
    'enabled', row.enabled,
    'provider', row.provider,
    'account_sid', row.account_sid,
    'from_number', row.from_number,
    'auth_token', v_auth_token,
    'has_auth_token', v_auth_token <> '',
    'api_key', v_api_key,
    'has_api_key', v_api_key <> '',
    'base_url', row.base_url,
    'updated_at', row.updated_at
  );
end;
$$;

-- 3) Upsert with Infobip fields (replace signature)
drop function if exists public.upsert_company_sms_settings(uuid, boolean, text, text, text, text);

create or replace function public.upsert_company_sms_settings(
  p_company_id uuid,
  p_enabled boolean,
  p_provider text,
  p_account_sid text,
  p_from_number text,
  p_auth_token text,
  p_api_key text default null,
  p_base_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.company_sms_settings;
  resolved_provider text;
  resolved_auth_token text;
  resolved_auth_encrypted bytea;
  resolved_auth_hint text;
  resolved_api_key text;
  resolved_api_encrypted bytea;
  resolved_api_hint text;
  resolved_base_url text;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role' and not public.whatsapp_settings_can_manage(p_company_id) then
    raise exception 'Forbidden';
  end if;

  resolved_provider := coalesce(nullif(trim(p_provider), ''), '');
  if resolved_provider not in ('', 'twilio', 'infobip') then
    raise exception 'Invalid SMS provider';
  end if;

  select * into existing from public.company_sms_settings where company_id = p_company_id;

  -- Twilio auth token
  resolved_auth_token := coalesce(p_auth_token, '');
  if public.whatsapp_is_unchanged_secret(resolved_auth_token) and existing.company_id is not null then
    resolved_auth_encrypted := existing.auth_token_encrypted;
    resolved_auth_hint := existing.auth_token_hint;
    resolved_auth_token := '__unchanged__';
  elsif nullif(trim(resolved_auth_token), '') is null then
    resolved_auth_encrypted := null;
    resolved_auth_hint := '';
  else
    resolved_auth_encrypted := public.whatsapp_encrypt_secret(resolved_auth_token);
    resolved_auth_hint := public.whatsapp_secret_hint(resolved_auth_token);
  end if;

  -- Infobip API key
  resolved_api_key := coalesce(p_api_key, '');
  if public.whatsapp_is_unchanged_secret(resolved_api_key) and existing.company_id is not null then
    resolved_api_encrypted := existing.api_key_encrypted;
    resolved_api_hint := existing.api_key_hint;
    resolved_api_key := '__unchanged__';
  elsif nullif(trim(resolved_api_key), '') is null then
    -- Keep existing when UI sends empty (masked field not retyped) for Infobip updates
    if existing.company_id is not null and resolved_provider = 'infobip' then
      resolved_api_encrypted := existing.api_key_encrypted;
      resolved_api_hint := existing.api_key_hint;
      resolved_api_key := '__unchanged__';
    else
      resolved_api_encrypted := null;
      resolved_api_hint := '';
    end if;
  else
    resolved_api_encrypted := public.whatsapp_encrypt_secret(resolved_api_key);
    resolved_api_hint := public.whatsapp_secret_hint(resolved_api_key);
  end if;

  resolved_base_url := coalesce(nullif(trim(p_base_url), ''), '');
  if resolved_base_url = '' and resolved_provider = 'infobip' then
    resolved_base_url := 'https://api.infobip.com';
  end if;
  -- Strip trailing slash
  resolved_base_url := rtrim(resolved_base_url, '/');

  if p_enabled then
    if resolved_provider = '' then
      raise exception 'SMS provider is required when SMS is enabled';
    end if;
    if nullif(trim(p_from_number), '') is null then
      raise exception 'SMS sender is required when SMS is enabled';
    end if;

    if resolved_provider = 'twilio' then
      if nullif(trim(p_account_sid), '') is null then
        raise exception 'SMS account identifier is required when SMS is enabled';
      end if;
      if existing.company_id is null and nullif(trim(resolved_auth_token), '') is null then
        raise exception 'SMS auth token is required when SMS is enabled';
      end if;
      if existing.company_id is not null
        and resolved_auth_token = '__unchanged__'
        and existing.auth_token_encrypted is null then
        raise exception 'SMS auth token is required when SMS is enabled';
      end if;
    elsif resolved_provider = 'infobip' then
      if existing.company_id is null and nullif(trim(resolved_api_key), '') is null then
        raise exception 'Infobip API key is required when SMS is enabled';
      end if;
      if existing.company_id is not null
        and resolved_api_key = '__unchanged__'
        and existing.api_key_encrypted is null then
        raise exception 'Infobip API key is required when SMS is enabled';
      end if;
      if nullif(trim(resolved_base_url), '') is null then
        raise exception 'Infobip base URL is required when SMS is enabled';
      end if;
    end if;
  end if;

  insert into public.company_sms_settings (
    company_id,
    enabled,
    provider,
    account_sid,
    from_number,
    auth_token_encrypted,
    auth_token_hint,
    api_key_encrypted,
    api_key_hint,
    base_url,
    updated_by,
    updated_at
  ) values (
    p_company_id,
    p_enabled,
    resolved_provider,
    coalesce(p_account_sid, ''),
    coalesce(p_from_number, ''),
    resolved_auth_encrypted,
    resolved_auth_hint,
    resolved_api_encrypted,
    resolved_api_hint,
    resolved_base_url,
    auth.uid(),
    now()
  )
  on conflict (company_id) do update set
    enabled = excluded.enabled,
    provider = excluded.provider,
    account_sid = excluded.account_sid,
    from_number = excluded.from_number,
    auth_token_encrypted = excluded.auth_token_encrypted,
    auth_token_hint = excluded.auth_token_hint,
    api_key_encrypted = excluded.api_key_encrypted,
    api_key_hint = excluded.api_key_hint,
    base_url = excluded.base_url,
    updated_by = auth.uid(),
    updated_at = now();

  perform public.sync_sms_channel_references(p_company_id);

  return public.get_company_sms_settings(p_company_id);
end;
$$;

grant execute on function public.upsert_company_sms_settings(
  uuid, boolean, text, text, text, text, text, text
) to authenticated, service_role;

-- 4) Sync non-secret Infobip refs into company_channels.configuration
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

    if nullif(trim(settings_row.base_url), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{baseUrl}',
        to_jsonb(trim(settings_row.base_url)),
        true
      );
    end if;

    insert into public.company_channels (
      company_id,
      channel_id,
      is_enabled,
      is_default,
      status,
      configuration
    ) values (
      p_company_id,
      sms_channel_type_id,
      settings_row.enabled,
      not has_company_default,
      case when settings_row.enabled then 'active' else 'inactive' end,
      next_configuration
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
      - 'apiKey'
      - 'accountSid'
      - 'fromNumber'
      - 'baseUrl';

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
    else
      next_configuration := jsonb_set(
        next_configuration,
        '{provider}',
        '"twilio"'::jsonb,
        true
      );
    end if;

    if nullif(trim(settings_row.base_url), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{baseUrl}',
        to_jsonb(trim(settings_row.base_url)),
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
        status = case when settings_row.enabled then 'active' else 'inactive' end,
        updated_at = now()
    where id = channel_row.id;
  end loop;
end;
$$;

revoke execute on function public.sync_sms_channel_references(uuid) from authenticated;
revoke execute on function public.sync_sms_channel_references(uuid) from anon;
revoke execute on function public.sync_sms_channel_references(uuid) from public;
grant execute on function public.sync_sms_channel_references(uuid) to service_role;
