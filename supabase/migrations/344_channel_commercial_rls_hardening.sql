-- =============================================================================
-- 344 — Channel commercial RLS hardening (B1.2 Part 2)
-- =============================================================================
-- Closes DB bypass: channel registry + credential tables previously allowed
-- tenant/admin RBAC without per-channel commercial entitlement.
--
-- Does NOT depend on migration 343 (permission mappings). Uses
-- internal.is_feature_enabled / feature_definitions SoT directly.
--
-- Does NOT:
--   - grant company entitlements
--   - use omnichannel as transport authorization
--   - modify runtime routing/webhooks/pipelines
-- =============================================================================

-- ── 1. Channel key → commercial feature resolver (canonical) ─────────────────

create or replace function internal.resolve_channel_commercial_feature_code(p_channel_key text)
returns text
language sql
immutable
set search_path to internal, public
as $$
  select case lower(trim(coalesce(p_channel_key, '')))
    when 'whatsapp' then 'whatsapp_channel'
    when 'messenger' then 'facebook_channel'
    when 'facebook' then 'facebook_channel'
    when 'instagram' then 'instagram_channel'
    when 'email' then 'email_channel'
    when 'sms' then 'sms_channel'
    else null
  end;
$$;

comment on function internal.resolve_channel_commercial_feature_code(text) is
  'Maps communication_channels.key to sellable feature_definitions.code. NULL for non-sellable/unknown keys.';

create or replace function internal.is_noncommercial_channel_catalog_key(p_channel_key text)
returns boolean
language sql
immutable
set search_path to internal, public
as $$
  select lower(trim(coalesce(p_channel_key, ''))) = 'web_chat';
$$;

create or replace function internal.is_sellable_channel_catalog_key(p_channel_key text)
returns boolean
language sql
immutable
set search_path to internal, public
as $$
  select internal.resolve_channel_commercial_feature_code(p_channel_key) is not null;
$$;

create or replace function internal.company_channel_key_commercial_entitled(
  p_company_id uuid,
  p_channel_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path to internal, public
as $$
declare
  v_feature text;
begin
  if p_company_id is null then
    return false;
  end if;

  if internal.is_noncommercial_channel_catalog_key(p_channel_key) then
    return true;
  end if;

  v_feature := internal.resolve_channel_commercial_feature_code(p_channel_key);
  if v_feature is null then
    return false;
  end if;

  return internal.is_feature_enabled(p_company_id, v_feature);
end;
$$;

comment on function internal.company_channel_key_commercial_entitled(uuid, text) is
  'Transport commercial gate for a channel catalog key. Fail-closed for unknown/sellable-without-grant. web_chat is RBAC-only.';

create or replace function internal.company_channel_id_commercial_entitled(
  p_company_id uuid,
  p_channel_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to internal, public
as $$
  select internal.company_channel_key_commercial_entitled(
    p_company_id,
    (
      select ch.key
      from public.communication_channels ch
      where ch.id = p_channel_id
      limit 1
    )
  );
$$;

create or replace function public.company_channel_id_commercial_entitled(
  p_company_id uuid,
  p_channel_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path to public, internal
as $$
  select internal.company_channel_id_commercial_entitled(p_company_id, p_channel_id);
$$;

revoke all on function public.company_channel_id_commercial_entitled(uuid, uuid) from public;
grant execute on function public.company_channel_id_commercial_entitled(uuid, uuid) to authenticated, service_role;

create or replace function internal.company_channel_feature_commercial_entitled(
  p_company_id uuid,
  p_feature_code text
)
returns boolean
language sql
stable
security definer
set search_path to internal, public
as $$
  select
    p_company_id is not null
    and p_feature_code is not null
    and trim(p_feature_code) <> ''
    and internal.is_feature_enabled(p_company_id, p_feature_code);
$$;

revoke all on function internal.resolve_channel_commercial_feature_code(text) from public;
revoke all on function internal.is_noncommercial_channel_catalog_key(text) from public;
revoke all on function internal.is_sellable_channel_catalog_key(text) from public;
revoke all on function internal.company_channel_key_commercial_entitled(uuid, text) from public;
revoke all on function internal.company_channel_id_commercial_entitled(uuid, uuid) from public;
revoke all on function internal.company_channel_feature_commercial_entitled(uuid, text) from public;

grant execute on function internal.resolve_channel_commercial_feature_code(text) to authenticated, service_role;
grant execute on function internal.is_noncommercial_channel_catalog_key(text) to authenticated, service_role;
grant execute on function internal.is_sellable_channel_catalog_key(text) to authenticated, service_role;
grant execute on function internal.company_channel_key_commercial_entitled(uuid, text) to authenticated, service_role;
grant execute on function internal.company_channel_id_commercial_entitled(uuid, uuid) to authenticated, service_role;
grant execute on function internal.company_channel_feature_commercial_entitled(uuid, text) to authenticated, service_role;

-- ── 2. company_channels — commercial on mutations, metadata SELECT preserved ─

drop policy if exists company_channels_insert on public.company_channels;
create policy company_channels_insert
  on public.company_channels for insert
  with check (
    auth.role() = 'authenticated'
    and deleted_at is null
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('channels.manage')
        and public.company_channel_id_commercial_entitled(company_id, channel_id)
      )
    )
  );

drop policy if exists company_channels_update on public.company_channels;
create policy company_channels_update
  on public.company_channels for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('channels.manage')
        and (
          public.company_channel_id_commercial_entitled(company_id, channel_id)
          or is_enabled = false
          or deleted_at is not null
        )
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.user_has_permission('channels.manage')
        and (
          public.company_channel_id_commercial_entitled(company_id, channel_id)
          or is_enabled = false
          or deleted_at is not null
        )
      )
    )
  );

