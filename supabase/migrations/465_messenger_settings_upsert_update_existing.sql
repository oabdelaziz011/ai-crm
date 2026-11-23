-- Messenger settings save: update existing company row instead of INSERT…ON CONFLICT.
--
-- Root cause: INSERT with ON CONFLICT (company_id) still evaluates other unique indexes
-- on the proposed insert row. When page_id is already owned by a *different* company,
-- PostgreSQL raises uq_company_messenger_settings_page_id and never reaches DO UPDATE —
-- so the company's existing row (tokens included) is not updated for that attempt.
--
-- Fix: UPDATE when company_id exists; INSERT only when missing. Pre-check cross-tenant
-- page_id ownership and raise a clear exception. Preserve encrypted secrets via the
-- existing unchanged-secret path. Do not touch OAuth/connection_status columns.
-- Keeps uq_company_messenger_settings_page_id (required for Meta page → company routing).

create or replace function internal.upsert_company_messenger_settings(
  p_company_id uuid,
  p_enabled boolean,
  p_provider text,
  p_page_id text,
  p_access_token text,
  p_webhook_verify_token text,
  p_api_version text default 'v21.0',
  p_app_secret text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to internal, public
as $$
declare
  existing public.company_messenger_settings;
  resolved_page_id text;
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
  page_owner uuid;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role' and not public.whatsapp_settings_can_manage(p_company_id) then
    raise exception 'Forbidden';
  end if;

  if p_provider not in ('meta_messenger') then
    raise exception 'Invalid Messenger provider';
  end if;

  select * into existing from public.company_messenger_settings where company_id = p_company_id;

  resolved_page_id := coalesce(p_page_id, '');

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

  if p_enabled and p_provider = 'meta_messenger' then
    if nullif(trim(resolved_page_id), '') is null then
      raise exception 'Messenger Page ID is required when Messenger is enabled';
    end if;
    if existing.company_id is null and nullif(trim(resolved_access_token), '') is null then
      raise exception 'Access Token is required when Messenger is enabled';
    end if;
  end if;

  -- Global unique page_id (non-empty) maps Meta webhooks to one company.
  if nullif(trim(resolved_page_id), '') is not null then
    select s.company_id into page_owner
    from public.company_messenger_settings s
    where s.page_id = resolved_page_id
      and s.page_id <> ''
      and s.company_id is distinct from p_company_id
    limit 1;

    if page_owner is not null then
      raise exception 'Messenger Page ID is already linked to another company';
    end if;
  end if;

  if existing.company_id is not null then
    update public.company_messenger_settings set
      enabled = p_enabled,
      provider = p_provider,
      page_id = resolved_page_id,
      access_token = '',
      webhook_verify_token = '',
      api_version = coalesce(nullif(trim(p_api_version), ''), 'v21.0'),
      access_token_encrypted = resolved_access_encrypted,
      webhook_verify_token_encrypted = resolved_verify_encrypted,
      app_secret_encrypted = resolved_app_secret_encrypted,
      access_token_hint = resolved_access_hint,
      webhook_verify_token_hint = resolved_verify_hint,
      app_secret_hint = resolved_app_secret_hint,
      webhook_verify_token_lookup_hash = resolved_verify_hash,
      updated_by = auth.uid(),
      updated_at = now()
    where company_id = p_company_id;
  else
    insert into public.company_messenger_settings (
      company_id,
      enabled,
      provider,
      page_id,
      access_token,
      webhook_verify_token,
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
      resolved_page_id,
      '',
      '',
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
    );
  end if;

  perform public.sync_messenger_channel_references(p_company_id);

  return public.get_company_messenger_settings(p_company_id);
exception
  when unique_violation then
    if sqlerrm like '%uq_company_messenger_settings_page_id%' then
      raise exception 'Messenger Page ID is already linked to another company';
    end if;
    raise;
end;
$$;
