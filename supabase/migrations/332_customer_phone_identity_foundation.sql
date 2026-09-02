-- ============================================================
-- 332_customer_phone_identity_foundation.sql
-- Phase 2H.12 / Phase A — Global phone foundation (additive only)
--
-- Adds nullable derived phone identity columns on public.customers.
-- Fixes portal_verify_auth_challenge tenant isolation (company-scoped lookup).
--
-- DOES NOT:
-- - rewrite customers.phone
-- - backfill phone_e164 / country / region / national
-- - merge customers
-- - change preference semantics
-- - install packages / resolvers / dual-write
-- ============================================================

-- ── A) Nullable derived phone identity columns ───────────────

alter table public.customers
  add column if not exists phone_e164 text,
  add column if not exists phone_country_iso text,
  add column if not exists phone_region_source text,
  add column if not exists phone_national text;

comment on column public.customers.phone_e164 is
  'Canonical E.164 communication identity (+…). Nullable until resolved. Never rewrite customers.phone.';
comment on column public.customers.phone_country_iso is
  'ISO-3166-1 alpha-2 country of the phone number (not company country).';
comment on column public.customers.phone_region_source is
  'How phone region/e164 was determined: explicit | e164 | channel | import | unresolved.';
comment on column public.customers.phone_national is
  'Optional national display form cached from resolver.';

-- phone_e164 format (nullable)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_phone_e164_format_check'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_phone_e164_format_check
      check (
        phone_e164 is null
        or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
      );
  end if;
end $$;

-- phone_country_iso format (nullable)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_phone_country_iso_check'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_phone_country_iso_check
      check (
        phone_country_iso is null
        or phone_country_iso ~ '^[A-Z]{2}$'
      );
  end if;
end $$;

-- phone_region_source enum-like (nullable)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_phone_region_source_check'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_phone_region_source_check
      check (
        phone_region_source is null
        or phone_region_source in (
          'explicit',
          'e164',
          'channel',
          'import',
          'unresolved'
        )
      );
  end if;
end $$;

-- Company-scoped uniqueness for canonical E.164 (partial; nulls allowed)
create unique index if not exists idx_customers_company_phone_e164_unique
  on public.customers (company_id, phone_e164)
  where phone_e164 is not null and trim(phone_e164) <> '';

-- Lookup index (company_id, phone_e164)
create index if not exists idx_customers_company_phone_e164
  on public.customers (company_id, phone_e164);

-- Existing idx_customers_company_phone_unique on (company_id, phone) is preserved.

-- ── B) Portal tenant isolation fix ───────────────────────────
-- Challenge carries company_id from portal_start_auth_challenge(p_company_id, ...).
-- Customer lookup MUST be scoped to that company. Do not infer company from phone.

create or replace function internal.portal_verify_auth_challenge(
  p_challenge_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path to internal, public, extensions
as $function$
declare
  v_challenge record;
  v_customer_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires timestamptz := now() + interval '7 days';
begin
  select * into v_challenge
  from public.customer_portal_auth_challenges
  where id = p_challenge_id and consumed_at is null and expires_at > now();

  if not found then
    raise exception 'Invalid or expired challenge';
  end if;

  if v_challenge.company_id is null then
    raise exception 'Invalid challenge company';
  end if;

  if v_challenge.code_hash <> encode(extensions.digest(p_code, 'sha256'), 'hex') then
    raise exception 'Invalid verification code';
  end if;

  update public.customer_portal_auth_challenges
  set consumed_at = now()
  where id = p_challenge_id;

  select id into v_customer_id
  from public.customers
  where company_id = v_challenge.company_id
    and (
      phone = v_challenge.destination
      or email = v_challenge.destination
    )
  limit 1;

  if v_customer_id is null then
    raise exception 'Customer not found for destination';
  end if;

  insert into public.customer_portal_sessions (id, company_id, customer_id, token_hash, expires_at)
  values (
    v_session_id,
    v_challenge.company_id,
    v_customer_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires
  );

  return jsonb_build_object(
    'session_id', v_session_id,
    'customer_id', v_customer_id,
    'company_id', v_challenge.company_id,
    'token', v_token,
    'expires_at', v_expires
  );
end;
$function$;

-- public wrapper already delegates to internal (migration 289); reaffirm grants.
revoke all on function public.portal_verify_auth_challenge(uuid, text) from public;
grant execute on function public.portal_verify_auth_challenge(uuid, text) to service_role;
grant execute on function public.portal_verify_auth_challenge(uuid, text) to authenticated;
grant execute on function public.portal_verify_auth_challenge(uuid, text) to anon;

revoke all on function internal.portal_verify_auth_challenge(uuid, text) from public;
grant execute on function internal.portal_verify_auth_challenge(uuid, text) to service_role;
grant execute on function internal.portal_verify_auth_challenge(uuid, text) to authenticated;
grant execute on function internal.portal_verify_auth_challenge(uuid, text) to anon;
