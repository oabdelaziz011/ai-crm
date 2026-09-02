-- Prefer encrypted WhatsApp secrets over legacy plaintext columns.
-- Stale plaintext access_token (if ever present) must not shadow access_token_encrypted.

create or replace function public.get_company_whatsapp_settings_decrypted(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_whatsapp_settings;
  v_access_token text := '';
  v_webhook_token text := '';
  v_app_secret text := '';
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_whatsapp_settings where company_id = p_company_id;
  if not found then
    return null;
  end if;

  if row.access_token_encrypted is not null then
    v_access_token := coalesce(public.whatsapp_decrypt_secret(row.access_token_encrypted), '');
  elsif coalesce(row.access_token, '') <> '' then
    v_access_token := row.access_token;
  end if;

  if row.webhook_verify_token_encrypted is not null then
    v_webhook_token := coalesce(public.whatsapp_decrypt_secret(row.webhook_verify_token_encrypted), '');
  elsif coalesce(row.webhook_verify_token, '') <> '' then
    v_webhook_token := row.webhook_verify_token;
  end if;

  if row.app_secret_encrypted is not null then
    v_app_secret := coalesce(public.whatsapp_decrypt_secret(row.app_secret_encrypted), '');
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
    'token_status', row.token_status,
    'token_expires_at', row.token_expires_at,
    'token_checked_at', row.token_checked_at,
    'updated_at', row.updated_at
  );
end;
$$;

revoke all on function public.get_company_whatsapp_settings_decrypted(uuid) from public;
revoke all on function public.get_company_whatsapp_settings_decrypted(uuid) from anon;
revoke all on function public.get_company_whatsapp_settings_decrypted(uuid) from authenticated;
grant execute on function public.get_company_whatsapp_settings_decrypted(uuid) to service_role;
