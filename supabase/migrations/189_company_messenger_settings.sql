-- Sprint C2 — Messenger channel credentials (canonical store, mirrors Instagram/WhatsApp pattern).

create table if not exists public.company_messenger_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  provider text not null default 'meta_messenger'
    check (provider in ('meta_messenger')),
  page_id text not null default '',
  access_token text not null default '',
  webhook_verify_token text not null default '',
  api_version text not null default 'v21.0',
  access_token_encrypted bytea,
  webhook_verify_token_encrypted bytea,
  app_secret_encrypted bytea,
  access_token_hint text not null default '',
  webhook_verify_token_hint text not null default '',
  app_secret_hint text not null default '',
  webhook_verify_token_lookup_hash text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_messenger_settings_page_id
  on public.company_messenger_settings(page_id)
  where page_id <> '';

create unique index if not exists uq_company_messenger_settings_page_id
  on public.company_messenger_settings(page_id)
  where page_id <> '';

create index if not exists idx_company_messenger_settings_verify_token_hash
  on public.company_messenger_settings(webhook_verify_token_lookup_hash)
  where webhook_verify_token_lookup_hash <> '';

alter table public.company_messenger_settings enable row level security;

drop policy if exists company_messenger_settings_select on public.company_messenger_settings;
create policy company_messenger_settings_select
  on public.company_messenger_settings for select
  using (
    auth.role() in ('authenticated', 'service_role')
    and (auth.role() = 'service_role' or public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists company_messenger_settings_upsert on public.company_messenger_settings;
create policy company_messenger_settings_upsert
  on public.company_messenger_settings for all
  using (
    auth.role() in ('authenticated', 'service_role')
    and (
      auth.role() = 'service_role'
      or (company_id = public.current_company_id() and public.whatsapp_settings_can_manage(company_id))
    )
  )
  with check (
    auth.role() in ('authenticated', 'service_role')
    and (
      auth.role() = 'service_role'
      or (company_id = public.current_company_id() and public.whatsapp_settings_can_manage(company_id))
    )
  );

create or replace function public.messenger_settings_has_access_token(settings_row public.company_messenger_settings)
returns boolean
language sql
immutable
as $$
  select settings_row.access_token_encrypted is not null or coalesce(settings_row.access_token, '') <> '';
$$;

create or replace function public.messenger_settings_has_webhook_token(settings_row public.company_messenger_settings)
returns boolean
language sql
immutable
as $$
  select settings_row.webhook_verify_token_encrypted is not null or coalesce(settings_row.webhook_verify_token, '') <> '';
$$;

create or replace function public.messenger_settings_has_app_secret(settings_row public.company_messenger_settings)
returns boolean
language sql
immutable
as $$
  select settings_row.app_secret_encrypted is not null;
$$;

create or replace function public.messenger_settings_row_to_public(settings_row public.company_messenger_settings)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'company_id', settings_row.company_id,
    'enabled', settings_row.enabled,
    'provider', settings_row.provider,
    'page_id', settings_row.page_id,
    'access_token', public.whatsapp_mask_secret(
      settings_row.access_token_hint,
      public.messenger_settings_has_access_token(settings_row)
    ),
    'webhook_verify_token', public.whatsapp_mask_secret(
      settings_row.webhook_verify_token_hint,
      public.messenger_settings_has_webhook_token(settings_row)
    ),
    'api_version', coalesce(nullif(trim(settings_row.api_version), ''), 'v21.0'),
    'app_secret', public.whatsapp_mask_secret(
      settings_row.app_secret_hint,
      public.messenger_settings_has_app_secret(settings_row)
    ),
    'has_access_token', public.messenger_settings_has_access_token(settings_row),
    'has_webhook_verify_token', public.messenger_settings_has_webhook_token(settings_row),
    'has_app_secret', public.messenger_settings_has_app_secret(settings_row),
    'updated_at', settings_row.updated_at
  );
$$;

create or replace function public.sync_messenger_channel_references(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings_row public.company_messenger_settings;
  channel_row record;
  next_configuration jsonb;
begin
  select * into settings_row
  from public.company_messenger_settings
  where company_id = p_company_id;

  for channel_row in
    select cc.id, cc.configuration
    from public.company_channels cc
    join public.communication_channels ch on ch.id = cc.channel_id
    where cc.company_id = p_company_id
      and cc.deleted_at is null
      and ch.key = 'messenger'
  loop
    next_configuration := coalesce(channel_row.configuration, '{}'::jsonb)
      - 'accessToken'
      - 'verifyToken'
      - 'appSecret';

    if settings_row.company_id is not null
      and nullif(trim(settings_row.page_id), '') is not null then
      next_configuration := jsonb_set(
        next_configuration,
        '{pageId}',
        to_jsonb(trim(settings_row.page_id)),
        true
      );
    end if;

    next_configuration := jsonb_set(
      next_configuration,
      '{credentialsSource}',
      '"company_messenger_settings"'::jsonb,
      true
    );

    update public.company_channels
    set configuration = next_configuration,
        updated_at = now()
    where id = channel_row.id;
  end loop;
end;
$$;

create or replace function public.get_company_messenger_settings(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_messenger_settings;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role'
    and not (public.is_super_admin() or p_company_id = public.current_company_id()) then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_messenger_settings where company_id = p_company_id;
  if not found then
    return jsonb_build_object(
      'company_id', p_company_id,
      'enabled', false,
      'provider', 'meta_messenger',
      'page_id', '',
      'access_token', '',
      'webhook_verify_token', '',
      'api_version', 'v21.0',
      'app_secret', '',
      'has_access_token', false,
      'has_webhook_verify_token', false,
      'has_app_secret', false
    );
  end if;

  return public.messenger_settings_row_to_public(row);
end;
$$;

create or replace function public.get_company_messenger_settings_decrypted(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_messenger_settings;
  v_access_token text;
  v_webhook_token text;
  v_app_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_messenger_settings where company_id = p_company_id;
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
    'page_id', row.page_id,
    'access_token', v_access_token,
    'webhook_verify_token', v_webhook_token,
    'api_version', coalesce(nullif(trim(row.api_version), ''), 'v21.0'),
    'app_secret', v_app_secret,
    'has_access_token', v_access_token <> '',
    'has_webhook_verify_token', v_webhook_token <> '',
    'has_app_secret', v_app_secret <> '',
    'updated_at', row.updated_at
  );
end;
$$;

create or replace function public.upsert_company_messenger_settings(
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
set search_path = public
as $$
declare
  existing public.company_messenger_settings;
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

  if p_provider not in ('meta_messenger') then
    raise exception 'Invalid Messenger provider';
  end if;

  select * into existing from public.company_messenger_settings where company_id = p_company_id;

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
    if nullif(trim(p_page_id), '') is null then
      raise exception 'Messenger Page ID is required when Messenger is enabled';
    end if;
    if existing.company_id is null and nullif(trim(resolved_access_token), '') is null then
      raise exception 'Access Token is required when Messenger is enabled';
    end if;
  end if;

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
    coalesce(p_page_id, ''),
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
  )
  on conflict (company_id) do update set
    enabled = excluded.enabled,
    provider = excluded.provider,
    page_id = excluded.page_id,
    access_token = '',
    webhook_verify_token = '',
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

  perform public.sync_messenger_channel_references(p_company_id);

  return public.get_company_messenger_settings(p_company_id);
end;
$$;

grant execute on function public.sync_messenger_channel_references(uuid) to service_role;
grant execute on function public.get_company_messenger_settings(uuid) to authenticated, service_role;
grant execute on function public.get_company_messenger_settings_decrypted(uuid) to service_role;
grant execute on function public.upsert_company_messenger_settings(
  uuid, boolean, text, text, text, text, text, text
) to authenticated, service_role;
