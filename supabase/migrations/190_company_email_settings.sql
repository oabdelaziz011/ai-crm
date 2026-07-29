-- Sprint C3 — Email conversation channel settings (extends 149 notification SMTP table).

alter table public.company_email_settings
  add column if not exists conversation_enabled boolean not null default false,
  add column if not exists inbound_provider text not null default 'imap'
    check (inbound_provider in ('imap', 'webhook', 'gmail_api', 'microsoft_graph', 'ses_inbound')),
  add column if not exists outbound_provider text not null default 'smtp'
    check (outbound_provider in ('smtp', 'ses', 'sendgrid', 'mailgun', 'gmail_api', 'microsoft_graph')),
  add column if not exists imap_host text not null default '',
  add column if not exists imap_port integer not null default 993,
  add column if not exists imap_username text not null default '',
  add column if not exists imap_encryption text not null default 'ssl'
    check (imap_encryption in ('none', 'starttls', 'ssl')),
  add column if not exists reply_to_email text not null default '',
  add column if not exists smtp_password_encrypted bytea,
  add column if not exists imap_password_encrypted bytea,
  add column if not exists smtp_password_hint text not null default '',
  add column if not exists imap_password_hint text not null default '',
  add column if not exists oauth_provider text,
  add column if not exists oauth_token_encrypted bytea,
  add column if not exists oauth_refresh_token_encrypted bytea,
  add column if not exists oauth_token_hint text not null default '',
  add column if not exists max_attachment_bytes bigint not null default 26214400,
  add column if not exists imap_mailbox text not null default 'INBOX',
  add column if not exists imap_last_uid bigint not null default 0,
  add column if not exists imap_poll_interval_seconds integer not null default 60,
  add column if not exists from_email_normalized text not null default '';

update public.company_email_settings
set from_email_normalized = lower(trim(from_email))
where from_email_normalized = '' and coalesce(from_email, '') <> '';

create index if not exists idx_company_email_settings_from_email_normalized
  on public.company_email_settings(from_email_normalized)
  where from_email_normalized <> '';

create or replace function public.email_settings_has_smtp_password(settings_row public.company_email_settings)
returns boolean
language sql
immutable
as $$
  select settings_row.smtp_password_encrypted is not null
    or coalesce(settings_row.smtp_password, '') <> '';
$$;

create or replace function public.email_settings_has_imap_password(settings_row public.company_email_settings)
returns boolean
language sql
immutable
as $$
  select settings_row.imap_password_encrypted is not null
    or coalesce(settings_row.smtp_password, '') <> ''
    or coalesce(settings_row.imap_username, '') = coalesce(settings_row.smtp_username, '');
$$;

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
    'has_smtp_password', public.email_settings_has_smtp_password(settings_row),
    'has_imap_password', settings_row.imap_password_encrypted is not null
      or public.email_settings_has_smtp_password(settings_row),
    'has_oauth_token', settings_row.oauth_token_encrypted is not null,
    'updated_at', settings_row.updated_at
  );
$$;

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
      - 'imapPassword';

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

    update public.company_channels
    set configuration = next_configuration,
        updated_at = now()
    where id = channel_row.id;
  end loop;
end;
$$;

create or replace function public.get_company_email_settings(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_email_settings;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role'
    and not (public.is_super_admin() or p_company_id = public.current_company_id()) then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_email_settings where company_id = p_company_id;
  if not found then
    return jsonb_build_object(
      'company_id', p_company_id,
      'enabled', false,
      'conversation_enabled', false,
      'inbound_provider', 'imap',
      'outbound_provider', 'smtp',
      'smtp_host', '',
      'smtp_port', 587,
      'smtp_username', '',
      'smtp_password', '',
      'smtp_encryption', 'starttls',
      'imap_host', '',
      'imap_port', 993,
      'imap_username', '',
      'imap_encryption', 'ssl',
      'from_email', '',
      'from_name', '',
      'reply_to_email', '',
      'max_retry_count', 3,
      'max_attachment_bytes', 26214400,
      'imap_mailbox', 'INBOX',
      'imap_last_uid', 0,
      'imap_poll_interval_seconds', 60,
      'oauth_provider', null,
      'oauth_token', '',
      'has_smtp_password', false,
      'has_imap_password', false,
      'has_oauth_token', false
    );
  end if;

  return public.email_settings_row_to_public(row);
end;
$$;

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
    'has_smtp_password', v_smtp_password <> '',
    'has_imap_password', v_imap_password <> '',
    'has_oauth_token', v_oauth_token <> '',
    'updated_at', row.updated_at
  );
end;
$$;

drop function if exists public.upsert_company_email_settings(uuid, boolean, text, integer, text, text, text, text, text, integer);

