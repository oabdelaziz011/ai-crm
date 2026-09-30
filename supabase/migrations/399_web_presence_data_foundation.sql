-- =============================================================================
-- 399 — Web Presence data foundation (Phase 1, staff-only, no public exposure)
-- =============================================================================
-- Tables (company-scoped, authenticated staff RLS, suspended lock, no anon):
--   web_presence_pages         — "what is visible" config; slug stays owned by
--                                customer_portal_settings (referenced, not copied)
--   web_chat_widgets           — public widget identity on a dedicated
--                                company_channels row (provider valueor.web_widget)
--   web_chat_visitor_sessions  — visitor sessions; token stored as SHA-256 hash only
--
-- Channel foundation:
--   - dedicated rows reuse the web_chat catalog key with provider
--     'valueor.web_widget'; generic.web_chat / internal AI chat unchanged
--   - widget channel rows can never be the company default and cannot be
--     enabled/activated in this phase (no inbox, no dispatch, no public traffic)
--
-- Does NOT: create public RPCs/endpoints, grant anon anything, change the
-- web_chat catalog, channel commercial mapping, portal slug namespace, or any
-- Meta / Email / SMS behavior.
-- =============================================================================

-- ── Helpers ─────────────────────────────────────────────────────────────────

create or replace function internal.web_presence_access(
  p_company_id uuid,
  p_feature_code text,
  p_manage boolean
)
returns boolean
language sql
stable
security definer
set search_path to internal, public
as $$
  select
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        p_company_id is not null
        and public.is_feature_enabled(p_company_id, p_feature_code)
        and (
          internal.company_has_permission(p_company_id, 'web_presence.manage')
          or (
            not p_manage
            and internal.company_has_permission(p_company_id, 'web_presence.view')
          )
        )
      )
    );
$$;

comment on function internal.web_presence_access(uuid, text, boolean) is
  'Web Presence staff gate: tenant + RBAC (web_presence.view/manage) + table feature (web_presence_page / web_chat_widget). Super-admin bypass.';

revoke all on function internal.web_presence_access(uuid, text, boolean) from public, anon;
grant execute on function internal.web_presence_access(uuid, text, boolean) to authenticated, service_role;

create or replace function internal.web_chat_origin_valid(p_origin text)
returns boolean
language sql
immutable
set search_path to internal, public
as $$
  select p_origin is not null
    and char_length(p_origin) <= 253
    and (
      p_origin ~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$'
      or p_origin ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$'
    );
$$;

create or replace function internal.web_chat_origins_valid(p_origins text[])
returns boolean
language sql
immutable
set search_path to internal, public
as $$
  select coalesce(cardinality(p_origins), 0) <= 50
    and not exists (
      select 1 from unnest(coalesce(p_origins, '{}'::text[])) as o(origin)
      where not internal.web_chat_origin_valid(o.origin)
    );
$$;

revoke all on function internal.web_chat_origin_valid(text) from public, anon;
revoke all on function internal.web_chat_origins_valid(text[]) from public, anon;
grant execute on function internal.web_chat_origin_valid(text) to authenticated, service_role;
grant execute on function internal.web_chat_origins_valid(text[]) to authenticated, service_role;

create or replace function internal.web_chat_generate_public_key()
returns text
language sql
volatile
set search_path to internal, public, extensions
as $$
  select 'wcw_' || encode(extensions.gen_random_bytes(24), 'hex');
$$;

revoke all on function internal.web_chat_generate_public_key() from public, anon;
grant execute on function internal.web_chat_generate_public_key() to authenticated, service_role;

create or replace function internal.web_chat_visitor_token_hash(p_token text)
returns text
language sql
immutable
set search_path to internal, public, extensions
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

comment on function internal.web_chat_visitor_token_hash(text) is
  'SHA-256 hex of a raw visitor token. Raw tokens are never persisted.';

revoke all on function internal.web_chat_visitor_token_hash(text) from public, anon, authenticated;
grant execute on function internal.web_chat_visitor_token_hash(text) to service_role;

-- ── Dedicated widget channel guard (company_channels) ──────────────────────

create or replace function internal.guard_web_widget_company_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if tg_op = 'UPDATE'
     and old.provider is distinct from new.provider
     and (old.provider = 'valueor.web_widget' or new.provider = 'valueor.web_widget') then
    raise exception 'Web widget channel provider is immutable';
  end if;

  if new.provider is distinct from 'valueor.web_widget' then
    return new;
  end if;

  select ch.key into v_key
  from public.communication_channels ch
  where ch.id = new.channel_id;

  if v_key is distinct from 'web_chat' then
    raise exception 'Web widget channel must use the web_chat catalog key';
  end if;

  if new.is_default then
    raise exception 'Web widget channel cannot be the default company channel';
  end if;

  if new.is_enabled or new.status = 'active' then
    raise exception 'Web widget channel activation is not available';
  end if;

  return new;
