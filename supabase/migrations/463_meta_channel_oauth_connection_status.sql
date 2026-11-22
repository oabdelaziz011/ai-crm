-- Meta self-service OAuth connection metadata for Instagram Login + Messenger Page Login.
-- Additive only — does not alter existing upsert_company_* RPC signatures.

alter table public.company_instagram_settings
  add column if not exists oauth_mode text not null default 'page_linked';

alter table public.company_instagram_settings
  add column if not exists instagram_username text not null default '';

alter table public.company_instagram_settings
  add column if not exists token_expires_at timestamptz;

alter table public.company_instagram_settings
  add column if not exists connection_status text not null default 'not_connected';

alter table public.company_instagram_settings
  add column if not exists connection_last_error text not null default '';

alter table public.company_instagram_settings
  add column if not exists webhook_subscription_status text not null default '';

alter table public.company_instagram_settings
  add column if not exists webhook_subscription_error text not null default '';

alter table public.company_messenger_settings
  add column if not exists page_name text not null default '';

alter table public.company_messenger_settings
  add column if not exists token_expires_at timestamptz;

alter table public.company_messenger_settings
  add column if not exists connection_status text not null default 'not_connected';

alter table public.company_messenger_settings
  add column if not exists connection_last_error text not null default '';

alter table public.company_messenger_settings
  add column if not exists webhook_subscription_status text not null default '';

alter table public.company_messenger_settings
  add column if not exists webhook_subscription_error text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_instagram_settings_oauth_mode_check'
  ) then
    alter table public.company_instagram_settings
      add constraint company_instagram_settings_oauth_mode_check
      check (oauth_mode in ('page_linked', 'instagram_login'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'company_instagram_settings_connection_status_check'
  ) then
    alter table public.company_instagram_settings
      add constraint company_instagram_settings_connection_status_check
      check (connection_status in (
        'connected',
        'not_connected',
        'connection_expired',
        'reauthorization_required',
        'webhook_subscription_failed'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'company_messenger_settings_connection_status_check'
  ) then
    alter table public.company_messenger_settings
      add constraint company_messenger_settings_connection_status_check
      check (connection_status in (
        'connected',
        'not_connected',
        'connection_expired',
        'reauthorization_required',
        'webhook_subscription_failed'
      ));
  end if;
end $$;

comment on column public.company_instagram_settings.oauth_mode is
  'page_linked = Facebook Page-linked IG (legacy); instagram_login = Instagram API with Instagram Login';

comment on column public.company_instagram_settings.connection_status is
  'Tenant-facing connection lifecycle status for Settings UI';
