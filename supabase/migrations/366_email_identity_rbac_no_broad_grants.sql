-- =============================================================================
-- 366 — Retract 365 role/template grants; Connection = email.settings.manage
-- =============================================================================
-- 365 created the three Email Identity catalog codes and storage (keep those).
-- 365 also seeded platform templates and backfilled existing roles. Retract
-- those assignments: permissions stay in the catalog, unassigned, until an
-- operator grants them explicitly. Super Admin remains fully functional via
-- is_super_admin() / user_has_permission bypass. Migration 363 codes and the
-- ValueOR DEFAULT Admin tab grants from 364 are not removed.
-- ValueOR UUID preservation assert is Production-specific: soft-skips when that
-- historical company/role is absent (clean active-chain replay).
--
-- Connection RPCs/RLS require email.settings.manage only (no ai.email.manage OR).
-- =============================================================================

-- Restore 363 Settings-tab description (do not treat it as a removed permission).
update public.permissions
set
  description = 'Open the Email Workspace Settings tab. Mailbox connection requires email.settings.manage. Personal identity requires email.identity.manage. Company identity requires email.identity.company.manage.',
  updated_at = now()
where code = 'ai.email.manage';

delete from public.platform_role_template_permissions
where permission_code in (
  'email.settings.manage',
  'email.identity.manage',
  'email.identity.company.manage'
);

delete from public.role_permissions rp
using public.permissions p
where rp.permission_id = p.id
  and p.code in (
    'email.settings.manage',
    'email.identity.manage',
    'email.identity.company.manage'
  );

-- Owner-scoped personal save: own profile only + optional job_title (profiles.job_title).
drop function if exists public.save_my_email_identity(jsonb);
drop function if exists public.save_my_email_identity(jsonb, text);

create function public.save_my_email_identity(
  p_email_identity jsonb,
  p_job_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (public.is_super_admin() or public.user_has_permission('email.identity.manage')) then
    raise exception 'Forbidden';
  end if;
  if octet_length(coalesce(p_email_identity, '{}'::jsonb)::text) > 16384 then
    raise exception 'email_identity payload too large';
  end if;
  v_identity := public.normalize_email_identity_payload(coalesce(p_email_identity, '{}'::jsonb));
  update public.profiles
     set email_identity = v_identity,
         job_title = case
           when p_job_title is null then job_title
           else nullif(btrim(p_job_title), '')
         end,
         updated_at = now()
   where (id = auth.uid() or user_id = auth.uid())
     and (
       public.is_super_admin()
       or company_id is not distinct from public.current_company_id()
     );
  if not found then
    raise exception 'Forbidden';
  end if;
  return v_identity;
end;
$$;

revoke all on function public.save_my_email_identity(jsonb, text) from public;
revoke all on function public.save_my_email_identity(jsonb, text) from anon;
grant execute on function public.save_my_email_identity(jsonb, text) to authenticated, service_role;

-- ── Connection APIs/RLS: email.settings.manage only ─────────────────────────

create or replace function public.get_company_email_settings(p_company_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path to public, internal
as $$
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    if p_company_id is distinct from public.current_company_id()
       or not public.user_has_permission('email.settings.manage') then
      raise exception 'Forbidden';
    end if;
  end if;
  return internal.get_company_email_settings(p_company_id);
end;
$$;

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
  p_inbound_provider text default 'imap'::text,
  p_outbound_provider text default 'smtp'::text,
  p_imap_host text default ''::text,
  p_imap_port integer default 993,
  p_imap_username text default ''::text,
  p_imap_password text default ''::text,
  p_imap_encryption text default 'ssl'::text,
  p_reply_to_email text default ''::text,
  p_max_attachment_bytes bigint default 26214400,
  p_imap_mailbox text default 'INBOX'::text,
  p_imap_poll_interval_seconds integer default 60,
  p_oauth_provider text default null::text,
  p_oauth_token text default ''::text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path to public, internal
as $$
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    if p_company_id is distinct from public.current_company_id()
       or not public.user_has_permission('email.settings.manage') then
      raise exception 'Forbidden';
    end if;
  end if;
  return internal.upsert_company_email_settings(
    p_company_id,
    p_enabled,
    p_smtp_host,
    p_smtp_port,
    p_smtp_username,
    p_smtp_password,
    p_smtp_encryption,
    p_from_email,
    p_from_name,
    p_max_retry_count,
    p_conversation_enabled,
    p_inbound_provider,
    p_outbound_provider,
    p_imap_host,
    p_imap_port,
    p_imap_username,
    p_imap_password,
    p_imap_encryption,
    p_reply_to_email,
    p_max_attachment_bytes,
    p_imap_mailbox,
    p_imap_poll_interval_seconds,
    p_oauth_provider,
    p_oauth_token
  );
end;
$$;

revoke all on function public.get_company_email_settings(uuid) from public;
revoke all on function public.get_company_email_settings(uuid) from anon;
grant execute on function public.get_company_email_settings(uuid) to authenticated, service_role;

revoke all on function public.upsert_company_email_settings(
  uuid, boolean, text, integer, text, text, text, text, text, integer, boolean, text, text, text, integer, text, text, text, text, bigint, text, integer, text, text
) from public;
revoke all on function public.upsert_company_email_settings(
  uuid, boolean, text, integer, text, text, text, text, text, integer, boolean, text, text, text, integer, text, text, text, text, bigint, text, integer, text, text
) from anon;
grant execute on function public.upsert_company_email_settings(
  uuid, boolean, text, integer, text, text, text, text, text, integer, boolean, text, text, text, integer, text, text, text, text, bigint, text, integer, text, text
) to authenticated, service_role;

drop policy if exists company_email_settings_select on public.company_email_settings;
create policy company_email_settings_select
  on public.company_email_settings for select
  using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (
        public.is_super_admin()
        or (
          company_id = public.current_company_id()
          and public.user_has_permission('email.settings.manage')
          and internal.company_channel_feature_commercial_entitled(company_id, 'email_channel')
        )
      )
    )
  );

