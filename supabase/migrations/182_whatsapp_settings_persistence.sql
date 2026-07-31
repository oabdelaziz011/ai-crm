-- WhatsApp provider settings: encrypted secrets, settings.edit permission, validation, masking.

create extension if not exists pgcrypto;

alter table public.company_whatsapp_settings
  add column if not exists access_token_encrypted bytea,
  add column if not exists webhook_verify_token_encrypted bytea,
  add column if not exists access_token_hint text not null default '',
  add column if not exists webhook_verify_token_hint text not null default '';

create or replace function public.whatsapp_crypto_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.platform_ai_crypto_secret();
$$;

create or replace function public.whatsapp_secret_hint(p_plaintext text)
returns text
language sql
immutable
as $$
  select case
    when p_plaintext is null or length(trim(p_plaintext)) = 0 then ''
    when length(trim(p_plaintext)) >= 4 then right(trim(p_plaintext), 4)
    else trim(p_plaintext)
  end;
$$;

create or replace function public.whatsapp_mask_secret(p_hint text, p_has_value boolean)
returns text
language sql
immutable
as $$
  select case
    when not p_has_value then ''
    when coalesce(p_hint, '') <> '' then repeat('*', 16) || p_hint
    else repeat('*', 16)
  end;
$$;

create or replace function public.whatsapp_is_unchanged_secret(p_value text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_value, '') = ''
    or p_value = '********'
    or p_value ~ '^\*+[A-Za-z0-9]{1,8}$';
$$;

create or replace function public.whatsapp_encrypt_secret(p_plaintext text)
returns bytea
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  v_secret := public.whatsapp_crypto_secret();
  if v_secret is null or length(trim(v_secret)) = 0 then
    raise exception 'WhatsApp crypto secret is not configured';
  end if;
  if p_plaintext is null or length(trim(p_plaintext)) = 0 then
    return null;
  end if;
  return pgp_sym_encrypt(trim(p_plaintext), v_secret);
end;
$$;

create or replace function public.whatsapp_decrypt_secret(p_encrypted bytea)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;
  if p_encrypted is null then
    return '';
  end if;
  v_secret := public.whatsapp_crypto_secret();
  if v_secret is null or length(trim(v_secret)) = 0 then
    raise exception 'WhatsApp crypto secret is not configured';
  end if;
  return pgp_sym_decrypt(p_encrypted, v_secret);
end;
$$;

-- Backfill encrypted columns from legacy plaintext values.
update public.company_whatsapp_settings
set
  access_token_encrypted = public.whatsapp_encrypt_secret(access_token),
  access_token_hint = public.whatsapp_secret_hint(access_token),
  access_token = ''
where coalesce(access_token, '') <> ''
  and access_token_encrypted is null;

update public.company_whatsapp_settings
set
  webhook_verify_token_encrypted = public.whatsapp_encrypt_secret(webhook_verify_token),
  webhook_verify_token_hint = public.whatsapp_secret_hint(webhook_verify_token),
  webhook_verify_token = ''
where coalesce(webhook_verify_token, '') <> ''
  and webhook_verify_token_encrypted is null;

create or replace function public.whatsapp_settings_can_manage(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'service_role'
    or public.is_super_admin()
    or (
      p_company_id = public.current_company_id()
      and public.user_has_permission('settings.edit')
    );
$$;

create or replace function public.whatsapp_settings_has_access_token(settings_row public.company_whatsapp_settings)
returns boolean
language sql
immutable
as $$
  select coalesce(length(settings_row.access_token), 0) > 0
    or settings_row.access_token_encrypted is not null;
$$;

create or replace function public.whatsapp_settings_has_webhook_token(settings_row public.company_whatsapp_settings)
returns boolean
language sql
immutable
as $$
  select coalesce(length(settings_row.webhook_verify_token), 0) > 0
    or settings_row.webhook_verify_token_encrypted is not null;
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
    'default_language', settings_row.default_language,
    'max_retry_count', settings_row.max_retry_count,
    'has_access_token', public.whatsapp_settings_has_access_token(settings_row),
    'has_webhook_verify_token', public.whatsapp_settings_has_webhook_token(settings_row),
    'updated_at', settings_row.updated_at
  );
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
      'default_language', 'en',
      'max_retry_count', 3,
      'has_access_token', false,
      'has_webhook_verify_token', false
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

  return jsonb_build_object(
    'company_id', row.company_id,
    'enabled', row.enabled,
    'provider', row.provider,
    'access_token', v_access_token,
    'phone_number_id', row.phone_number_id,
    'business_account_id', row.business_account_id,
    'webhook_verify_token', v_webhook_token,
    'default_language', row.default_language,
    'max_retry_count', row.max_retry_count,
    'has_access_token', v_access_token <> '',
    'has_webhook_verify_token', v_webhook_token <> '',
    'updated_at', row.updated_at
  );
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
  p_max_retry_count integer default 3
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
  resolved_access_encrypted bytea;
  resolved_verify_encrypted bytea;
  resolved_access_hint text;
  resolved_verify_hint text;
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
    resolved_verify_token := '__unchanged__';
  else
    resolved_verify_encrypted := public.whatsapp_encrypt_secret(resolved_verify_token);
    resolved_verify_hint := public.whatsapp_secret_hint(resolved_verify_token);
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
    if existing.company_id is null
      and nullif(trim(resolved_access_token), '') is null then
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
    access_token_encrypted,
    webhook_verify_token_encrypted,
    access_token_hint,
    webhook_verify_token_hint,
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
    resolved_access_encrypted,
    resolved_verify_encrypted,
    resolved_access_hint,
    resolved_verify_hint,
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
    access_token_encrypted = excluded.access_token_encrypted,
    webhook_verify_token_encrypted = excluded.webhook_verify_token_encrypted,
    access_token_hint = excluded.access_token_hint,
    webhook_verify_token_hint = excluded.webhook_verify_token_hint,
    updated_by = auth.uid(),
    updated_at = now();

  return public.get_company_whatsapp_settings(p_company_id);
end;
$$;

drop policy if exists company_whatsapp_settings_upsert on public.company_whatsapp_settings;
create policy company_whatsapp_settings_upsert
  on public.company_whatsapp_settings for all
  using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and public.whatsapp_settings_can_manage(company_id)
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and public.whatsapp_settings_can_manage(company_id)
    )
  );

grant execute on function public.whatsapp_encrypt_secret(text) to authenticated, service_role;
grant execute on function public.whatsapp_decrypt_secret(bytea) to service_role;
grant execute on function public.get_company_whatsapp_settings_decrypted(uuid) to service_role;
grant execute on function public.whatsapp_settings_can_manage(uuid) to authenticated, service_role;
