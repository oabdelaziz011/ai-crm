-- Universal email provider architecture: mailbox_provider + connection status + OAuth token store RPC.
-- Preserves existing Gmail/IMAP/SMTP rows. Never deletes credentials.

alter table public.company_email_settings
  add column if not exists mailbox_provider text not null default 'imap_smtp'
    check (mailbox_provider in ('gmail', 'microsoft_365', 'imap_smtp')),
  add column if not exists connection_status text not null default 'disabled'
    check (connection_status in ('connected', 'connecting', 'needs_reauthorization', 'connection_error', 'disabled')),
  add column if not exists connection_last_error text not null default '',
  add column if not exists connection_last_synced_at timestamptz,
  add column if not exists oauth_expires_at timestamptz;

-- Deterministic backfill from existing hosts / oauth / providers. Ambiguous → imap_smtp.
update public.company_email_settings
set mailbox_provider = case
  when lower(coalesce(oauth_provider, '')) in ('microsoft', 'microsoft_365', 'azure_ad') then 'microsoft_365'
  when inbound_provider = 'microsoft_graph' or outbound_provider = 'microsoft_graph' then 'microsoft_365'
  when inbound_provider = 'gmail_api' or outbound_provider = 'gmail_api' then 'gmail'
  when lower(coalesce(smtp_host, '')) like '%gmail.com%'
    or lower(coalesce(imap_host, '')) like '%gmail.com%' then 'gmail'
  else 'imap_smtp'
end
where mailbox_provider = 'imap_smtp';

update public.company_email_settings
set connection_status = case
  when enabled and conversation_enabled and (
    (mailbox_provider = 'microsoft_365' and oauth_token_encrypted is not null)
    or (mailbox_provider <> 'microsoft_365' and coalesce(smtp_host, '') <> '' and (
      smtp_password_encrypted is not null or coalesce(smtp_password, '') <> ''
    ))
  ) then 'connected'
  when enabled then 'connection_error'
  else 'disabled'
end
where connection_status = 'disabled' or connection_status = 'connected';

-- Extend public projection with mailbox/connection fields (no secrets).
create or replace function public.email_settings_row_to_public(settings_row public.company_email_settings)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'company_id', settings_row.company_id,
    'enabled', settings_row.enabled,
    'conversation_enabled', settings_row.conversation_enabled,
    'inbound_provider', settings_row.inbound_provider,
    'outbound_provider', settings_row.outbound_provider,
    'mailbox_provider', settings_row.mailbox_provider,
    'connection_status', settings_row.connection_status,
    'connection_last_error', settings_row.connection_last_error,
    'connection_last_synced_at', settings_row.connection_last_synced_at,
    'smtp_host', settings_row.smtp_host,
    'smtp_port', settings_row.smtp_port,
    'smtp_username', settings_row.smtp_username,
    'smtp_password', public.whatsapp_mask_secret(
      settings_row.smtp_password_hint,
      public.email_settings_has_smtp_password(settings_row)
    ),
    'smtp_encryption', settings_row.smtp_encryption,
    'imap_host', settings_row.imap_host,
    'imap_port', settings_row.imap_port,
    'imap_username', settings_row.imap_username,
    'imap_encryption', settings_row.imap_encryption,
    'from_email', settings_row.from_email,
    'from_name', settings_row.from_name,
    'reply_to_email', settings_row.reply_to_email,
    'max_retry_count', settings_row.max_retry_count,
    'max_attachment_bytes', settings_row.max_attachment_bytes,
    'imap_mailbox', settings_row.imap_mailbox,
    'imap_last_uid', settings_row.imap_last_uid,
    'imap_poll_interval_seconds', settings_row.imap_poll_interval_seconds,
    'oauth_provider', settings_row.oauth_provider,
    'oauth_token', public.whatsapp_mask_secret(
      settings_row.oauth_token_hint,
      settings_row.oauth_token_encrypted is not null
    ),
    'oauth_expires_at', settings_row.oauth_expires_at,
    'has_smtp_password', public.email_settings_has_smtp_password(settings_row),
    'has_imap_password', settings_row.imap_password_encrypted is not null
      or public.email_settings_has_smtp_password(settings_row),
    'has_oauth_token', settings_row.oauth_token_encrypted is not null,
    'updated_at', settings_row.updated_at
  );
$$;

