-- =============================================================================
-- 365 — Email Connection + personal/company Email Identity RBAC
-- =============================================================================
-- Creates:
--   email.settings.manage          — Connection / mailbox configuration
--   email.identity.manage          — authenticated user's personal identity
--   email.identity.company.manage  — company identity/defaults
--
-- Does NOT rename/remove 363 codes (email.templates.view, email.routing.view,
-- ai.email.manage). Super Admin bypass unchanged (is_super_admin).
-- Connection RPCs accept email.settings.manage OR legacy ai.email.manage.
-- Does NOT backfill personal identity from company signature.
-- Company signature SoT remains companies.branding.email.signature.
-- =============================================================================

insert into public.permissions (code, category, module, action, description)
values
  (
    'email.settings.manage',
    'Email',
    'Email',
    'Manage',
    'Configure company mailbox connection (SMTP, IMAP, Gmail, Microsoft) and operational email settings'
  ),
  (
    'email.identity.manage',
    'Email',
    'Email',
    'Manage',
    'Edit the signed-in user personal email identity and personal signature'
  ),
  (
    'email.identity.company.manage',
    'Email',
    'Email',
    'Manage',
    'Edit company email identity defaults (logo, company sender, reply-to, company default signature)'
  )
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

update public.permissions
set
  description = 'Legacy Email Settings access. Prefer email.settings.manage and email.identity.company.manage for new grants.',
  updated_at = now()
where code = 'ai.email.manage';

insert into public.feature_definition_permissions (feature_code, permission_code)
values
  ('email_channel', 'email.settings.manage'),
  ('email_channel', 'email.identity.manage'),
  ('email_channel', 'email.identity.company.manage')
on conflict (feature_code, permission_code) do nothing;

-- Admin template: connection + company + personal
insert into public.platform_role_template_permissions (template_key, permission_code)
select 'admin', v.code
from (values
  ('email.settings.manage'),
  ('email.identity.manage'),
  ('email.identity.company.manage')
) as v(code)
where exists (select 1 from public.permissions p where p.code = v.code)
on conflict (template_key, permission_code) do nothing;

-- Employee template: personal identity only
insert into public.platform_role_template_permissions (template_key, permission_code)
select 'employee', 'email.identity.manage'
where exists (select 1 from public.permissions p where p.code = 'email.identity.manage')
on conflict (template_key, permission_code) do nothing;

-- Existing roles with ai.email.manage → grant the three new codes
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id = rp.permission_id
join public.permissions p_new on p_new.code in (
  'email.settings.manage',
  'email.identity.company.manage',
  'email.identity.manage'
)
where p_old.code = 'ai.email.manage'
on conflict do nothing;

-- Existing roles with email.view → personal identity (workspace agents)
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id = rp.permission_id
join public.permissions p_new on p_new.code = 'email.identity.manage'
where p_old.code = 'email.view'
on conflict do nothing;

-- System Admin company roles get connection + company + personal
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is not null
  and r.is_system is true
  and (
    r.name ilike '%admin%'
    or coalesce(r.description, '') ilike '%administrator%'
    or coalesce(r.template_key, '') = 'admin'
  )
  and p.code in (
    'email.settings.manage',
    'email.identity.company.manage',
    'email.identity.manage'
  )
on conflict do nothing;

-- ── Personal identity storage (no guessed backfill) ─────────────────────────

alter table public.profiles
  add column if not exists email_identity jsonb not null default '{}'::jsonb;

comment on column public.profiles.email_identity is
  'User-scoped Email Identity: senderName, senderDisplayName, signature. Company defaults remain companies.branding.email.';

