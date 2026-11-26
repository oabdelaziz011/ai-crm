-- Soft-clear / disconnect / transfer must never write NULL into NOT NULL text columns:
--   access_token_hint, webhook_verify_token_hint, webhook_verify_token_lookup_hash, app_secret_hint
-- Encrypted bytea columns may remain null.

create or replace function public.disconnect_company_whatsapp_connection(
  p_company_id uuid,
  p_confirm_phone_number_id text default null,
  p_confirm_text text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  existing public.company_whatsapp_settings%rowtype;
  v_phone text;
  v_waba text;
  v_event_id uuid;
  v_actor uuid := coalesce(p_actor_user_id, public.whatsapp_lifecycle_actor_id());
begin
  if p_company_id is null then
    raise exception 'company_id required' using errcode = '22023';
  end if;

  if auth.role() <> 'service_role' and not public.whatsapp_settings_can_manage(p_company_id) then
    perform internal.whatsapp_lifecycle_write_event(
      'disconnect', 'rejected', p_company_id, null, null, null,
      'forbidden', 'Caller cannot manage WhatsApp settings for this company', '{}'::jsonb,
      v_actor
    );
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if lower(trim(coalesce(p_confirm_text, ''))) not in ('disconnect', 'فصل') then
    perform internal.whatsapp_lifecycle_write_event(
      'disconnect', 'rejected', p_company_id, null, null, null,
      'confirmation_required', 'Confirmation text mismatch', '{}'::jsonb,
      v_actor
    );
    raise exception 'confirmation_required' using errcode = '22023';
  end if;

  select * into existing
  from public.company_whatsapp_settings
  where company_id = p_company_id
  for update;

  if not found then
    perform internal.whatsapp_lifecycle_write_event(
      'disconnect', 'rejected', p_company_id, null, null, null,
      'not_found', 'No WhatsApp settings row for company', '{}'::jsonb,
      v_actor
    );
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_phone := nullif(trim(coalesce(existing.phone_number_id, '')), '');
  v_waba := nullif(trim(coalesce(existing.business_account_id, '')), '');

  if nullif(trim(coalesce(p_confirm_phone_number_id, '')), '') is not null
     and v_phone is not null
     and trim(p_confirm_phone_number_id) <> v_phone then
    perform internal.whatsapp_lifecycle_write_event(
      'disconnect', 'rejected', p_company_id, null, v_phone, v_waba,
      'phone_mismatch', 'Confirmed phone_number_id does not match current binding', '{}'::jsonb,
      v_actor
    );
    raise exception 'phone_mismatch' using errcode = '22023';
  end if;

  update public.company_whatsapp_settings
  set
    enabled = false,
    phone_number_id = '',
    business_account_id = '',
    access_token = '',
    access_token_encrypted = null,
    access_token_hint = '',
    webhook_verify_token = '',
    webhook_verify_token_encrypted = null,
    webhook_verify_token_hint = '',
    webhook_verify_token_lookup_hash = '',
    app_secret_encrypted = null,
    app_secret_hint = '',
    token_status = 'missing',
    token_expires_at = null,
    token_checked_at = null,
    last_auth_error = null,
    last_auth_error_at = null,
    last_auth_error_code = null,
    updated_at = timezone('utc', now())
  where company_id = p_company_id;

  begin
    perform public.sync_whatsapp_channel_references(p_company_id);
  exception
    when others then
      null; -- channel sync best-effort; disconnect still succeeds
  end;

  v_event_id := internal.whatsapp_lifecycle_write_event(
    'disconnect', 'succeeded', p_company_id, null, v_phone, v_waba,
    null, null,
    jsonb_build_object(
      'cleared_credentials', true,
      'meta_graph_calls', 'none',
      'note', 'ValueOR binding cleared only; Meta phone/WABA unchanged'
    ),
    v_actor
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'disconnect',
    'company_id', p_company_id,
    'phone_number_id', v_phone,
    'business_account_id', v_waba,
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.disconnect_company_whatsapp_connection(uuid, text, text, uuid) from public;
grant execute on function public.disconnect_company_whatsapp_connection(uuid, text, text, uuid)
  to authenticated, service_role;

create or replace function public.transfer_company_whatsapp_connection(
  p_from_company_id uuid,
  p_to_company_id uuid,
  p_confirm_phone_number_id text,
  p_confirm_text text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  src public.company_whatsapp_settings%rowtype;
  dst public.company_whatsapp_settings%rowtype;
  v_phone text;
  v_waba text;
  v_event_id uuid;
  v_conflict_company uuid;
  v_actor uuid := coalesce(p_actor_user_id, public.whatsapp_lifecycle_actor_id());
  v_provider text;
  v_default_language text;
  v_max_retry integer;
  v_api_version text;
  v_access_token_encrypted bytea;
  v_access_token_hint text;
  v_webhook_verify_token_encrypted bytea;
  v_webhook_verify_token_hint text;
  v_webhook_verify_token_lookup_hash text;
  v_app_secret_encrypted bytea;
  v_app_secret_hint text;
  v_token_status text;
begin
  if p_from_company_id is null or p_to_company_id is null then
    raise exception 'from_company_id and to_company_id required' using errcode = '22023';
  end if;
  if p_from_company_id = p_to_company_id then
    raise exception 'same_company' using errcode = '22023';
  end if;

  if auth.role() <> 'service_role'
     and not public.whatsapp_lifecycle_can_transfer(p_from_company_id, p_to_company_id) then
    perform internal.whatsapp_lifecycle_write_event(
      'transfer', 'rejected', p_from_company_id, p_to_company_id, null, null,
      'forbidden', 'Caller cannot transfer WhatsApp between these companies', '{}'::jsonb,
      v_actor
    );
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if lower(trim(coalesce(p_confirm_text, ''))) not in ('transfer', 'نقل') then
    perform internal.whatsapp_lifecycle_write_event(
      'transfer', 'rejected', p_from_company_id, p_to_company_id, null, null,
      'confirmation_required', 'Confirmation text mismatch', '{}'::jsonb,
      v_actor
    );
    raise exception 'confirmation_required' using errcode = '22023';
  end if;

  if p_from_company_id < p_to_company_id then
    select * into src from public.company_whatsapp_settings where company_id = p_from_company_id for update;
    select * into dst from public.company_whatsapp_settings where company_id = p_to_company_id for update;
  else
    select * into dst from public.company_whatsapp_settings where company_id = p_to_company_id for update;
    select * into src from public.company_whatsapp_settings where company_id = p_from_company_id for update;
  end if;

  if src.company_id is null then
    perform internal.whatsapp_lifecycle_write_event(
      'transfer', 'rejected', p_from_company_id, p_to_company_id, null, null,
      'not_found', 'Source company has no WhatsApp settings', '{}'::jsonb,
      v_actor
    );
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_phone := nullif(trim(coalesce(src.phone_number_id, '')), '');
  v_waba := nullif(trim(coalesce(src.business_account_id, '')), '');

  if v_phone is null then
    perform internal.whatsapp_lifecycle_write_event(
      'transfer', 'rejected', p_from_company_id, p_to_company_id, null, v_waba,
      'no_phone_binding', 'Source company has no phone_number_id to transfer', '{}'::jsonb,
      v_actor
    );
    raise exception 'no_phone_binding' using errcode = 'P0002';
  end if;

  if trim(coalesce(p_confirm_phone_number_id, '')) <> v_phone then
    perform internal.whatsapp_lifecycle_write_event(
      'transfer', 'rejected', p_from_company_id, p_to_company_id, v_phone, v_waba,
      'phone_mismatch', 'Confirmed phone_number_id does not match source binding', '{}'::jsonb,
      v_actor
    );
    raise exception 'phone_mismatch' using errcode = '22023';
  end if;

  if not public.whatsapp_settings_has_access_token(src) then
    perform internal.whatsapp_lifecycle_write_event(
      'transfer', 'rejected', p_from_company_id, p_to_company_id, v_phone, v_waba,
      'missing_credentials', 'Source has no access token to transfer', '{}'::jsonb,
      v_actor
    );
    raise exception 'missing_credentials' using errcode = 'P0002';
  end if;

  select company_id into v_conflict_company
  from public.company_whatsapp_settings
  where company_id <> p_from_company_id
    and nullif(trim(phone_number_id), '') = v_phone
  limit 1;

  if v_conflict_company is not null and v_conflict_company <> p_to_company_id then
    perform internal.whatsapp_lifecycle_write_event(
      'transfer', 'rejected', p_from_company_id, p_to_company_id, v_phone, v_waba,
      'phone_in_use', format('Phone already bound to company %s', v_conflict_company),
      jsonb_build_object('conflict_company_id', v_conflict_company),
      v_actor
    );
    raise exception 'phone_in_use' using errcode = '23505';
  end if;

  if dst.company_id is not null
     and nullif(trim(coalesce(dst.phone_number_id, '')), '') is not null
     and nullif(trim(dst.phone_number_id), '') <> v_phone
     and dst.enabled then
    perform internal.whatsapp_lifecycle_write_event(
      'transfer', 'rejected', p_from_company_id, p_to_company_id, v_phone, v_waba,
      'target_has_active_connection', 'Target company already has a different active WhatsApp phone',
      jsonb_build_object('target_phone_number_id', dst.phone_number_id),
      v_actor
    );
    raise exception 'target_has_active_connection' using errcode = '23505';
  end if;

  v_provider := coalesce(nullif(trim(src.provider), ''), 'meta_cloud');
  v_default_language := coalesce(nullif(trim(src.default_language), ''), 'en');
  v_max_retry := coalesce(src.max_retry_count, 3);
  v_api_version := coalesce(nullif(trim(src.api_version), ''), 'v21.0');
  v_access_token_encrypted := src.access_token_encrypted;
  v_access_token_hint := coalesce(src.access_token_hint, '');
  v_webhook_verify_token_encrypted := src.webhook_verify_token_encrypted;
  v_webhook_verify_token_hint := coalesce(src.webhook_verify_token_hint, '');
  v_webhook_verify_token_lookup_hash := coalesce(src.webhook_verify_token_lookup_hash, '');
  v_app_secret_encrypted := src.app_secret_encrypted;
  v_app_secret_hint := coalesce(src.app_secret_hint, '');
  v_token_status := coalesce(src.token_status, 'unknown');

  update public.company_whatsapp_settings
  set
    enabled = false,
    phone_number_id = '',
    business_account_id = '',
    access_token = '',
    access_token_encrypted = null,
    access_token_hint = '',
    webhook_verify_token = '',
    webhook_verify_token_encrypted = null,
    webhook_verify_token_hint = '',
    webhook_verify_token_lookup_hash = '',
    app_secret_encrypted = null,
    app_secret_hint = '',
    token_status = 'missing',
    token_expires_at = null,
    token_checked_at = null,
    last_auth_error = null,
    last_auth_error_at = null,
    last_auth_error_code = null,
    updated_at = timezone('utc', now())
  where company_id = p_from_company_id;

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
    access_token_hint,
    webhook_verify_token_encrypted,
    webhook_verify_token_hint,
    webhook_verify_token_lookup_hash,
    app_secret_encrypted,
    app_secret_hint,
    token_status,
    updated_at
  ) values (
    p_to_company_id,
    true,
    v_provider,
    '',
    v_phone,
    coalesce(v_waba, ''),
    '',
    v_default_language,
    v_max_retry,
    v_api_version,
    v_access_token_encrypted,
    v_access_token_hint,
    v_webhook_verify_token_encrypted,
    v_webhook_verify_token_hint,
    v_webhook_verify_token_lookup_hash,
    v_app_secret_encrypted,
    v_app_secret_hint,
    v_token_status,
    timezone('utc', now())
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
    access_token_hint = excluded.access_token_hint,
    webhook_verify_token_encrypted = excluded.webhook_verify_token_encrypted,
    webhook_verify_token_hint = excluded.webhook_verify_token_hint,
    webhook_verify_token_lookup_hash = excluded.webhook_verify_token_lookup_hash,
    app_secret_encrypted = excluded.app_secret_encrypted,
    app_secret_hint = excluded.app_secret_hint,
    token_status = excluded.token_status,
    updated_at = timezone('utc', now());

  begin
    perform public.sync_whatsapp_channel_references(p_from_company_id);
    perform public.sync_whatsapp_channel_references(p_to_company_id);
  exception
    when others then
      null;
  end;

  v_event_id := internal.whatsapp_lifecycle_write_event(
    'transfer', 'succeeded', p_from_company_id, p_to_company_id, v_phone, v_waba,
    null, null,
    jsonb_build_object(
      'moved_encrypted_credentials', true,
      'meta_graph_calls', 'none',
      'note', 'ValueOR tenant binding moved; Meta WABA/phone ownership unchanged'
    ),
    v_actor
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'transfer',
    'from_company_id', p_from_company_id,
    'to_company_id', p_to_company_id,
    'phone_number_id', v_phone,
    'business_account_id', v_waba,
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.transfer_company_whatsapp_connection(uuid, uuid, text, text, uuid) from public;
grant execute on function public.transfer_company_whatsapp_connection(uuid, uuid, text, text, uuid)
  to authenticated, service_role;
