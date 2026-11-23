-- Meta OAuth safeguards (local-first): durable pending sessions + credential source.
-- Additive only. Does not rotate tokens or change Production flags.

-- Durable, company-scoped pending OAuth page/session payload (multi-instance safe).
create table if not exists public.meta_oauth_pending_sessions (
  state_hash text primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  flow text not null,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint meta_oauth_pending_sessions_flow_check
    check (flow in ('messenger_facebook_login', 'instagram_login', 'meta_pages_oauth'))
);

create index if not exists idx_meta_oauth_pending_sessions_company
  on public.meta_oauth_pending_sessions (company_id);

create index if not exists idx_meta_oauth_pending_sessions_expires
  on public.meta_oauth_pending_sessions (expires_at);

alter table public.meta_oauth_pending_sessions enable row level security;

revoke all on table public.meta_oauth_pending_sessions from public;
revoke all on table public.meta_oauth_pending_sessions from anon;
revoke all on table public.meta_oauth_pending_sessions from authenticated;
grant all on table public.meta_oauth_pending_sessions to service_role;

comment on table public.meta_oauth_pending_sessions is
  'Short-lived Meta OAuth pending page/token payloads keyed by HMAC state hash; service_role only.';

-- Messenger: distinguish manual vs OAuth-managed credentials.
alter table public.company_messenger_settings
  add column if not exists credential_source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_messenger_settings_credential_source_check'
  ) then
    alter table public.company_messenger_settings
      add constraint company_messenger_settings_credential_source_check
      check (credential_source in ('manual', 'oauth'));
  end if;
end $$;

comment on column public.company_messenger_settings.credential_source is
  'manual = pasted/settings form credentials; oauth = Meta Facebook Login self-service.';

-- Instagram: same credential_source (oauth_mode remains for login product variant).
alter table public.company_instagram_settings
  add column if not exists credential_source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_instagram_settings_credential_source_check'
  ) then
    alter table public.company_instagram_settings
      add constraint company_instagram_settings_credential_source_check
      check (credential_source in ('manual', 'oauth'));
  end if;
end $$;

-- Backfill: Instagram Login rows are OAuth-managed.
update public.company_instagram_settings
set credential_source = 'oauth'
where oauth_mode = 'instagram_login'
  and credential_source = 'manual';

comment on column public.company_instagram_settings.credential_source is
  'manual = pasted/settings form credentials; oauth = Instagram Login or Pages OAuth.';
