-- S6.9: Enterprise Customer Experience Platform

create table if not exists public.customer_portal_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade unique,
  slug text not null unique,
  enabled boolean not null default false,
  description text,
  timezone text not null default 'UTC',
  branding jsonb not null default '{}'::jsonb,
  working_hours jsonb not null default '{}'::jsonb,
  location jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_portal_settings_slug
  on public.customer_portal_settings (slug) where enabled = true;

drop trigger if exists customer_portal_settings_updated_at on public.customer_portal_settings;
create trigger customer_portal_settings_updated_at
  before update on public.customer_portal_settings
  for each row execute function public.set_updated_at();

create table if not exists public.customer_portal_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  emergency_contact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, customer_id)
);

create table if not exists public.customer_portal_identities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  phone text,
  email text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, customer_id)
);

create table if not exists public.customer_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('pending', 'active', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_sessions_customer
  on public.customer_portal_sessions (company_id, customer_id, status);

create table if not exists public.customer_portal_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  method text not null check (method in ('otp', 'magic_link', 'oauth')),
  destination text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_portal_check_in_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null references public.scheduling_bookings(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.portal_analytics_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_analytics_company_created
  on public.portal_analytics_events (company_id, created_at desc);

alter table public.customer_portal_settings enable row level security;
alter table public.customer_portal_profiles enable row level security;
alter table public.customer_portal_identities enable row level security;
alter table public.customer_portal_sessions enable row level security;
alter table public.customer_portal_auth_challenges enable row level security;
alter table public.customer_portal_check_in_tokens enable row level security;
alter table public.portal_analytics_events enable row level security;

-- Public read for enabled portal settings (anon booking website)
drop policy if exists portal_settings_public_read on public.customer_portal_settings;
create policy portal_settings_public_read on public.customer_portal_settings for select
  using (enabled = true);

drop policy if exists portal_settings_staff on public.customer_portal_settings;
create policy portal_settings_staff on public.customer_portal_settings for all
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  )
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists portal_analytics_staff on public.portal_analytics_events;
create policy portal_analytics_staff on public.portal_analytics_events for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists portal_analytics_insert on public.portal_analytics_events;
create policy portal_analytics_insert on public.portal_analytics_events for insert
  with check (true);

-- Resolve or create customer by phone for public booking
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
  v_owner uuid;
begin
  select id into v_customer_id
  from public.customers
  where phone = p_phone
  limit 1;

  if v_customer_id is not null then
    return jsonb_build_object('customer_id', v_customer_id, 'exists', true);
  end if;

  select user_id into v_owner
  from public.profiles
  where company_id = p_company_id and is_active = true
  limit 1;

  return jsonb_build_object('customer_id', null, 'exists', false, 'owner_user_id', v_owner);
end;
$$;

create or replace function public.portal_upsert_customer(
  p_company_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_owner_user_id uuid,
  p_preferred_language text default 'en',
  p_marketing_consent boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_owner uuid := p_owner_user_id;
begin
  if v_owner is null then
    select user_id into v_owner
    from public.profiles
    where company_id = p_company_id and coalesce(is_active, true) = true
    limit 1;
  end if;
  if v_owner is null then
    raise exception 'No company owner found for customer creation';
  end if;

  select id into v_customer_id from public.customers where phone = p_phone limit 1;

  if v_customer_id is null then
    insert into public.customers (user_id, name, email, phone)
    values (v_owner, p_name, p_email, p_phone)
    returning id into v_customer_id;
  else
    update public.customers
    set name = p_name,
        email = coalesce(p_email, email),
        updated_at = now()
    where id = v_customer_id;
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

create or replace function public.portal_start_auth_challenge(
  p_company_id uuid,
  p_method text,
  p_destination text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text := lpad(floor(random() * 1000000)::text, 6, '0');
  v_expires timestamptz := now() + interval '10 minutes';
begin
  insert into public.customer_portal_auth_challenges (
    id, company_id, method, destination, code_hash, expires_at
  ) values (
    v_id, p_company_id, p_method, p_destination,
    encode(digest(v_code, 'sha256'), 'hex'), v_expires
  );

  return jsonb_build_object(
    'challenge_id', v_id,
    'expires_at', v_expires,
    'masked_destination', left(p_destination, 2) || '***' || right(p_destination, 2),
    'dev_code', v_code
  );
end;
$$;

create or replace function public.portal_verify_auth_challenge(
  p_challenge_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge record;
  v_customer_id uuid;
  v_session_id uuid := gen_random_uuid();
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_expires timestamptz := now() + interval '7 days';
begin
  select * into v_challenge
  from public.customer_portal_auth_challenges
  where id = p_challenge_id and consumed_at is null and expires_at > now();

  if not found then
    raise exception 'Invalid or expired challenge';
  end if;

  if v_challenge.code_hash <> encode(digest(p_code, 'sha256'), 'hex') then
    raise exception 'Invalid verification code';
  end if;

  update public.customer_portal_auth_challenges set consumed_at = now() where id = p_challenge_id;

  select id into v_customer_id from public.customers where phone = v_challenge.destination or email = v_challenge.destination limit 1;
  if v_customer_id is null then
    raise exception 'Customer not found for destination';
  end if;

  insert into public.customer_portal_sessions (id, company_id, customer_id, token_hash, expires_at)
  values (v_session_id, v_challenge.company_id, v_customer_id, encode(digest(v_token, 'sha256'), 'hex'), v_expires);

  return jsonb_build_object(
    'session_id', v_session_id,
    'customer_id', v_customer_id,
    'company_id', v_challenge.company_id,
    'token', v_token,
    'expires_at', v_expires
  );
end;
$$;

create or replace function public.portal_create_check_in_token(
  p_company_id uuid,
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_expires timestamptz := now() + interval '2 hours';
begin
  insert into public.customer_portal_check_in_tokens (company_id, booking_id, token_hash, expires_at)
  values (p_company_id, p_booking_id, encode(digest(v_token, 'sha256'), 'hex'), v_expires);

  return jsonb_build_object('token', v_token, 'check_in_url', '/check-in/' || v_token);
end;
$$;

create or replace function public.portal_consume_check_in_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select * into v_row
  from public.customer_portal_check_in_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and consumed_at is null
    and expires_at > now();

  if not found then
    raise exception 'Invalid or expired check-in token';
  end if;

  update public.customer_portal_check_in_tokens set consumed_at = now() where id = v_row.id;

  return jsonb_build_object('company_id', v_row.company_id, 'booking_id', v_row.booking_id);
end;
$$;

create or replace function public.portal_get_document_signed_url(p_document_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select null::text;
$$;

grant execute on function public.portal_resolve_customer_by_phone(uuid, text) to anon, authenticated;
grant execute on function public.portal_upsert_customer(uuid, text, text, text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.portal_start_auth_challenge(uuid, text, text) to anon, authenticated;
grant execute on function public.portal_verify_auth_challenge(uuid, text) to anon, authenticated;
grant execute on function public.portal_create_check_in_token(uuid, uuid) to authenticated;
grant execute on function public.portal_consume_check_in_token(text) to anon, authenticated;
grant execute on function public.portal_get_document_signed_url(uuid) to authenticated;

comment on table public.customer_portal_settings is 'Tenant branding and config for public booking website and customer portal.';