-- Server-only: store OAuth access + refresh tokens (encrypted). Never returns tokens.
create or replace function public.store_company_email_oauth_tokens(
  p_company_id uuid,
  p_oauth_provider text,
  p_access_token text,
  p_refresh_token text default null,
  p_expires_at timestamptz default null,
  p_mailbox_provider text default 'microsoft_365',
  p_from_email text default null,
  p_from_name text default null,
  p_connection_status text default 'connected'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access bytea;
  v_refresh bytea;
  v_hint text;
  row public.company_email_settings;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;
  if p_company_id is null then
    raise exception 'company_id required';
  end if;
  if nullif(trim(coalesce(p_access_token, '')), '') is null then
    raise exception 'access_token required';
  end if;

  v_access := public.whatsapp_encrypt_secret(trim(p_access_token));
  v_hint := right(trim(p_access_token), 4);
  if nullif(trim(coalesce(p_refresh_token, '')), '') is not null then
    v_refresh := public.whatsapp_encrypt_secret(trim(p_refresh_token));
  else
    v_refresh := null;
  end if;

  insert into public.company_email_settings (
    company_id,
    enabled,
    conversation_enabled,
    inbound_provider,
    outbound_provider,
    mailbox_provider,
    connection_status,
    connection_last_error,
    oauth_provider,
    oauth_token_encrypted,
    oauth_refresh_token_encrypted,
    oauth_token_hint,
    oauth_expires_at,
    from_email,
    from_name,
    updated_at
  ) values (
    p_company_id,
    true,
    true,
    'microsoft_graph',
    'microsoft_graph',
    coalesce(nullif(trim(p_mailbox_provider), ''), 'microsoft_365'),
    coalesce(nullif(trim(p_connection_status), ''), 'connected'),
    '',
    coalesce(nullif(trim(p_oauth_provider), ''), 'microsoft'),
    v_access,
    v_refresh,
    coalesce(v_hint, ''),
    p_expires_at,
    coalesce(nullif(trim(p_from_email), ''), ''),
    coalesce(nullif(trim(p_from_name), ''), ''),
    now()
  )
  on conflict (company_id) do update set
    enabled = true,
    conversation_enabled = true,
    inbound_provider = 'microsoft_graph',
    outbound_provider = 'microsoft_graph',
    mailbox_provider = coalesce(nullif(trim(p_mailbox_provider), ''), excluded.mailbox_provider),
    connection_status = coalesce(nullif(trim(p_connection_status), ''), 'connected'),
    connection_last_error = '',
    oauth_provider = coalesce(nullif(trim(p_oauth_provider), ''), 'microsoft'),
    oauth_token_encrypted = v_access,
    oauth_refresh_token_encrypted = coalesce(v_refresh, company_email_settings.oauth_refresh_token_encrypted),
    oauth_token_hint = coalesce(v_hint, ''),
    oauth_expires_at = coalesce(p_expires_at, company_email_settings.oauth_expires_at),
    from_email = case
      when nullif(trim(coalesce(p_from_email, '')), '') is not null then trim(p_from_email)
      else company_email_settings.from_email
    end,
    from_name = case
      when nullif(trim(coalesce(p_from_name, '')), '') is not null then trim(p_from_name)
      else company_email_settings.from_name
    end,
    from_email_normalized = lower(trim(case
      when nullif(trim(coalesce(p_from_email, '')), '') is not null then trim(p_from_email)
      else company_email_settings.from_email
    end)),
    updated_at = now();

  perform public.sync_email_channel_references(p_company_id);

  select * into row from public.company_email_settings where company_id = p_company_id;
  return public.email_settings_row_to_public(row);
end;
$$;

revoke all on function public.store_company_email_oauth_tokens(uuid, text, text, text, timestamptz, text, text, text, text) from public;
grant execute on function public.store_company_email_oauth_tokens(uuid, text, text, text, timestamptz, text, text, text, text) to service_role;

create or replace function public.update_company_email_connection_status(
  p_company_id uuid,
  p_status text,
  p_last_error text default '',
  p_synced_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and auth.role() <> 'authenticated' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role'
    and not (public.is_super_admin() or p_company_id = public.current_company_id()) then
    raise exception 'Forbidden';
  end if;

  update public.company_email_settings
  set connection_status = p_status,
      connection_last_error = coalesce(p_last_error, ''),
      connection_last_synced_at = coalesce(p_synced_at, connection_last_synced_at),
      updated_at = now()
  where company_id = p_company_id;
end;
$$;

revoke all on function public.update_company_email_connection_status(uuid, text, text, timestamptz) from public;
grant execute on function public.update_company_email_connection_status(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.update_company_email_connection_status(uuid, text, text, timestamptz) to service_role;

-- Include mailbox + oauth fields in decrypted server-only projection.
create or replace function public.get_company_email_settings_decrypted(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_email_settings;
  v_smtp_password text;
  v_imap_password text;
  v_oauth_token text;
  v_oauth_refresh text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_email_settings where company_id = p_company_id;
  if not found then
    return null;
  end if;

  v_smtp_password := coalesce(row.smtp_password, '');
  if v_smtp_password = '' and row.smtp_password_encrypted is not null then
    v_smtp_password := public.whatsapp_decrypt_secret(row.smtp_password_encrypted);
  end if;

  v_imap_password := '';
  if row.imap_password_encrypted is not null then
    v_imap_password := public.whatsapp_decrypt_secret(row.imap_password_encrypted);
  elsif v_smtp_password <> '' and coalesce(row.imap_username, '') = coalesce(row.smtp_username, '') then
    v_imap_password := v_smtp_password;
  end if;

  v_oauth_token := '';
  if row.oauth_token_encrypted is not null then
    v_oauth_token := public.whatsapp_decrypt_secret(row.oauth_token_encrypted);
  end if;

  v_oauth_refresh := '';
  if row.oauth_refresh_token_encrypted is not null then
    v_oauth_refresh := public.whatsapp_decrypt_secret(row.oauth_refresh_token_encrypted);
  end if;

  return jsonb_build_object(
    'company_id', row.company_id,
    'enabled', row.enabled,
    'conversation_enabled', row.conversation_enabled,
    'inbound_provider', row.inbound_provider,
    'outbound_provider', row.outbound_provider,
    'mailbox_provider', row.mailbox_provider,
    'connection_status', row.connection_status,
    'connection_last_error', row.connection_last_error,
    'connection_last_synced_at', row.connection_last_synced_at,
    'smtp_host', row.smtp_host,
    'smtp_port', row.smtp_port,
    'smtp_username', row.smtp_username,
    'smtp_password', v_smtp_password,
    'smtp_encryption', row.smtp_encryption,
    'imap_host', row.imap_host,
    'imap_port', row.imap_port,
    'imap_username', row.imap_username,
    'imap_password', v_imap_password,
    'imap_encryption', row.imap_encryption,
    'from_email', row.from_email,
    'from_name', row.from_name,
    'reply_to_email', row.reply_to_email,
    'max_retry_count', row.max_retry_count,
    'max_attachment_bytes', row.max_attachment_bytes,
    'imap_mailbox', row.imap_mailbox,
    'imap_last_uid', row.imap_last_uid,
    'imap_poll_interval_seconds', row.imap_poll_interval_seconds,
    'oauth_provider', row.oauth_provider,
    'oauth_token', v_oauth_token,
    'oauth_refresh_token', v_oauth_refresh,
    'oauth_expires_at', row.oauth_expires_at,
    'has_smtp_password', v_smtp_password <> '',
    'has_imap_password', v_imap_password <> '',
    'has_oauth_token', v_oauth_token <> '',
    'updated_at', row.updated_at
  );
end;
$$;

-- Sync mailboxProvider into company_channels.configuration (non-secret metadata only).
create or replace function public.sync_email_channel_references(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.company_email_settings;
  channel_row record;
  next_configuration jsonb;
begin
  select * into settings_row
  from public.company_email_settings
  where company_id = p_company_id;

  for channel_row in
    select cc.id, cc.configuration
    from public.company_channels cc
    join public.communication_channels ch on ch.id = cc.channel_id
    where cc.company_id = p_company_id
      and cc.deleted_at is null
      and ch.key = 'email'
  loop
    next_configuration := coalesce(channel_row.configuration, '{}'::jsonb)
      - 'smtpPassword'
      - 'imapPassword'
      - 'oauthToken'
      - 'oauthRefreshToken'
      - 'accessToken'
      - 'refreshToken';

    if settings_row.company_id is not null
      and nullif(trim(settings_row.from_email), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{fromEmail}',
        to_jsonb(trim(settings_row.from_email)),
        true
      );
    end if;

    if settings_row.company_id is not null
      and nullif(trim(settings_row.reply_to_email), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{replyToEmail}',
        to_jsonb(trim(settings_row.reply_to_email)),
        true
      );
    end if;

    next_configuration := jsonb_set(
      next_configuration,
      '{credentialsSource}',
      '"company_email_settings"'::jsonb,
      true
    );

    if settings_row.company_id is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{mailboxProvider}',
        to_jsonb(settings_row.mailbox_provider),
        true
      );
      next_configuration := jsonb_set(
        next_configuration,
        '{connectionStatus}',
        to_jsonb(settings_row.connection_status),
        true
      );
    end if;

    update public.company_channels
    set configuration = next_configuration,
        updated_at = now()
    where id = channel_row.id;
  end loop;
end;
$$;