end;
$$;

drop trigger if exists company_channels_guard_web_widget on public.company_channels;
create trigger company_channels_guard_web_widget
  before insert or update on public.company_channels
  for each row execute function internal.guard_web_widget_company_channel();

-- ── web_chat_widgets ────────────────────────────────────────────────────────

create table if not exists public.web_chat_widgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_channel_id uuid not null references public.company_channels(id) on delete restrict,
  public_key text not null,
  name text not null default 'Website chat',
  enabled boolean not null default false,
  allowed_origins text[] not null default '{}'::text[],
  theme jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  greeting text not null default '',
  ai_employee_id uuid references public.ai_employees(id) on delete set null,
  contact_capture_policy text not null default 'optional'
    check (contact_capture_policy in ('disabled', 'optional', 'required')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_chat_widgets_public_key_format check (public_key ~ '^wcw_[0-9a-f]{48}$'),
  constraint web_chat_widgets_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint web_chat_widgets_greeting_len check (char_length(greeting) <= 1000),
  constraint web_chat_widgets_origins_valid check (internal.web_chat_origins_valid(allowed_origins)),
  constraint web_chat_widgets_theme_object check (jsonb_typeof(theme) = 'object'),
  constraint web_chat_widgets_config_object check (jsonb_typeof(config) = 'object')
);

comment on table public.web_chat_widgets is
  'Web Presence public chat widget identity. public_key is random and public (never company_id). Staff-only in Phase 1.';

create unique index if not exists idx_web_chat_widgets_public_key
  on public.web_chat_widgets (public_key);
create unique index if not exists idx_web_chat_widgets_company_channel
  on public.web_chat_widgets (company_channel_id);
create index if not exists idx_web_chat_widgets_company
  on public.web_chat_widgets (company_id);

drop trigger if exists web_chat_widgets_updated_at on public.web_chat_widgets;
create trigger web_chat_widgets_updated_at
  before update on public.web_chat_widgets
  for each row execute function public.set_updated_at();

create or replace function internal.web_chat_widgets_guard_immutables()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.public_key := internal.web_chat_generate_public_key();
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'web_chat_widgets.company_id is immutable';
  end if;
  if new.company_channel_id is distinct from old.company_channel_id then
    raise exception 'web_chat_widgets.company_channel_id is immutable';
  end if;
  if new.public_key is distinct from old.public_key
     and current_user in ('authenticated', 'anon') then
    raise exception 'web_chat_widgets.public_key cannot be changed by clients';
  end if;
  return new;
end;
$$;

drop trigger if exists web_chat_widgets_guard_immutables on public.web_chat_widgets;
create trigger web_chat_widgets_guard_immutables
  before insert or update on public.web_chat_widgets
  for each row execute function internal.web_chat_widgets_guard_immutables();

create or replace function internal.web_chat_widgets_validate_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_company uuid;
  v_channel_key text;
  v_channel_provider text;
  v_channel_deleted timestamptz;
  v_employee_company uuid;
  v_employee_status text;
  v_employee_deleted timestamptz;
begin
  select cc.company_id, ch.key, cc.provider, cc.deleted_at
    into v_channel_company, v_channel_key, v_channel_provider, v_channel_deleted
  from public.company_channels cc
  join public.communication_channels ch on ch.id = cc.channel_id
  where cc.id = new.company_channel_id;

  if v_channel_company is null or v_channel_company is distinct from new.company_id then
    raise exception 'Widget channel must belong to the same company';
  end if;
  if v_channel_key is distinct from 'web_chat'
     or v_channel_provider is distinct from 'valueor.web_widget' then
    raise exception 'Widget channel must be a dedicated valueor.web_widget channel';
  end if;
  if v_channel_deleted is not null then
    raise exception 'Widget channel is deleted';
  end if;

  if new.ai_employee_id is not null
     and (tg_op = 'INSERT' or new.ai_employee_id is distinct from old.ai_employee_id) then
    select e.company_id, e.status, e.deleted_at
      into v_employee_company, v_employee_status, v_employee_deleted
    from public.ai_employees e
    where e.id = new.ai_employee_id;

    if v_employee_company is null or v_employee_company is distinct from new.company_id then
      raise exception 'AI Employee must belong to the same company';
    end if;
    if v_employee_deleted is not null or v_employee_status = 'archived' then
      raise exception 'AI Employee is not available';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists web_chat_widgets_validate_refs on public.web_chat_widgets;
