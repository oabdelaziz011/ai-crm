-- =============================================================================
-- 397 — Portal public RPC + public-read hardening (Web Presence Phase 0)
-- =============================================================================
-- S1  portal_upsert_customer (anon-executable):
--     - untrusted callers (anon / other-tenant) require an enabled portal for a
--       non-suspended company; one generic error for every unavailable case
--     - p_owner_user_id is honored only when it is an active profile of
--       p_company_id (otherwise the existing company-owner fallback is used)
--     - untrusted callers never overwrite an existing customer's name, email,
--       or communication preferences (fill blank email only)
--     - same-tenant staff / super admin / service_role keep prior behavior
-- S2  portal_resolve_customer_by_phone:
--     - no anon execute; same-tenant staff / super admin / service_role only
--     - no staff user id (owner_user_id) in the response
-- S6  portal_settings_public_read:
--     - enabled portals of Suspended companies are no longer publicly readable
--
-- Signatures unchanged. No portal tables, slugs, or booking flows changed.
-- =============================================================================

create or replace function internal.company_publicly_unlocked(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_company_id is not null
    and exists (
      select 1
      from public.companies c
      where c.id = p_company_id
        and c.status is distinct from 'Suspended'
    );
$$;

comment on function internal.company_publicly_unlocked(uuid) is
  'Public-surface suspension gate: true only for an existing, non-Suspended company. No super-admin bypass.';

revoke all on function internal.company_publicly_unlocked(uuid) from public;
grant execute on function internal.company_publicly_unlocked(uuid) to anon, authenticated, service_role;

create or replace function internal.portal_company_publicly_available(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select internal.company_publicly_unlocked(p_company_id)
    and exists (
      select 1
      from public.customer_portal_settings s
      where s.company_id = p_company_id
        and s.enabled = true
    );
$$;

comment on function internal.portal_company_publicly_available(uuid) is
  'True when the company has an enabled customer portal and is not Suspended.';

revoke all on function internal.portal_company_publicly_available(uuid) from public;
grant execute on function internal.portal_company_publicly_available(uuid) to anon, authenticated, service_role;

-- ── S6 ───────────────────────────────────────────────────────────────────────

drop policy if exists portal_settings_public_read on public.customer_portal_settings;
create policy portal_settings_public_read on public.customer_portal_settings for select
  using (enabled = true and internal.company_publicly_unlocked(company_id));

-- ── S1 ───────────────────────────────────────────────────────────────────────

create or replace function internal.portal_upsert_customer(
  p_company_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_owner_user_id uuid,
  p_preferred_language text default 'en',
  p_marketing_consent boolean default false,
  p_phone_e164 text default null,
  p_phone_country_iso text default null,
  p_phone_region_source text default null,
  p_phone_national text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_owner uuid;
  v_trusted boolean;
  v_phone_e164 text := nullif(btrim(coalesce(p_phone_e164, '')), '');
  v_phone_iso text := nullif(upper(btrim(coalesce(p_phone_country_iso, ''))), '');
  v_phone_source text := nullif(btrim(coalesce(p_phone_region_source, '')), '');
  v_phone_national text := nullif(btrim(coalesce(p_phone_national, '')), '');
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  v_trusted :=
    auth.role() = 'service_role'
    or public.is_super_admin()
    or (
      auth.role() = 'authenticated'
      and public.current_company_id() = p_company_id
      and internal.company_publicly_unlocked(p_company_id)
    );

  if not v_trusted and not internal.portal_company_publicly_available(p_company_id) then
    raise exception 'Portal unavailable';
  end if;

  if v_phone_e164 is not null and v_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid phone_e164 format';
  end if;
  if v_phone_iso is not null and v_phone_iso !~ '^[A-Z]{2}$' then
    raise exception 'invalid phone_country_iso format';
  end if;
  if v_phone_source is not null
     and v_phone_source not in ('explicit', 'e164', 'channel', 'import', 'unresolved') then
    raise exception 'invalid phone_region_source';
  end if;

  if p_owner_user_id is not null then
    select coalesce(p.user_id, p.id) into v_owner
    from public.profiles p
    where (p.id = p_owner_user_id or p.user_id = p_owner_user_id)
      and p.company_id = p_company_id
      and coalesce(p.is_active, true) = true
    limit 1;
  end if;

  if v_owner is null then
    select coalesce(p.user_id, p.id) into v_owner
    from public.profiles p
    where p.company_id = p_company_id and coalesce(p.is_active, true) = true
    limit 1;
  end if;
  if v_owner is null then
    raise exception 'No company owner found for customer creation';
  end if;

  select id into v_customer_id
  from public.customers
  where phone = p_phone
    and company_id = p_company_id
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      user_id,
      company_id,
      name,
      email,
      phone,
      phone_e164,
      phone_country_iso,
      phone_region_source,
      phone_national
    )
    values (
      v_owner,
      p_company_id,
      p_name,
      p_email,
      p_phone,
      v_phone_e164,
      v_phone_iso,
      v_phone_source,
      v_phone_national
    )
    returning id into v_customer_id;

    insert into public.customer_communication_preferences (
      company_id, customer_id, language, receive_marketing
    ) values (
      p_company_id, v_customer_id, coalesce(p_preferred_language, 'en'), p_marketing_consent
    )
    on conflict (company_id, customer_id) do nothing;

    return v_customer_id;
  end if;

  if v_trusted then
    update public.customers
    set name = p_name,
        email = coalesce(p_email, email),
        updated_at = now()
    where id = v_customer_id
      and company_id = p_company_id;

    insert into public.customer_communication_preferences (
      company_id, customer_id, language, receive_marketing
    ) values (
      p_company_id, v_customer_id, coalesce(p_preferred_language, 'en'), p_marketing_consent
    )
    on conflict (company_id, customer_id) do update
    set language = excluded.language,
        receive_marketing = excluded.receive_marketing,
        updated_at = now();
  else
    -- Unverified public caller: phone match must not rewrite existing CRM identity.
    update public.customers
    set email = p_email,
        updated_at = now()
    where id = v_customer_id
      and company_id = p_company_id
      and nullif(btrim(coalesce(email, '')), '') is null
      and nullif(btrim(coalesce(p_email, '')), '') is not null;

    insert into public.customer_communication_preferences (
      company_id, customer_id, language, receive_marketing
    ) values (
      p_company_id, v_customer_id, coalesce(p_preferred_language, 'en'), p_marketing_consent
    )
    on conflict (company_id, customer_id) do nothing;
  end if;

  return v_customer_id;
end;
$$;

revoke all on function internal.portal_upsert_customer(
  uuid, text, text, text, uuid, text, boolean, text, text, text, text
) from public;
grant execute on function internal.portal_upsert_customer(
  uuid, text, text, text, uuid, text, boolean, text, text, text, text
) to service_role, authenticated, anon;

-- ── S2 ───────────────────────────────────────────────────────────────────────

create or replace function public.portal_resolve_customer_by_phone(
  p_company_id uuid,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not (
    auth.role() = 'service_role'
    or public.is_super_admin()
    or (
      auth.role() = 'authenticated'
      and public.current_company_id() = p_company_id
      and internal.company_publicly_unlocked(p_company_id)
    )
  ) then
    raise exception 'Forbidden';
  end if;

  select id into v_customer_id
  from public.customers
  where phone = p_phone
    and company_id = p_company_id
  limit 1;

  if v_customer_id is not null then
    return jsonb_build_object('customer_id', v_customer_id, 'exists', true);
  end if;

  return jsonb_build_object('customer_id', null, 'exists', false);
end;
$$;

revoke all on function public.portal_resolve_customer_by_phone(uuid, text) from public;
revoke all on function public.portal_resolve_customer_by_phone(uuid, text) from anon;
grant execute on function public.portal_resolve_customer_by_phone(uuid, text) to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.portal_resolve_customer_by_phone(uuid, text)', 'execute') then
    raise exception '397 fail-closed: anon can still execute portal_resolve_customer_by_phone';
  end if;
  if to_regprocedure('internal.portal_company_publicly_available(uuid)') is null then
    raise exception '397 fail-closed: portal_company_publicly_available missing';
  end if;
end $$;
