-- Unify WhatsApp Meta credentials under company_whatsapp_settings (canonical).
-- company_channels.configuration keeps routing references only (phoneNumberId), no secrets.

alter table public.company_whatsapp_settings
  add column if not exists api_version text not null default 'v21.0',
  add column if not exists app_secret_encrypted bytea,
  add column if not exists app_secret_hint text not null default '',
  add column if not exists webhook_verify_token_lookup_hash text not null default '';

create index if not exists idx_company_whatsapp_settings_phone_number_id
  on public.company_whatsapp_settings(phone_number_id)
  where phone_number_id <> '';

create index if not exists idx_company_whatsapp_settings_verify_token_hash
  on public.company_whatsapp_settings(webhook_verify_token_lookup_hash)
  where webhook_verify_token_lookup_hash <> '';

create or replace function public.whatsapp_settings_has_app_secret(settings_row public.company_whatsapp_settings)
returns boolean
language sql
immutable
as $$
  select settings_row.app_secret_encrypted is not null;
$$;

create or replace function public.whatsapp_verify_token_lookup_hash(p_plaintext text)
returns text
language sql
immutable
as $$
  select case
    when p_plaintext is null or length(trim(p_plaintext)) = 0 then ''
    else encode(digest(trim(p_plaintext), 'sha256'), 'hex')
  end;
$$;

create or replace function public.whatsapp_settings_row_to_public(settings_row public.company_whatsapp_settings)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'company_id', settings_row.company_id,
    'enabled', settings_row.enabled,
    'provider', settings_row.provider,
    'access_token', public.whatsapp_mask_secret(
      settings_row.access_token_hint,
      public.whatsapp_settings_has_access_token(settings_row)
    ),
    'phone_number_id', settings_row.phone_number_id,
    'business_account_id', settings_row.business_account_id,
    'webhook_verify_token', public.whatsapp_mask_secret(
      settings_row.webhook_verify_token_hint,
      public.whatsapp_settings_has_webhook_token(settings_row)
    ),
    'api_version', coalesce(nullif(trim(settings_row.api_version), ''), 'v21.0'),
    'app_secret', public.whatsapp_mask_secret(
      settings_row.app_secret_hint,
      public.whatsapp_settings_has_app_secret(settings_row)
    ),
    'default_language', settings_row.default_language,
    'max_retry_count', settings_row.max_retry_count,
    'has_access_token', public.whatsapp_settings_has_access_token(settings_row),
    'has_webhook_verify_token', public.whatsapp_settings_has_webhook_token(settings_row),
    'has_app_secret', public.whatsapp_settings_has_app_secret(settings_row),
    'updated_at', settings_row.updated_at
  );
$$;