create or replace function public.normalize_email_identity_payload(p_identity jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_sig jsonb;
  v_colors jsonb;
begin
  v_sig := coalesce(p_identity->'signature', '{}'::jsonb);
  v_colors := coalesce(v_sig->'colors', '{}'::jsonb);
  return jsonb_build_object(
    'senderName', coalesce(nullif(trim(coalesce(p_identity->>'senderName', '')), ''), ''),
    'senderDisplayName', coalesce(nullif(trim(coalesce(p_identity->>'senderDisplayName', '')), ''), ''),
    'signature', jsonb_build_object(
      'name', coalesce(v_sig->>'name', ''),
      'title', coalesce(v_sig->>'title', ''),
      'email', coalesce(v_sig->>'email', ''),
      'website', coalesce(v_sig->>'website', ''),
      'colors', jsonb_build_object(
        'name', coalesce(nullif(v_colors->>'name', ''), '#111827'),
        'title', coalesce(nullif(v_colors->>'title', ''), '#111827'),
        'email', coalesce(nullif(v_colors->>'email', ''), '#111827'),
        'website', coalesce(nullif(v_colors->>'website', ''), '#111827')
      )
    )
  );
end;
$$;

create or replace function public.guard_profiles_email_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_identity is not distinct from old.email_identity then
    return new;
  end if;
  if auth.role() = 'service_role' then
    new.email_identity := public.normalize_email_identity_payload(coalesce(new.email_identity, '{}'::jsonb));
    return new;
  end if;
  if new.id is distinct from auth.uid()
     and coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid) is distinct from auth.uid() then
    raise exception 'Forbidden';
  end if;
  if not (public.is_super_admin() or public.user_has_permission('email.identity.manage')) then
    raise exception 'Forbidden';
  end if;
  if octet_length(coalesce(new.email_identity, '{}'::jsonb)::text) > 16384 then
    raise exception 'email_identity payload too large';
  end if;
  new.email_identity := public.normalize_email_identity_payload(coalesce(new.email_identity, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists trg_guard_profiles_email_identity on public.profiles;
create trigger trg_guard_profiles_email_identity
  before update of email_identity on public.profiles
  for each row
  execute function public.guard_profiles_email_identity();

create or replace function public.save_my_email_identity(p_email_identity jsonb)
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
         updated_at = now()
   where id = auth.uid()
      or user_id = auth.uid();
  if not found then
    raise exception 'Forbidden';
  end if;
  return v_identity;
end;
$$;

revoke all on function public.save_my_email_identity(jsonb) from public;
revoke all on function public.save_my_email_identity(jsonb) from anon;
grant execute on function public.save_my_email_identity(jsonb) to authenticated, service_role;

-- ── Company email identity (patches branding.email + logos.email only) ──────

create or replace function public.save_company_email_identity(
  p_company_id uuid,
  p_email jsonb,
  p_email_logo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_email jsonb;
  v_logos jsonb;
  v_logo text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_company_id is null then
    raise exception 'Company id is required';
  end if;
  if not (
    public.is_super_admin()
    or (
      public.current_company_id() = p_company_id
      and public.user_has_permission('email.identity.company.manage')
    )
  ) then
    raise exception 'Forbidden';
  end if;

  select coalesce(branding, '{}'::jsonb) into v_existing
  from public.companies
  where id = p_company_id;
  if not found then
    raise exception 'Forbidden';
  end if;

  v_email := coalesce(v_existing->'email', '{}'::jsonb) || coalesce(p_email, '{}'::jsonb);
  v_logos := coalesce(v_existing->'logos', '{}'::jsonb);
  if p_email_logo is not null then
    v_logo := nullif(trim(p_email_logo), '');
    if v_logo is null then
      v_logos := v_logos - 'email';
    else
      v_logos := jsonb_set(v_logos, '{email}', to_jsonb(v_logo), true);
    end if;
  end if;

  update public.companies
     set branding = v_existing || jsonb_build_object('email', v_email, 'logos', v_logos),
         updated_at = now()
   where id = p_company_id;

  return jsonb_build_object('email', v_email, 'logos', v_logos);
end;
$$;

revoke all on function public.save_company_email_identity(uuid, jsonb, text) from public;
revoke all on function public.save_company_email_identity(uuid, jsonb, text) from anon;
grant execute on function public.save_company_email_identity(uuid, jsonb, text) to authenticated, service_role;

-- ── Connection APIs/RLS: email.settings.manage OR legacy ai.email.manage ────

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
       or not (
         public.user_has_permission('email.settings.manage')
         or public.user_has_permission('ai.email.manage')
       ) then
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
       or not (
         public.user_has_permission('email.settings.manage')
         or public.user_has_permission('ai.email.manage')
       ) then
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
          and (
            public.user_has_permission('email.settings.manage')
            or public.user_has_permission('ai.email.manage')
          )
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
          and (
            public.user_has_permission('email.settings.manage')
            or public.user_has_permission('ai.email.manage')
          )
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
          and (
            public.user_has_permission('email.settings.manage')
            or public.user_has_permission('ai.email.manage')
          )
          and (
            internal.company_channel_feature_commercial_entitled(company_id, 'email_channel')
            or enabled = false
          )
        )
      )
    )
  );

-- Email logo uploads for company identity (do not require company.branding).
drop policy if exists "company_branding_storage_insert" on storage.objects;
create policy "company_branding_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-branding'
    and (storage.foldername(name))[1] in (
      select company_id::text from public.profiles where id = auth.uid()
    )
    and (
      public.is_super_admin()
      or public.user_has_permission('company.branding')
      or public.user_has_permission('email.identity.company.manage')
      or public.user_has_permission('settings.edit')
    )
  );

drop policy if exists "company_branding_storage_update" on storage.objects;
create policy "company_branding_storage_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'company-branding'
    and (storage.foldername(name))[1] in (
      select company_id::text from public.profiles where id = auth.uid()
    )
    and (
      public.is_super_admin()
      or public.user_has_permission('company.branding')
      or public.user_has_permission('email.identity.company.manage')
      or public.user_has_permission('settings.edit')
    )
  )
  with check (
    bucket_id = 'company-branding'
    and (storage.foldername(name))[1] in (
      select company_id::text from public.profiles where id = auth.uid()
    )
    and (
      public.is_super_admin()
      or public.user_has_permission('company.branding')
      or public.user_has_permission('email.identity.company.manage')
      or public.user_has_permission('settings.edit')
    )
  );

drop policy if exists "company_branding_storage_delete" on storage.objects;
create policy "company_branding_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'company-branding'
    and (storage.foldername(name))[1] in (
      select company_id::text from public.profiles where id = auth.uid()
    )
    and (
      public.is_super_admin()
      or public.user_has_permission('company.branding')
      or public.user_has_permission('email.identity.company.manage')
      or public.user_has_permission('settings.edit')
    )
  );

do $$
declare
  v_missing integer;
begin
  select count(*)::int into v_missing
  from (
    values ('email.settings.manage'), ('email.identity.manage'), ('email.identity.company.manage')
  ) as required(code)
  where not exists (select 1 from public.permissions p where p.code = required.code);

  if v_missing <> 0 then
    raise exception '365 fail-closed: missing Email Identity permission catalog rows';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'email_identity'
  ) then
    raise exception '365 fail-closed: profiles.email_identity column missing';
  end if;

  if to_regprocedure('public.save_my_email_identity(jsonb)') is null then
    raise exception '365 fail-closed: save_my_email_identity missing';
  end if;

  if to_regprocedure('public.save_company_email_identity(uuid,jsonb,text)') is null then
    raise exception '365 fail-closed: save_company_email_identity missing';
  end if;
end $$;