create or replace function public.upsert_company_email_settings(
  p_company_id uuid,
  p_enabled boolean,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_username text,
  p_smtp_password text,
  p_smtp_encryption text,
  p_from_email text,
  p_from_name text,
  p_max_retry_count integer default 3,
  p_conversation_enabled boolean default false,
  p_inbound_provider text default 'imap',
  p_outbound_provider text default 'smtp',
  p_imap_host text default '',
  p_imap_port integer default 993,
  p_imap_username text default '',
  p_imap_password text default '',
  p_imap_encryption text default 'ssl',
  p_reply_to_email text default '',
  p_max_attachment_bytes bigint default 26214400,
  p_imap_mailbox text default 'INBOX',
  p_imap_poll_interval_seconds integer default 60,
  p_oauth_provider text default null,
  p_oauth_token text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.company_email_settings;
  resolved_smtp_password text;
  resolved_imap_password text;
  resolved_oauth_token text;
  resolved_smtp_encrypted bytea;
  resolved_imap_encrypted bytea;
  resolved_oauth_encrypted bytea;
  resolved_smtp_hint text;
  resolved_imap_hint text;
  resolved_oauth_hint text;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role'
    and not (public.is_super_admin() or (p_company_id = public.current_company_id() and public.is_company_admin())) then
    raise exception 'Forbidden';
  end if;

  if p_inbound_provider not in ('imap', 'webhook', 'gmail_api', 'microsoft_graph', 'ses_inbound') then
    raise exception 'Invalid inbound provider';
  end if;
  if p_outbound_provider not in ('smtp', 'ses', 'sendgrid', 'mailgun', 'gmail_api', 'microsoft_graph') then
    raise exception 'Invalid outbound provider';
  end if;

  select * into existing from public.company_email_settings where company_id = p_company_id;

  resolved_smtp_password := coalesce(p_smtp_password, '');
  if public.whatsapp_is_unchanged_secret(resolved_smtp_password) and existing.company_id is not null then
    resolved_smtp_encrypted := existing.smtp_password_encrypted;
    resolved_smtp_hint := existing.smtp_password_hint;
    resolved_smtp_password := '__unchanged__';
  else
    resolved_smtp_encrypted := public.whatsapp_encrypt_secret(resolved_smtp_password);
    resolved_smtp_hint := public.whatsapp_secret_hint(resolved_smtp_password);
  end if;

  resolved_imap_password := coalesce(p_imap_password, '');
  if public.whatsapp_is_unchanged_secret(resolved_imap_password) and existing.company_id is not null then
    resolved_imap_encrypted := existing.imap_password_encrypted;
    resolved_imap_hint := existing.imap_password_hint;
  elsif resolved_imap_password = '' and resolved_smtp_password <> '__unchanged__' then
    resolved_imap_encrypted := null;
    resolved_imap_hint := '';
  else
    resolved_imap_encrypted := public.whatsapp_encrypt_secret(resolved_imap_password);
    resolved_imap_hint := public.whatsapp_secret_hint(resolved_imap_password);
  end if;

  resolved_oauth_token := coalesce(p_oauth_token, '');
  if public.whatsapp_is_unchanged_secret(resolved_oauth_token) and existing.company_id is not null then
    resolved_oauth_encrypted := existing.oauth_token_encrypted;
    resolved_oauth_hint := existing.oauth_token_hint;
  else
    resolved_oauth_encrypted := public.whatsapp_encrypt_secret(resolved_oauth_token);
    resolved_oauth_hint := public.whatsapp_secret_hint(resolved_oauth_token);
  end if;

  if p_conversation_enabled then
    if nullif(trim(p_from_email), '') is null then
      raise exception 'From email is required when email conversations are enabled';
    end if;
    if p_outbound_provider = 'smtp' and nullif(trim(p_smtp_host), '') is null then
      raise exception 'SMTP host is required when email conversations are enabled';
    end if;
  end if;

  insert into public.company_email_settings (
    company_id, enabled, conversation_enabled, inbound_provider, outbound_provider,
    smtp_host, smtp_port, smtp_username, smtp_password, smtp_encryption,
    imap_host, imap_port, imap_username, imap_encryption,
    from_email, from_name, reply_to_email, max_retry_count, max_attachment_bytes,
    imap_mailbox, imap_poll_interval_seconds,
    smtp_password_encrypted, imap_password_encrypted, oauth_token_encrypted,
    smtp_password_hint, imap_password_hint, oauth_token_hint,
    oauth_provider, from_email_normalized,
    updated_by, updated_at
  ) values (
    p_company_id, p_enabled, p_conversation_enabled, p_inbound_provider, p_outbound_provider,
    p_smtp_host, p_smtp_port, p_smtp_username, '', p_smtp_encryption,
    p_imap_host, p_imap_port, p_imap_username, p_imap_encryption,
    p_from_email, p_from_name, p_reply_to_email,
    greatest(1, least(p_max_retry_count, 10)),
    greatest(1048576, least(p_max_attachment_bytes, 104857600)),
    coalesce(nullif(trim(p_imap_mailbox), ''), 'INBOX'),
    greatest(30, least(p_imap_poll_interval_seconds, 3600)),
    resolved_smtp_encrypted, resolved_imap_encrypted, resolved_oauth_encrypted,
    resolved_smtp_hint, resolved_imap_hint, resolved_oauth_hint,
    p_oauth_provider, lower(trim(p_from_email)),
    auth.uid(), now()
  )
  on conflict (company_id) do update set
    enabled = excluded.enabled,
    conversation_enabled = excluded.conversation_enabled,
    inbound_provider = excluded.inbound_provider,
    outbound_provider = excluded.outbound_provider,
    smtp_host = excluded.smtp_host,
    smtp_port = excluded.smtp_port,
    smtp_username = excluded.smtp_username,
    smtp_password = '',
    smtp_encryption = excluded.smtp_encryption,
    imap_host = excluded.imap_host,
    imap_port = excluded.imap_port,
    imap_username = excluded.imap_username,
    imap_encryption = excluded.imap_encryption,
    from_email = excluded.from_email,
    from_name = excluded.from_name,
    reply_to_email = excluded.reply_to_email,
    max_retry_count = excluded.max_retry_count,
    max_attachment_bytes = excluded.max_attachment_bytes,
    imap_mailbox = excluded.imap_mailbox,
    imap_poll_interval_seconds = excluded.imap_poll_interval_seconds,
    smtp_password_encrypted = excluded.smtp_password_encrypted,
    imap_password_encrypted = excluded.imap_password_encrypted,
    oauth_token_encrypted = excluded.oauth_token_encrypted,
    smtp_password_hint = excluded.smtp_password_hint,
    imap_password_hint = excluded.imap_password_hint,
    oauth_token_hint = excluded.oauth_token_hint,
    oauth_provider = excluded.oauth_provider,
    from_email_normalized = excluded.from_email_normalized,
    updated_by = auth.uid(),
    updated_at = now();

  perform public.sync_email_channel_references(p_company_id);
  return public.get_company_email_settings(p_company_id);
end;
$$;

create or replace function public.verify_company_email_smtp(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  settings jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  settings := public.get_company_email_settings_decrypted(p_company_id);
  if settings is null then
    return jsonb_build_object('ok', false, 'error', 'email_settings_not_found');
  end if;

  if coalesce(settings->>'smtp_host', '') = '' then
    return jsonb_build_object('ok', false, 'error', 'smtp_host_missing');
  end if;

  return jsonb_build_object(
    'ok', true,
    'provider', settings->>'outbound_provider',
    'smtp_host', settings->>'smtp_host',
    'smtp_port', settings->>'smtp_port',
    'from_email', settings->>'from_email'
  );
end;
$$;

create or replace function public.verify_company_email_imap(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  settings jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  settings := public.get_company_email_settings_decrypted(p_company_id);
  if settings is null then
    return jsonb_build_object('ok', false, 'error', 'email_settings_not_found');
  end if;

  if coalesce(settings->>'imap_host', '') = '' then
    return jsonb_build_object('ok', false, 'error', 'imap_host_missing');
  end if;

  return jsonb_build_object(
    'ok', true,
    'provider', settings->>'inbound_provider',
    'imap_host', settings->>'imap_host',
    'imap_port', settings->>'imap_port',
    'imap_mailbox', settings->>'imap_mailbox'
  );
end;
$$;

create or replace function public.update_company_email_imap_cursor(
  p_company_id uuid,
  p_last_uid bigint
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

  update public.company_email_settings
  set imap_last_uid = greatest(coalesce(imap_last_uid, 0), greatest(p_last_uid, 0)),
      updated_at = now()
  where company_id = p_company_id;
end;
$$;

grant execute on function public.sync_email_channel_references(uuid) to authenticated, service_role;
grant execute on function public.get_company_email_settings_decrypted(uuid) to service_role;
grant execute on function public.verify_company_email_smtp(uuid) to service_role;
grant execute on function public.verify_company_email_imap(uuid) to service_role;
grant execute on function public.upsert_company_email_settings(
  uuid, boolean, text, integer, text, text, text, text, text, integer,
  boolean, text, text, text, integer, text, text, text, text, bigint, text, integer, text, text
) to authenticated;
grant execute on function public.update_company_email_imap_cursor(uuid, bigint) to service_role;
