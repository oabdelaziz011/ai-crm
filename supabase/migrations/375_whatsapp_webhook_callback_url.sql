-- Persist Meta WhatsApp webhook callback URL per company (editable in Settings UI).
-- Does not change encryption model for access token / verify token / app secret.

alter table public.company_whatsapp_settings
  add column if not exists webhook_callback_url text not null default '';

create or replace function public.whatsapp_settings_row_to_public(settings_row public.company_whatsapp_settings)
returns jsonb
language sql
stable
set search_path to public
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
    'webhook_callback_url', coalesce(settings_row.webhook_callback_url, ''),
    'default_language', settings_row.default_language,
    'max_retry_count', settings_row.max_retry_count,
    'has_access_token', public.whatsapp_settings_has_access_token(settings_row),
    'has_webhook_verify_token', public.whatsapp_settings_has_webhook_token(settings_row),
    'has_app_secret', public.whatsapp_settings_has_app_secret(settings_row),
    'token_status', settings_row.token_status,
    'token_expires_at', settings_row.token_expires_at,
    'token_checked_at', settings_row.token_checked_at,
    'last_successful_send_at', settings_row.last_successful_send_at,
    'last_auth_error', settings_row.last_auth_error,
    'last_auth_error_at', settings_row.last_auth_error_at,
    'last_auth_error_code', settings_row.last_auth_error_code,
    'updated_at', settings_row.updated_at
  );
$$;

-- Recreate upsert with optional callback URL (default keeps older callers working).
drop function if exists public.upsert_company_whatsapp_settings(
  uuid, boolean, text, text, text, text, text, text, integer, text, text
);
drop function if exists internal.upsert_company_whatsapp_settings(
  uuid, boolean, text, text, text, text, text, text, integer, text, text
);

create or replace function internal.upsert_company_whatsapp_settings(
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
  p_app_secret text default '',
  p_webhook_callback_url text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to internal, public
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
  resolved_callback_url text;
  token_changed boolean := false;
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

  resolved_callback_url := nullif(trim(coalesce(p_webhook_callback_url, '')), '');
  if resolved_callback_url is null then
    -- Keep existing URL when callers omit/blank the new param (backward compatible).
    resolved_callback_url := coalesce(existing.webhook_callback_url, '');
  elsif resolved_callback_url !~* '^https?://' then
    raise exception 'Webhook callback URL must start with http:// or https://';
  end if;

  resolved_access_token := coalesce(p_access_token, '');
  if public.whatsapp_is_unchanged_secret(resolved_access_token) and existing.company_id is not null then
    resolved_access_encrypted := existing.access_token_encrypted;
    resolved_access_hint := existing.access_token_hint;
    resolved_access_token := '__unchanged__';
    token_changed := false;
  else
    resolved_access_encrypted := public.whatsapp_encrypt_secret(resolved_access_token);
    resolved_access_hint := public.whatsapp_secret_hint(resolved_access_token);
    token_changed := true;
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
    webhook_callback_url,
    access_token_encrypted,
    webhook_verify_token_encrypted,
    app_secret_encrypted,
    access_token_hint,
    webhook_verify_token_hint,
    app_secret_hint,
    webhook_verify_token_lookup_hash,
    token_status,
    token_expires_at,
    token_checked_at,
    last_auth_error,
    last_auth_error_at,
    last_auth_error_code,
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
    resolved_callback_url,
    resolved_access_encrypted,
    resolved_verify_encrypted,
    resolved_app_secret_encrypted,
    resolved_access_hint,
    resolved_verify_hint,
    resolved_app_secret_hint,
    resolved_verify_hash,
    case when token_changed then 'unknown' else 'unknown' end,
    null,
    null,
    null,
    null,
    null,
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
    webhook_callback_url = excluded.webhook_callback_url,
    access_token_encrypted = excluded.access_token_encrypted,
    webhook_verify_token_encrypted = excluded.webhook_verify_token_encrypted,
    app_secret_encrypted = excluded.app_secret_encrypted,
    access_token_hint = excluded.access_token_hint,
    webhook_verify_token_hint = excluded.webhook_verify_token_hint,
    app_secret_hint = excluded.app_secret_hint,
    webhook_verify_token_lookup_hash = excluded.webhook_verify_token_lookup_hash,
    token_status = case when token_changed then 'unknown' else public.company_whatsapp_settings.token_status end,
    token_expires_at = case when token_changed then null else public.company_whatsapp_settings.token_expires_at end,
    token_checked_at = case when token_changed then null else public.company_whatsapp_settings.token_checked_at end,
    last_auth_error = case when token_changed then null else public.company_whatsapp_settings.last_auth_error end,
    last_auth_error_at = case when token_changed then null else public.company_whatsapp_settings.last_auth_error_at end,
    last_auth_error_code = case when token_changed then null else public.company_whatsapp_settings.last_auth_error_code end,
    last_credential_alert_at = case when token_changed then null else public.company_whatsapp_settings.last_credential_alert_at end,
    updated_by = auth.uid(),
    updated_at = now();

  perform public.sync_whatsapp_channel_references(p_company_id);

  return public.get_company_whatsapp_settings(p_company_id);
end;
$$;

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
  p_app_secret text default '',
  p_webhook_callback_url text default ''
)
returns jsonb
language sql
set search_path to public, internal
as $$
  select internal.upsert_company_whatsapp_settings(
    p_company_id,
    p_enabled,
    p_provider,
    p_access_token,
    p_phone_number_id,
    p_business_account_id,
    p_webhook_verify_token,
    p_default_language,
    p_max_retry_count,
    p_api_version,
    p_app_secret,
    p_webhook_callback_url
  );
$$;

revoke all on function public.upsert_company_whatsapp_settings(
  uuid, boolean, text, text, text, text, text, text, integer, text, text, text
) from public;
revoke all on function internal.upsert_company_whatsapp_settings(
  uuid, boolean, text, text, text, text, text, text, integer, text, text, text
) from public;
grant execute on function public.upsert_company_whatsapp_settings(
  uuid, boolean, text, text, text, text, text, text, integer, text, text, text
) to authenticated, service_role;
grant execute on function internal.upsert_company_whatsapp_settings(
  uuid, boolean, text, text, text, text, text, text, integer, text, text, text
) to authenticated, service_role;