create trigger web_chat_widgets_validate_refs
  before insert or update on public.web_chat_widgets
  for each row execute function internal.web_chat_widgets_validate_refs();

-- ── web_presence_pages ──────────────────────────────────────────────────────

create table if not exists public.web_presence_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  portal_settings_id uuid references public.customer_portal_settings(id) on delete set null,
  enabled boolean not null default false,
  published boolean not null default false,
  sections jsonb not null default '{
    "about": true,
    "services": true,
    "hours": true,
    "location": true,
    "contact": true,
    "chat": false,
    "booking": false
  }'::jsonb,
  headline_override text,
  description_override text,
  cover_image_url text,
  social_links jsonb not null default '[]'::jsonb,
  contact_form jsonb not null default '{"enabled": false}'::jsonb,
  widget_id uuid references public.web_chat_widgets(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_presence_pages_published_requires check (
    not published or (enabled and portal_settings_id is not null)
  ),
  constraint web_presence_pages_sections_object check (jsonb_typeof(sections) = 'object'),
  constraint web_presence_pages_contact_form_object check (jsonb_typeof(contact_form) = 'object'),
  constraint web_presence_pages_social_links_array check (
    jsonb_typeof(social_links) = 'array' and jsonb_array_length(social_links) <= 20
  ),
  constraint web_presence_pages_headline_len check (
    headline_override is null or char_length(headline_override) <= 160
  ),
  constraint web_presence_pages_description_len check (
    description_override is null or char_length(description_override) <= 2000
  ),
  constraint web_presence_pages_cover_url check (
    cover_image_url is null
    or (char_length(cover_image_url) <= 2048 and cover_image_url ~ '^https://')
  )
);

comment on table public.web_presence_pages is
  'Business Page visibility config. Slug is owned by customer_portal_settings (referenced via portal_settings_id). Company facts are read from source tables, not copied. Staff-only in Phase 1.';

create index if not exists idx_web_presence_pages_widget
  on public.web_presence_pages (widget_id) where widget_id is not null;

drop trigger if exists web_presence_pages_updated_at on public.web_presence_pages;
create trigger web_presence_pages_updated_at
  before update on public.web_presence_pages
  for each row execute function public.set_updated_at();

create or replace function internal.web_presence_pages_validate_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'web_presence_pages.company_id is immutable';
  end if;

  if new.portal_settings_id is not null and not exists (
    select 1 from public.customer_portal_settings s
    where s.id = new.portal_settings_id and s.company_id = new.company_id
  ) then
    raise exception 'Portal settings (slug) must belong to the same company';
  end if;

  if new.widget_id is not null and not exists (
    select 1 from public.web_chat_widgets w
    where w.id = new.widget_id and w.company_id = new.company_id
  ) then
    raise exception 'Widget must belong to the same company';
  end if;

  return new;
end;
$$;

drop trigger if exists web_presence_pages_validate_refs on public.web_presence_pages;
create trigger web_presence_pages_validate_refs
  before insert or update on public.web_presence_pages
  for each row execute function internal.web_presence_pages_validate_refs();

-- ── web_chat_visitor_sessions ───────────────────────────────────────────────

create table if not exists public.web_chat_visitor_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  widget_id uuid not null references public.web_chat_widgets(id) on delete cascade,
  token_hash text not null,
  visitor_id text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_name text,
  contact_email text,
  contact_phone text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified')),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  blocked boolean not null default false,
  blocked_reason text,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_chat_visitor_sessions_token_hash_sha256 check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint web_chat_visitor_sessions_visitor_id_len check (char_length(visitor_id) between 16 and 128),
  constraint web_chat_visitor_sessions_ip_hash_sha256 check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  constraint web_chat_visitor_sessions_ua_hash_sha256 check (
    user_agent_hash is null or user_agent_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint web_chat_visitor_sessions_contact_len check (
    (contact_name is null or char_length(contact_name) <= 200)
    and (contact_email is null or char_length(contact_email) <= 320)
    and (contact_phone is null or char_length(contact_phone) <= 32)
  ),
  constraint web_chat_visitor_sessions_blocked_reason_len check (
    blocked_reason is null or char_length(blocked_reason) <= 500
  ),
  constraint web_chat_visitor_sessions_expiry check (expires_at > created_at)
);

comment on table public.web_chat_visitor_sessions is
  'Web Chat visitor sessions. token_hash = SHA-256 of a server-issued token; raw tokens are never stored. IP/UA stored only as hashes. No customer linking.';