create or replace function public.sync_whatsapp_channel_references(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.company_whatsapp_settings;
  channel_row record;
  next_configuration jsonb;
begin
  select * into settings_row
  from public.company_whatsapp_settings
  where company_id = p_company_id;

  for channel_row in
    select cc.id, cc.configuration
    from public.company_channels cc
    join public.communication_channels ch on ch.id = cc.channel_id
    where cc.company_id = p_company_id
      and cc.deleted_at is null
      and ch.key = 'whatsapp'
  loop
    next_configuration := coalesce(channel_row.configuration, '{}'::jsonb)
      - 'accessToken'
      - 'verifyToken'
      - 'appSecret'
      - 'businessAccountId';

    if settings_row.company_id is not null
      and nullif(trim(settings_row.phone_number_id), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{phoneNumberId}',
        to_jsonb(trim(settings_row.phone_number_id)),
        true
      );
    end if;

    next_configuration := jsonb_set(
      next_configuration,
      '{credentialsSource}',
      '"company_whatsapp_settings"'::jsonb,
      true
    );

    update public.company_channels
    set configuration = next_configuration,
        updated_at = now()
    where id = channel_row.id;
  end loop;
end;
$$;

-- Backfill settings from channel configuration when settings are missing secrets.
insert into public.company_whatsapp_settings (
  company_id,
  enabled,
  provider,
  access_token,
  phone_number_id,
  business_account_id,
  webhook_verify_token,
  default_language,
  max_retry_count,
  api_version,
  access_token_encrypted,
  webhook_verify_token_encrypted,
  app_secret_encrypted,
  access_token_hint,
  webhook_verify_token_hint,
  app_secret_hint,
  webhook_verify_token_lookup_hash,
  updated_at
)
select
  src.company_id,
  false,
  'meta_cloud',
  '',
  coalesce(nullif(trim(src.phone_number_id), ''), ''),
  coalesce(nullif(trim(src.business_account_id), ''), ''),
  '',
  'en',
  3,
  coalesce(nullif(trim(src.api_version), ''), 'v21.0'),
  public.whatsapp_encrypt_secret(nullif(trim(src.access_token), '')),
  public.whatsapp_encrypt_secret(nullif(trim(src.webhook_verify_token), '')),
  public.whatsapp_encrypt_secret(nullif(trim(src.app_secret), '')),
  public.whatsapp_secret_hint(src.access_token),
  public.whatsapp_secret_hint(src.webhook_verify_token),
  public.whatsapp_secret_hint(src.app_secret),
  public.whatsapp_verify_token_lookup_hash(src.webhook_verify_token),
  now()
from (
  select distinct on (cc.company_id)
    cc.company_id,
    cc.configuration->>'phoneNumberId' as phone_number_id,
    cc.configuration->>'accessToken' as access_token,
    cc.configuration->>'verifyToken' as webhook_verify_token,
    cc.configuration->>'appSecret' as app_secret,
    cc.configuration->>'apiVersion' as api_version,
    cc.configuration->>'businessAccountId' as business_account_id
  from public.company_channels cc
  join public.communication_channels ch on ch.id = cc.channel_id
  where ch.key = 'whatsapp'
    and cc.deleted_at is null
  order by cc.company_id, cc.updated_at desc
) src
where coalesce(src.access_token, '') <> ''
   or coalesce(src.webhook_verify_token, '') <> ''
   or coalesce(src.phone_number_id, '') <> ''
on conflict (company_id) do update set
  phone_number_id = case
    when coalesce(public.company_whatsapp_settings.phone_number_id, '') = ''
      and coalesce(excluded.phone_number_id, '') <> ''
      then excluded.phone_number_id
    else public.company_whatsapp_settings.phone_number_id
  end,
  business_account_id = case
    when coalesce(public.company_whatsapp_settings.business_account_id, '') = ''
      and coalesce(excluded.business_account_id, '') <> ''
      then excluded.business_account_id
    else public.company_whatsapp_settings.business_account_id
  end,
  api_version = case
    when coalesce(public.company_whatsapp_settings.api_version, 'v21.0') = 'v21.0'
      and coalesce(excluded.api_version, 'v21.0') <> 'v21.0'
      then excluded.api_version
    else public.company_whatsapp_settings.api_version
  end,
  access_token_encrypted = case
    when not public.whatsapp_settings_has_access_token(company_whatsapp_settings)
      and excluded.access_token_encrypted is not null
      then excluded.access_token_encrypted
    else public.company_whatsapp_settings.access_token_encrypted
  end,
  access_token_hint = case
    when not public.whatsapp_settings_has_access_token(company_whatsapp_settings)
      and excluded.access_token_hint <> ''
      then excluded.access_token_hint
    else public.company_whatsapp_settings.access_token_hint
  end,
  webhook_verify_token_encrypted = case
    when not public.whatsapp_settings_has_webhook_token(company_whatsapp_settings)
      and excluded.webhook_verify_token_encrypted is not null
      then excluded.webhook_verify_token_encrypted
    else public.company_whatsapp_settings.webhook_verify_token_encrypted
  end,
  webhook_verify_token_hint = case
    when not public.whatsapp_settings_has_webhook_token(company_whatsapp_settings)
      and excluded.webhook_verify_token_hint <> ''
      then excluded.webhook_verify_token_hint
    else public.company_whatsapp_settings.webhook_verify_token_hint
  end,
  webhook_verify_token_lookup_hash = case
    when coalesce(public.company_whatsapp_settings.webhook_verify_token_lookup_hash, '') = ''
      and excluded.webhook_verify_token_lookup_hash <> ''
      then excluded.webhook_verify_token_lookup_hash
    else public.company_whatsapp_settings.webhook_verify_token_lookup_hash
  end,
  app_secret_encrypted = case
    when not public.whatsapp_settings_has_app_secret(company_whatsapp_settings)
      and excluded.app_secret_encrypted is not null
      then excluded.app_secret_encrypted
    else public.company_whatsapp_settings.app_secret_encrypted
  end,
  app_secret_hint = case
    when not public.whatsapp_settings_has_app_secret(company_whatsapp_settings)
      and excluded.app_secret_hint <> ''
      then excluded.app_secret_hint
    else public.company_whatsapp_settings.app_secret_hint
  end,
  updated_at = now();

-- Strip duplicated secrets from all WhatsApp channel configurations.
update public.company_channels cc
set configuration = coalesce(cc.configuration, '{}'::jsonb)
  - 'accessToken'
  - 'verifyToken'
  - 'appSecret'
  - 'businessAccountId',
    updated_at = now()
from public.communication_channels ch
where ch.id = cc.channel_id
  and ch.key = 'whatsapp'
  and cc.deleted_at is null;

-- Sync routing references for every company with WhatsApp settings.
do $$
declare
  company_row record;
begin
  for company_row in
    select company_id from public.company_whatsapp_settings
  loop
    perform public.sync_whatsapp_channel_references(company_row.company_id);
  end loop;
end;
$$;

create or replace function public.get_company_whatsapp_settings(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_whatsapp_settings;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role'
    and not (public.is_super_admin() or p_company_id = public.current_company_id()) then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_whatsapp_settings where company_id = p_company_id;
  if not found then
    return jsonb_build_object(
      'company_id', p_company_id,
      'enabled', false,
      'provider', 'meta_cloud',
      'access_token', '',
      'phone_number_id', '',
      'business_account_id', '',
      'webhook_verify_token', '',
      'api_version', 'v21.0',
      'app_secret', '',
      'default_language', 'en',
      'max_retry_count', 3,
      'has_access_token', false,
      'has_webhook_verify_token', false,
      'has_app_secret', false
    );
  end if;

  return public.whatsapp_settings_row_to_public(row);
end;
$$;

create or replace function public.get_company_whatsapp_settings_decrypted(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_whatsapp_settings;
  v_access_token text;
  v_webhook_token text;
  v_app_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_whatsapp_settings where company_id = p_company_id;
  if not found then
    return null;
  end if;

  v_access_token := coalesce(row.access_token, '');
  if v_access_token = '' and row.access_token_encrypted is not null then
    v_access_token := public.whatsapp_decrypt_secret(row.access_token_encrypted);
  end if;

  v_webhook_token := coalesce(row.webhook_verify_token, '');
  if v_webhook_token = '' and row.webhook_verify_token_encrypted is not null then
    v_webhook_token := public.whatsapp_decrypt_secret(row.webhook_verify_token_encrypted);
  end if;

  v_app_secret := '';
  if row.app_secret_encrypted is not null then
    v_app_secret := public.whatsapp_decrypt_secret(row.app_secret_encrypted);
  end if;

  return jsonb_build_object(
    'company_id', row.company_id,
    'enabled', row.enabled,
    'provider', row.provider,
    'access_token', v_access_token,
    'phone_number_id', row.phone_number_id,
    'business_account_id', row.business_account_id,
    'webhook_verify_token', v_webhook_token,
    'api_version', coalesce(nullif(trim(row.api_version), ''), 'v21.0'),
    'app_secret', v_app_secret,
    'default_language', row.default_language,
    'max_retry_count', row.max_retry_count,
    'has_access_token', v_access_token <> '',
    'has_webhook_verify_token', v_webhook_token <> '',
    'has_app_secret', v_app_secret <> '',
    'updated_at', row.updated_at
  );
end;
$$;

drop function if exists public.upsert_company_whatsapp_settings(
  uuid, boolean, text, text, text, text, text, text, integer
);

create or replace function public.upsert_company_whatsapp_settings(
  p_company_id uuid,
  p_enabled boolean,
  p_provider text,
  p_access_token text,
  p_phone_number_id text,
  p_business_account_id text,
  p_webhook_verify_token text,
  p_default_language text,
  p_max_retry_count integer default 3,
  p_api_version text default 'v21.0',
  p_app_secret text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.company_whatsapp_settings;
  resolved_access_token text;
  resolved_verify_token text;
  resolved_app_secret text;
  resolved_access_encrypted bytea;
  resolved_verify_encrypted bytea;
  resolved_app_secret_encrypted bytea;
  resolved_access_hint text;
  resolved_verify_hint text;
  resolved_app_secret_hint text;
  resolved_verify_hash text;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role' and not public.whatsapp_settings_can_manage(p_company_id) then
    raise exception 'Forbidden';
  end if;

  if p_provider not in ('meta_cloud', 'twilio', '360dialog') then
    raise exception 'Invalid WhatsApp provider';
  end if;

  select * into existing from public.company_whatsapp_settings where company_id = p_company_id;

  resolved_access_token := coalesce(p_access_token, '');
  if public.whatsapp_is_unchanged_secret(resolved_access_token) and existing.company_id is not null then
    resolved_access_encrypted := existing.access_token_encrypted;
    resolved_access_hint := existing.access_token_hint;
    resolved_access_token := '__unchanged__';
  else
    resolved_access_encrypted := public.whatsapp_encrypt_secret(resolved_access_token);
    resolved_access_hint := public.whatsapp_secret_hint(resolved_access_token);
  end if;

  resolved_verify_token := coalesce(p_webhook_verify_token, '');
  if public.whatsapp_is_unchanged_secret(resolved_verify_token) and existing.company_id is not null then
    resolved_verify_encrypted := existing.webhook_verify_token_encrypted;
    resolved_verify_hint := existing.webhook_verify_token_hint;
    resolved_verify_hash := existing.webhook_verify_token_lookup_hash;
    resolved_verify_token := '__unchanged__';
  else
    resolved_verify_encrypted := public.whatsapp_encrypt_secret(resolved_verify_token);
    resolved_verify_hint := public.whatsapp_secret_hint(resolved_verify_token);
    resolved_verify_hash := public.whatsapp_verify_token_lookup_hash(resolved_verify_token);
  end if;

  resolved_app_secret := coalesce(p_app_secret, '');
  if public.whatsapp_is_unchanged_secret(resolved_app_secret) and existing.company_id is not null then
    resolved_app_secret_encrypted := existing.app_secret_encrypted;
    resolved_app_secret_hint := existing.app_secret_hint;
    resolved_app_secret := '__unchanged__';
  else
    resolved_app_secret_encrypted := public.whatsapp_encrypt_secret(resolved_app_secret);
    resolved_app_secret_hint := public.whatsapp_secret_hint(resolved_app_secret);
  end if;

  if p_enabled and p_provider = 'meta_cloud' then
    if nullif(trim(p_phone_number_id), '') is null then
      raise exception 'Phone Number ID is required when WhatsApp is enabled';
    end if;
    if existing.company_id is null and nullif(trim(resolved_access_token), '') is null then
      raise exception 'Access Token is required when WhatsApp is enabled';
    end if;
    if existing.company_id is not null
      and public.whatsapp_is_unchanged_secret(coalesce(p_access_token, ''))
      and not public.whatsapp_settings_has_access_token(existing) then
      raise exception 'Access Token is required when WhatsApp is enabled';
    end if;
    if existing.company_id is not null
      and not public.whatsapp_is_unchanged_secret(coalesce(p_access_token, ''))
      and nullif(trim(resolved_access_token), '') is null then
      raise exception 'Access Token is required when WhatsApp is enabled';
    end if;
  end if;

  insert into public.company_whatsapp_settings (
    company_id,
    enabled,
    provider,
    access_token,
    phone_number_id,
    business_account_id,
    webhook_verify_token,
    default_language,
    max_retry_count,
    api_version,
    access_token_encrypted,
    webhook_verify_token_encrypted,
    app_secret_encrypted,
    access_token_hint,
    webhook_verify_token_hint,
    app_secret_hint,
    webhook_verify_token_lookup_hash,
    updated_by,
    updated_at
  ) values (
    p_company_id,
    p_enabled,
    p_provider,
    '',
    coalesce(p_phone_number_id, ''),
    coalesce(p_business_account_id, ''),
    '',
    coalesce(p_default_language, 'en'),
    greatest(1, least(coalesce(p_max_retry_count, 3), 10)),
    coalesce(nullif(trim(p_api_version), ''), 'v21.0'),
    resolved_access_encrypted,
    resolved_verify_encrypted,
    resolved_app_secret_encrypted,
    resolved_access_hint,
    resolved_verify_hint,
    resolved_app_secret_hint,
    resolved_verify_hash,
    auth.uid(),
    now()
  )
  on conflict (company_id) do update set
    enabled = excluded.enabled,
    provider = excluded.provider,
    access_token = '',
    phone_number_id = excluded.phone_number_id,
    business_account_id = excluded.business_account_id,
    webhook_verify_token = '',
    default_language = excluded.default_language,
    max_retry_count = excluded.max_retry_count,
    api_version = excluded.api_version,
    access_token_encrypted = excluded.access_token_encrypted,
    webhook_verify_token_encrypted = excluded.webhook_verify_token_encrypted,
    app_secret_encrypted = excluded.app_secret_encrypted,
    access_token_hint = excluded.access_token_hint,
    webhook_verify_token_hint = excluded.webhook_verify_token_hint,
    app_secret_hint = excluded.app_secret_hint,
    webhook_verify_token_lookup_hash = excluded.webhook_verify_token_lookup_hash,
    updated_by = auth.uid(),
    updated_at = now();

  perform public.sync_whatsapp_channel_references(p_company_id);

  return public.get_company_whatsapp_settings(p_company_id);
end;
$$;

grant execute on function public.sync_whatsapp_channel_references(uuid) to service_role;
grant execute on function public.whatsapp_verify_token_lookup_hash(text) to authenticated, service_role;
grant execute on function public.upsert_company_whatsapp_settings(
  uuid, boolean, text, text, text, text, text, text, integer, text, text
) to authenticated, service_role;
