-- Phase 2A — SMS channel credentials (canonical store, mirrors Messenger/Instagram/WhatsApp).
-- Secrets live only in company_sms_settings; company_channels.configuration holds non-secret refs.

create table if not exists public.company_sms_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  provider text not null default ''
    check (provider in ('', 'twilio')),
  account_sid text not null default '',
  from_number text not null default '',
  auth_token_encrypted bytea,
  auth_token_hint text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_sms_settings_account_sid
  on public.company_sms_settings(account_sid)
  where account_sid <> '';

create index if not exists idx_company_sms_settings_from_number
  on public.company_sms_settings(from_number)
  where from_number <> '';

alter table public.company_sms_settings enable row level security;

drop policy if exists company_sms_settings_select on public.company_sms_settings;
create policy company_sms_settings_select
  on public.company_sms_settings for select
  using (
    auth.role() in ('authenticated', 'service_role')
    and (
      auth.role() = 'service_role'
      or public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.whatsapp_settings_can_manage(company_id)
        and internal.company_channel_feature_commercial_entitled(company_id, 'sms_channel')
      )
    )
  );

drop policy if exists company_sms_settings_upsert on public.company_sms_settings;
create policy company_sms_settings_upsert
  on public.company_sms_settings for all
  using (
    auth.role() in ('authenticated', 'service_role')
    and (
      auth.role() = 'service_role'
      or public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.whatsapp_settings_can_manage(company_id)
        and (
          internal.company_channel_feature_commercial_entitled(company_id, 'sms_channel')
          or enabled = false
        )
      )
    )
  )
  with check (
    auth.role() in ('authenticated', 'service_role')
    and (
      auth.role() = 'service_role'
      or public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.whatsapp_settings_can_manage(company_id)
        and (
          internal.company_channel_feature_commercial_entitled(company_id, 'sms_channel')
          or enabled = false
        )
      )
    )
  );

create or replace function public.sms_settings_has_auth_token(settings_row public.company_sms_settings)
returns boolean
language sql
immutable
as $$
  select settings_row.auth_token_encrypted is not null;
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
    'updated_at', settings_row.updated_at
  );
$$;

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
begin
  select * into settings_row
  from public.company_sms_settings
  where company_id = p_company_id;

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
      - 'accountSid'
      - 'fromNumber';

    if settings_row.company_id is not null
      and nullif(trim(settings_row.account_sid), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{accountSid}',
        to_jsonb(trim(settings_row.account_sid)),
        true
      );
    end if;

    if settings_row.company_id is not null
      and nullif(trim(settings_row.from_number), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{fromNumber}',
        to_jsonb(trim(settings_row.from_number)),
        true
      );
    end if;

    if settings_row.company_id is not null
      and nullif(trim(settings_row.provider), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{provider}',
        to_jsonb(trim(settings_row.provider)),
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
        updated_at = now()
    where id = channel_row.id;
  end loop;
end;
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
      'has_auth_token', false
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

  return jsonb_build_object(
    'company_id', row.company_id,
    'enabled', row.enabled,
    'provider', row.provider,
    'account_sid', row.account_sid,
    'from_number', row.from_number,
    'auth_token', v_auth_token,
    'has_auth_token', v_auth_token <> '',
    'updated_at', row.updated_at
  );
end;
$$;

create or replace function public.upsert_company_sms_settings(
  p_company_id uuid,
  p_enabled boolean,
  p_provider text,
  p_account_sid text,
  p_from_number text,
  p_auth_token text
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
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role' and not public.whatsapp_settings_can_manage(p_company_id) then
    raise exception 'Forbidden';
  end if;

  resolved_provider := coalesce(nullif(trim(p_provider), ''), '');
  if resolved_provider not in ('', 'twilio') then
    raise exception 'Invalid SMS provider';
  end if;

  select * into existing from public.company_sms_settings where company_id = p_company_id;

  resolved_auth_token := coalesce(p_auth_token, '');
  if public.whatsapp_is_unchanged_secret(resolved_auth_token) and existing.company_id is not null then
    resolved_auth_encrypted := existing.auth_token_encrypted;
    resolved_auth_hint := existing.auth_token_hint;
    resolved_auth_token := '__unchanged__';
  elsif nullif(trim(resolved_auth_token), '') is null then
    -- Explicit clear / never set: do not store an empty ciphertext blob.
    resolved_auth_encrypted := null;
    resolved_auth_hint := '';
  else
    resolved_auth_encrypted := public.whatsapp_encrypt_secret(resolved_auth_token);
    resolved_auth_hint := public.whatsapp_secret_hint(resolved_auth_token);
  end if;

  if p_enabled then
    if resolved_provider = '' then
      raise exception 'SMS provider is required when SMS is enabled';
    end if;
    if nullif(trim(p_account_sid), '') is null then
      raise exception 'SMS account identifier is required when SMS is enabled';
    end if;
    if nullif(trim(p_from_number), '') is null then
      raise exception 'SMS sender number is required when SMS is enabled';
    end if;
    if existing.company_id is null and nullif(trim(resolved_auth_token), '') is null then
      raise exception 'SMS auth token is required when SMS is enabled';
    end if;
    if existing.company_id is not null
      and resolved_auth_token = '__unchanged__'
      and existing.auth_token_encrypted is null then
      raise exception 'SMS auth token is required when SMS is enabled';
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
    updated_by = auth.uid(),
    updated_at = now();

  perform public.sync_sms_channel_references(p_company_id);

  return public.get_company_sms_settings(p_company_id);
end;
$$;

revoke execute on function public.sync_sms_channel_references(uuid) from authenticated;
revoke execute on function public.sync_sms_channel_references(uuid) from anon;
revoke execute on function public.sync_sms_channel_references(uuid) from public;
revoke execute on function public.get_company_sms_settings_decrypted(uuid) from authenticated;
revoke execute on function public.get_company_sms_settings_decrypted(uuid) from anon;
revoke execute on function public.get_company_sms_settings_decrypted(uuid) from public;

grant execute on function public.sync_sms_channel_references(uuid) to service_role;
grant execute on function public.get_company_sms_settings(uuid) to authenticated, service_role;
grant execute on function public.get_company_sms_settings_decrypted(uuid) to service_role;
grant execute on function public.upsert_company_sms_settings(
  uuid, boolean, text, text, text, text
) to authenticated, service_role;