comment on column public.web_chat_visitor_sessions.token_hash is
  'SHA-256 hex (internal.web_chat_visitor_token_hash). Never the raw token.';

create unique index if not exists idx_web_chat_visitor_sessions_token_hash
  on public.web_chat_visitor_sessions (token_hash);
create index if not exists idx_web_chat_visitor_sessions_widget
  on public.web_chat_visitor_sessions (company_id, widget_id, last_seen_at desc);
create index if not exists idx_web_chat_visitor_sessions_conversation
  on public.web_chat_visitor_sessions (conversation_id) where conversation_id is not null;

drop trigger if exists web_chat_visitor_sessions_updated_at on public.web_chat_visitor_sessions;
create trigger web_chat_visitor_sessions_updated_at
  before update on public.web_chat_visitor_sessions
  for each row execute function public.set_updated_at();

create or replace function internal.web_chat_visitor_sessions_validate_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_widget_channel uuid;
  v_conv_company uuid;
  v_conv_channel_type text;
  v_conv_channel uuid;
begin
  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id
       or new.widget_id is distinct from old.widget_id
       or new.token_hash is distinct from old.token_hash
       or new.visitor_id is distinct from old.visitor_id then
      raise exception 'Visitor session identity columns are immutable';
    end if;
  end if;

  select w.company_channel_id into v_widget_channel
  from public.web_chat_widgets w
  where w.id = new.widget_id and w.company_id = new.company_id;

  if v_widget_channel is null then
    raise exception 'Visitor session widget must belong to the same company';
  end if;

  if new.conversation_id is not null
     and (tg_op = 'INSERT' or new.conversation_id is distinct from old.conversation_id) then
    select c.company_id, c.channel_type, c.company_channel_id
      into v_conv_company, v_conv_channel_type, v_conv_channel
    from public.conversations c
    where c.id = new.conversation_id;

    if v_conv_company is null or v_conv_company is distinct from new.company_id then
      raise exception 'Visitor session conversation must belong to the same company';
    end if;
    if v_conv_channel_type is distinct from 'web_chat'
       or v_conv_channel is distinct from v_widget_channel then
      raise exception 'Visitor session conversation must use the widget channel';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists web_chat_visitor_sessions_validate_refs on public.web_chat_visitor_sessions;
create trigger web_chat_visitor_sessions_validate_refs
  before insert or update on public.web_chat_visitor_sessions
  for each row execute function internal.web_chat_visitor_sessions_validate_refs();

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.web_presence_pages enable row level security;
alter table public.web_chat_widgets enable row level security;
alter table public.web_chat_visitor_sessions enable row level security;

revoke all on public.web_presence_pages from public, anon, authenticated;
revoke all on public.web_chat_widgets from public, anon, authenticated;
revoke all on public.web_chat_visitor_sessions from public, anon, authenticated;

grant select, insert, update, delete on public.web_presence_pages to authenticated;
grant select, insert, update, delete on public.web_chat_widgets to authenticated;
grant select on public.web_chat_visitor_sessions to authenticated;
grant update (blocked, blocked_reason) on public.web_chat_visitor_sessions to authenticated;

grant all on public.web_presence_pages to service_role;
grant all on public.web_chat_widgets to service_role;
grant all on public.web_chat_visitor_sessions to service_role;

-- web_presence_pages
drop policy if exists web_presence_pages_select on public.web_presence_pages;
create policy web_presence_pages_select on public.web_presence_pages
  for select to authenticated
  using (internal.web_presence_access(company_id, 'web_presence_page', false));

drop policy if exists web_presence_pages_insert on public.web_presence_pages;
create policy web_presence_pages_insert on public.web_presence_pages
  for insert to authenticated
  with check (internal.web_presence_access(company_id, 'web_presence_page', true));

drop policy if exists web_presence_pages_update on public.web_presence_pages;
create policy web_presence_pages_update on public.web_presence_pages
  for update to authenticated
  using (internal.web_presence_access(company_id, 'web_presence_page', true))
  with check (internal.web_presence_access(company_id, 'web_presence_page', true));

drop policy if exists web_presence_pages_delete on public.web_presence_pages;
create policy web_presence_pages_delete on public.web_presence_pages
  for delete to authenticated
  using (internal.web_presence_access(company_id, 'web_presence_page', true));

drop policy if exists rls_workspace_lock_suspended_web_presence_pages on public.web_presence_pages;
create policy rls_workspace_lock_suspended_web_presence_pages on public.web_presence_pages
  as restrictive for all to authenticated
  using (public.company_workspace_unlocked(company_id))
  with check (public.company_workspace_unlocked(company_id));

