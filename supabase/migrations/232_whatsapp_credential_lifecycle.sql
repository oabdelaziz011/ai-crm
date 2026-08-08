-- WhatsApp credential lifecycle: persisted token health for pre-send gating and Settings UI.

alter table public.company_whatsapp_settings
  add column if not exists token_status text not null default 'unknown',
  add column if not exists token_expires_at timestamptz,
  add column if not exists token_checked_at timestamptz,
  add column if not exists last_successful_send_at timestamptz,
  add column if not exists last_auth_error text,
  add column if not exists last_auth_error_at timestamptz,
  add column if not exists last_auth_error_code integer,
  add column if not exists last_credential_alert_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_whatsapp_settings_token_status_check'
      and conrelid = 'public.company_whatsapp_settings'::regclass
  ) then
    alter table public.company_whatsapp_settings
      add constraint company_whatsapp_settings_token_status_check
      check (token_status in ('valid', 'expired', 'invalid', 'unknown', 'missing'));
  end if;
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

create or replace function public.record_company_whatsapp_credential_health(
  p_company_id uuid,
  p_token_status text default null,
  p_token_expires_at timestamptz default null,
  p_clear_token_expires_at boolean default false,
  p_token_checked_at timestamptz default null,
  p_last_successful_send_at timestamptz default null,
  p_last_auth_error text default null,
  p_clear_last_auth_error boolean default false,
  p_last_auth_error_at timestamptz default null,
  p_last_auth_error_code integer default null,
  p_clear_last_auth_error_code boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  if p_token_status is not null
    and p_token_status not in ('valid', 'expired', 'invalid', 'unknown', 'missing') then
    raise exception 'Invalid token_status';
  end if;

  update public.company_whatsapp_settings
  set
    token_status = coalesce(p_token_status, token_status),
    token_expires_at = case
      when p_clear_token_expires_at then null
      when p_token_expires_at is not null then p_token_expires_at
      else token_expires_at
    end,
    token_checked_at = coalesce(p_token_checked_at, token_checked_at),
    last_successful_send_at = coalesce(p_last_successful_send_at, last_successful_send_at),
    last_auth_error = case
      when p_clear_last_auth_error then null
      when p_last_auth_error is not null then p_last_auth_error
      else last_auth_error
    end,
    last_auth_error_at = case
      when p_clear_last_auth_error then null
      when p_last_auth_error_at is not null then p_last_auth_error_at
      else last_auth_error_at
    end,
    last_auth_error_code = case
      when p_clear_last_auth_error_code or p_clear_last_auth_error then null
      when p_last_auth_error_code is not null then p_last_auth_error_code
      else last_auth_error_code
    end,
    updated_at = now()
  where company_id = p_company_id;
end;
$$;

grant execute on function public.record_company_whatsapp_credential_health(
  uuid, text, timestamptz, boolean, timestamptz, timestamptz, text, boolean, timestamptz, integer, boolean
) to service_role;

-- Notify company admins / settings editors about credential failures (throttled by caller).
create or replace function public.notify_company_whatsapp_credential_admins(
  p_company_id uuid,
  p_title text,
  p_message text,
  p_min_interval_seconds integer default 3600
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.company_whatsapp_settings;
  recipient record;
  notified integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  select * into settings_row
  from public.company_whatsapp_settings
  where company_id = p_company_id;

  if settings_row.company_id is null then
    return 0;
  end if;

  if settings_row.last_credential_alert_at is not null
    and settings_row.last_credential_alert_at > now() - make_interval(secs => greatest(p_min_interval_seconds, 60)) then
    return 0;
  end if;

  for recipient in
    select distinct ur.user_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    join public.profiles pr on pr.id = ur.user_id
    where pr.company_id = p_company_id
      and p.code = public.resolve_permission_code('settings.edit')
  loop
    insert into public.notifications (
      company_id,
      user_id,
      title,
      message,
      type,
      category,
      is_read,
      priority,
      event_type,
      channel,
      delivery_status
    ) values (
      p_company_id,
      recipient.user_id,
      p_title,
      jsonb_build_object(
        'messageKey', 'notifications.platform.templates.genericSystem.message',
        'params', jsonb_build_object('detail', p_message)
      )::text,
      'error',
      'whatsapp',
      false,
      'high',
      'generic_system',
      'in_app',
      'delivered'
    );
    notified := notified + 1;
  end loop;

  if notified > 0 then
    update public.company_whatsapp_settings
    set last_credential_alert_at = now(),
        updated_at = now()
    where company_id = p_company_id;
  end if;

  return notified;
end;
$$;

grant execute on function public.notify_company_whatsapp_credential_admins(uuid, text, text, integer)
  to service_role;

-- When access token changes, reset credential health (keep last successful send).
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

grant execute on function public.upsert_company_whatsapp_settings(
  uuid, boolean, text, text, text, text, text, text, integer, text, text
) to authenticated, service_role;
