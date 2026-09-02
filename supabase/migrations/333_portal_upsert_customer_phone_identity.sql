/**
 * Phase D5.4 Gap 1 — Atomic portal customer upsert with optional phone identity.
 *
 * Extends portal_upsert_customer to write phone + identity columns in one INSERT.
 * Does not rewrite customers.phone or identity on existing matches.
 * Does not invent country from company/locale.
 *
 * Backward compatible: identity params default to NULL.
 */
-- Drop public wrapper (7-arg) so we can recreate with optional identity args.
drop function if exists public.portal_upsert_customer(
  uuid, text, text, text, uuid, text, boolean
);

-- Internal implementation (schema-boundary pattern from migration 289).
drop function if exists internal.portal_upsert_customer(
  uuid, text, text, text, uuid, text, boolean
);

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
  v_owner uuid := p_owner_user_id;
  v_phone_e164 text := nullif(btrim(coalesce(p_phone_e164, '')), '');
  v_phone_iso text := nullif(upper(btrim(coalesce(p_phone_country_iso, ''))), '');
  v_phone_source text := nullif(btrim(coalesce(p_phone_region_source, '')), '');
  v_phone_national text := nullif(btrim(coalesce(p_phone_national, '')), '');
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  -- Server-side identity validation (nullable = unresolved / empty).
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
  else
    -- Existing match: preserve phone + identity (name/email/prefs only).
    update public.customers
    set name = p_name,
        email = coalesce(p_email, email),
        updated_at = now()
    where id = v_customer_id
      and company_id = p_company_id;
  end if;

  insert into public.customer_communication_preferences (
    company_id, customer_id, language, receive_marketing
  ) values (
    p_company_id, v_customer_id, coalesce(p_preferred_language, 'en'), p_marketing_consent
  )
  on conflict (company_id, customer_id) do update
  set language = excluded.language,
      receive_marketing = excluded.receive_marketing,
      updated_at = now();

  return v_customer_id;
end;
$$;

create or replace function public.portal_upsert_customer(
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
language sql
security definer
set search_path = public, internal
as $w$
  select internal.portal_upsert_customer(
    p_company_id,
    p_name,
    p_email,
    p_phone,
    p_owner_user_id,
    p_preferred_language,
    p_marketing_consent,
    p_phone_e164,
    p_phone_country_iso,
    p_phone_region_source,
    p_phone_national
  );
$w$;

revoke all on function public.portal_upsert_customer(
  uuid, text, text, text, uuid, text, boolean, text, text, text, text
) from public;
revoke all on function internal.portal_upsert_customer(
  uuid, text, text, text, uuid, text, boolean, text, text, text, text
) from public;

grant execute on function public.portal_upsert_customer(
  uuid, text, text, text, uuid, text, boolean, text, text, text, text
) to service_role, authenticated, anon;
grant execute on function internal.portal_upsert_customer(
  uuid, text, text, text, uuid, text, boolean, text, text, text, text
) to service_role, authenticated, anon;