-- SELECT + DELETE policies unchanged from 111/013 (metadata visibility + hard-delete blocked).

-- ── 3. Credential / settings tables ─────────────────────────────────────────

drop policy if exists company_whatsapp_settings_select on public.company_whatsapp_settings;
create policy company_whatsapp_settings_select
  on public.company_whatsapp_settings for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
        and internal.company_channel_feature_commercial_entitled(company_id, 'whatsapp_channel')
      )
    )
  );

drop policy if exists company_whatsapp_settings_upsert on public.company_whatsapp_settings;
create policy company_whatsapp_settings_upsert
  on public.company_whatsapp_settings for all
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
        and (
          internal.company_channel_feature_commercial_entitled(company_id, 'whatsapp_channel')
          or enabled = false
        )
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
        and (
          internal.company_channel_feature_commercial_entitled(company_id, 'whatsapp_channel')
          or enabled = false
        )
      )
    )
  );

drop policy if exists company_email_settings_select on public.company_email_settings;
create policy company_email_settings_select
  on public.company_email_settings for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
        and internal.company_channel_feature_commercial_entitled(company_id, 'email_channel')
      )
    )
  );

drop policy if exists company_email_settings_upsert on public.company_email_settings;
create policy company_email_settings_upsert
  on public.company_email_settings for all
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
        and (
          internal.company_channel_feature_commercial_entitled(company_id, 'email_channel')
          or enabled = false
        )
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
        and (
          internal.company_channel_feature_commercial_entitled(company_id, 'email_channel')
          or enabled = false
        )
      )
    )
  );

drop policy if exists company_messenger_settings_select on public.company_messenger_settings;
create policy company_messenger_settings_select
  on public.company_messenger_settings for select
  using (
    auth.role() in ('authenticated', 'service_role')
    and (
      auth.role() = 'service_role'
      or public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.whatsapp_settings_can_manage(company_id)
        and internal.company_channel_feature_commercial_entitled(company_id, 'facebook_channel')
      )
    )
  );

drop policy if exists company_messenger_settings_upsert on public.company_messenger_settings;
create policy company_messenger_settings_upsert
  on public.company_messenger_settings for all
  using (
    auth.role() in ('authenticated', 'service_role')
    and (
      auth.role() = 'service_role'
      or public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.whatsapp_settings_can_manage(company_id)
        and (
          internal.company_channel_feature_commercial_entitled(company_id, 'facebook_channel')
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
          internal.company_channel_feature_commercial_entitled(company_id, 'facebook_channel')
          or enabled = false
        )
      )
    )
  );

drop policy if exists company_instagram_settings_select on public.company_instagram_settings;
create policy company_instagram_settings_select
  on public.company_instagram_settings for select
  using (
    auth.role() in ('authenticated', 'service_role')
    and (
      auth.role() = 'service_role'
      or public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.whatsapp_settings_can_manage(company_id)
        and internal.company_channel_feature_commercial_entitled(company_id, 'instagram_channel')
      )
    )
  );

drop policy if exists company_instagram_settings_upsert on public.company_instagram_settings;
create policy company_instagram_settings_upsert
  on public.company_instagram_settings for all
  using (
    auth.role() in ('authenticated', 'service_role')
    and (
      auth.role() = 'service_role'
      or public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.whatsapp_settings_can_manage(company_id)
        and (
          internal.company_channel_feature_commercial_entitled(company_id, 'instagram_channel')
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
          internal.company_channel_feature_commercial_entitled(company_id, 'instagram_channel')
          or enabled = false
        )
      )
    )
  );

-- ── 4. Invariants ─────────────────────────────────────────────────────────────

do $$
declare
  v_policies integer;
begin
  select count(*)::int into v_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'company_channels',
      'company_whatsapp_settings',
      'company_email_settings',
      'company_messenger_settings',
      'company_instagram_settings'
    )
    and policyname in (
      'company_channels_insert',
      'company_channels_update',
      'company_whatsapp_settings_select',
      'company_whatsapp_settings_upsert',
      'company_email_settings_select',
      'company_email_settings_upsert',
      'company_messenger_settings_select',
      'company_messenger_settings_upsert',
      'company_instagram_settings_select',
      'company_instagram_settings_upsert'
    );

  if v_policies <> 10 then
    raise exception '344 fail-closed: expected 10 channel commercial policies, found %', v_policies;
  end if;
end $$;