drop policy if exists company_email_settings_upsert on public.company_email_settings;
create policy company_email_settings_upsert
  on public.company_email_settings for all
  using (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (
        public.is_super_admin()
        or (
          company_id = public.current_company_id()
          and public.user_has_permission('email.settings.manage')
          and (
            internal.company_channel_feature_commercial_entitled(company_id, 'email_channel')
            or enabled = false
          )
        )
      )
    )
  )
  with check (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and (
        public.is_super_admin()
        or (
          company_id = public.current_company_id()
          and public.user_has_permission('email.settings.manage')
          and (
            internal.company_channel_feature_commercial_entitled(company_id, 'email_channel')
            or enabled = false
          )
        )
      )
    )
  );

do $$
declare
  v_grants integer;
  v_templates integer;
  v_missing_tabs integer;
  v_admin uuid;
begin
  if not exists (select 1 from public.permissions where code = 'email.settings.manage')
     or not exists (select 1 from public.permissions where code = 'email.identity.manage')
     or not exists (select 1 from public.permissions where code = 'email.identity.company.manage') then
    raise exception '366 fail-closed: Email Identity catalog codes missing';
  end if;

  select count(*)::int into v_grants
  from public.role_permissions rp
  join public.permissions p on p.id = rp.permission_id
  where p.code in (
    'email.settings.manage',
    'email.identity.manage',
    'email.identity.company.manage'
  );
  if v_grants <> 0 then
    raise exception '366 fail-closed: expected 0 role grants for new Email Identity codes, found %', v_grants;
  end if;

  select count(*)::int into v_templates
  from public.platform_role_template_permissions
  where permission_code in (
    'email.settings.manage',
    'email.identity.manage',
    'email.identity.company.manage'
  );
  if v_templates <> 0 then
    raise exception '366 fail-closed: expected 0 template grants for new Email Identity codes, found %', v_templates;
  end if;

  select r.id into v_admin
  from public.roles r
  where r.company_id = '2d27f7fb-c15e-4d60-84e9-1793f36f2172'::uuid
    and r.role_type = 'DEFAULT'
    and r.template_key = 'admin';
  if v_admin is null then
    -- Historical ValueOR platform company/role is Production-specific and is not
    -- created by the canonical active migration chain. Soft-skip on clean replay.
    raise notice
      '366 soft-skip: ValueOR DEFAULT Admin role not present; 363 tab preservation check skipped on clean replay';
  else
    select count(*)::int into v_missing_tabs
    from (
      values ('email.templates.view'), ('email.routing.view'), ('ai.email.manage')
    ) as required(code)
    where not exists (
      select 1
      from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id
      where rp.role_id = v_admin
        and p.code = required.code
    );
    if v_missing_tabs <> 0 then
      raise exception '366 fail-closed: ValueOR DEFAULT Admin missing % migration-363 tab permission(s)', v_missing_tabs;
    end if;
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_company_email_settings', 'upsert_company_email_settings')
      and pg_get_functiondef(p.oid) like '%ai.email.manage%'
  ) then
    raise exception '366 fail-closed: Connection RPCs still accept ai.email.manage';
  end if;
end $$;