-- web_chat_widgets
drop policy if exists web_chat_widgets_select on public.web_chat_widgets;
create policy web_chat_widgets_select on public.web_chat_widgets
  for select to authenticated
  using (internal.web_presence_access(company_id, 'web_chat_widget', false));

drop policy if exists web_chat_widgets_insert on public.web_chat_widgets;
create policy web_chat_widgets_insert on public.web_chat_widgets
  for insert to authenticated
  with check (internal.web_presence_access(company_id, 'web_chat_widget', true));

drop policy if exists web_chat_widgets_update on public.web_chat_widgets;
create policy web_chat_widgets_update on public.web_chat_widgets
  for update to authenticated
  using (internal.web_presence_access(company_id, 'web_chat_widget', true))
  with check (internal.web_presence_access(company_id, 'web_chat_widget', true));

drop policy if exists web_chat_widgets_delete on public.web_chat_widgets;
create policy web_chat_widgets_delete on public.web_chat_widgets
  for delete to authenticated
  using (internal.web_presence_access(company_id, 'web_chat_widget', true));

drop policy if exists rls_workspace_lock_suspended_web_chat_widgets on public.web_chat_widgets;
create policy rls_workspace_lock_suspended_web_chat_widgets on public.web_chat_widgets
  as restrictive for all to authenticated
  using (public.company_workspace_unlocked(company_id))
  with check (public.company_workspace_unlocked(company_id));

-- web_chat_visitor_sessions (staff read + block only; inserts are service-side)
drop policy if exists web_chat_visitor_sessions_select on public.web_chat_visitor_sessions;
create policy web_chat_visitor_sessions_select on public.web_chat_visitor_sessions
  for select to authenticated
  using (internal.web_presence_access(company_id, 'web_chat_widget', false));

drop policy if exists web_chat_visitor_sessions_update on public.web_chat_visitor_sessions;
create policy web_chat_visitor_sessions_update on public.web_chat_visitor_sessions
  for update to authenticated
  using (internal.web_presence_access(company_id, 'web_chat_widget', true))
  with check (internal.web_presence_access(company_id, 'web_chat_widget', true));

drop policy if exists rls_workspace_lock_suspended_web_chat_visitor_sessions on public.web_chat_visitor_sessions;
create policy rls_workspace_lock_suspended_web_chat_visitor_sessions on public.web_chat_visitor_sessions
  as restrictive for all to authenticated
  using (public.company_workspace_unlocked(company_id))
  with check (public.company_workspace_unlocked(company_id));

-- ── Staff provisioning (dedicated channel + widget, both disabled) ─────────

create or replace function public.web_presence_provision_widget(
  p_company_id uuid,
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_catalog_id uuid;
  v_channel_id uuid;
  v_widget_id uuid;
  v_name text := coalesce(nullif(btrim(coalesce(p_name, '')), ''), 'Website chat');
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if auth.role() is distinct from 'service_role' then
    if not internal.web_presence_access(p_company_id, 'web_chat_widget', true)
       or not public.company_workspace_unlocked(p_company_id) then
      raise exception 'Forbidden';
    end if;
  end if;

  select ch.id into v_catalog_id
  from public.communication_channels ch
  where ch.key = 'web_chat' and ch.is_active = true
  limit 1;

  if v_catalog_id is null then
    raise exception 'web_chat catalog channel unavailable';
  end if;

  insert into public.company_channels (
    company_id, channel_id, display_name, status, provider, configuration, is_default, is_enabled
  ) values (
    p_company_id,
    v_catalog_id,
    left(v_name, 120),
    'pending',
    'valueor.web_widget',
    jsonb_build_object('surface', 'public_web_widget'),
    false,
    false
  )
  returning id into v_channel_id;

  insert into public.web_chat_widgets (company_id, company_channel_id, name)
  values (p_company_id, v_channel_id, left(v_name, 120))
  returning id into v_widget_id;

  return v_widget_id;
end;
$$;

revoke all on function public.web_presence_provision_widget(uuid, text) from public, anon;
grant execute on function public.web_presence_provision_widget(uuid, text) to authenticated, service_role;

do $$
begin
  if has_table_privilege('anon', 'public.web_presence_pages', 'select')
     or has_table_privilege('anon', 'public.web_chat_widgets', 'select')
     or has_table_privilege('anon', 'public.web_chat_visitor_sessions', 'select') then
    raise exception '399 fail-closed: anon has access to Web Presence tables';
  end if;
  if internal.resolve_channel_commercial_feature_code('web_chat') is not null then
    raise exception '399 fail-closed: web_chat must remain non-commercial';
  end if;
end $$;
