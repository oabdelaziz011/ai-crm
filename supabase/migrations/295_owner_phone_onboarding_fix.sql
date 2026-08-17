-- ============================================================
-- Owner phone on self-serve onboarding
-- 1) update_my_profile: null p_phone means "leave unchanged" ("" clears)
-- 2) handle_new_user: capture phone from signup metadata
-- 3) onboard_own_company_v1: fall back owner phone → contact_phone
-- 4) Backfill existing company admins missing profiles.phone
-- ============================================================

-- ── 1. update_my_profile (internal body after migration 289) ──

create or replace function internal.update_my_profile(
  p_full_name text,
  p_avatar_url text default null,
  p_preferred_language text default 'en',
  p_timezone text default 'UTC',
  p_preferred_theme text default 'system',
  p_job_title text default null,
  p_department text default null,
  p_phone text default null
)
returns public.profiles
language plpgsql
security definer
set search_path to internal, public
as $$
declare
  v_user_id uuid;
  v_profile public.profiles;
  v_language text;
  v_timezone text;
  v_theme text;
  v_job_title text;
  v_department text;
  v_phone text;
  v_clear_phone boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'Full name is required';
  end if;

  if length(trim(p_full_name)) > 200 then
    raise exception 'Full name is too long';
  end if;

  if not public.is_valid_avatar_url(p_avatar_url) then
    raise exception 'Invalid avatar URL';
  end if;

  v_language := coalesce(nullif(trim(p_preferred_language), ''), 'en');
  if v_language not in ('en', 'ar') then
    raise exception 'Invalid language';
  end if;

  v_timezone := coalesce(nullif(trim(p_timezone), ''), 'UTC');
  if v_timezone !~ '^([A-Za-z_]+/[A-Za-z_]+(?:/[A-Za-z_]+)?|UTC)$' then
    raise exception 'Invalid timezone';
  end if;

  v_theme := coalesce(nullif(trim(p_preferred_theme), ''), 'system');
  if v_theme not in ('system', 'light', 'dark') then
    raise exception 'Invalid theme';
  end if;

  v_job_title := nullif(trim(p_job_title), '');
  if v_job_title is not null and length(v_job_title) > 120 then
    raise exception 'Job title is too long';
  end if;

  v_department := nullif(trim(p_department), '');
  if v_department is not null and length(v_department) > 120 then
    raise exception 'Department is too long';
  end if;

  -- null = leave phone unchanged; empty / whitespace = clear
  if p_phone is null then
    v_phone := null;
    v_clear_phone := false;
  else
    v_phone := nullif(trim(p_phone), '');
    v_clear_phone := true;
    if v_phone is not null and length(v_phone) > 40 then
      raise exception 'Phone is too long';
    end if;
  end if;

  update public.profiles
  set
    full_name = trim(p_full_name),
    avatar_url = nullif(trim(p_avatar_url), ''),
    preferred_language = v_language,
    timezone = v_timezone,
    preferred_theme = v_theme,
    job_title = v_job_title,
    department = v_department,
    phone = case
      when v_clear_phone then v_phone
      else phone
    end,
    updated_at = now()
  where id = v_user_id or user_id = v_user_id
  returning * into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return v_profile;
end;
$$;

-- Keep public wrapper in sync (defaults match migration 289)
create or replace function public.update_my_profile(
  p_full_name text,
  p_avatar_url text default null,
  p_preferred_language text default 'en',
  p_timezone text default 'UTC',
  p_preferred_theme text default 'system',
  p_job_title text default null,
  p_department text default null,
  p_phone text default null
)
returns public.profiles
language sql
security definer
set search_path to public, internal
as $w$
  select internal.update_my_profile(
    p_full_name,
    p_avatar_url,
    p_preferred_language,
    p_timezone,
    p_preferred_theme,
    p_job_title,
    p_department,
    p_phone
  );
$w$;

revoke all on function public.update_my_profile(
  text, text, text, text, text, text, text, text
) from public;
revoke all on function internal.update_my_profile(
  text, text, text, text, text, text, text, text
) from public;
grant execute on function public.update_my_profile(
  text, text, text, text, text, text, text, text
) to service_role, authenticated;
grant execute on function internal.update_my_profile(
  text, text, text, text, text, text, text, text
) to service_role, authenticated;

-- ── 2. handle_new_user — persist phone from signup metadata ──

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_full_name text;
  v_job_title text;
  v_phone text;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(new.email, '@', 1), '')
  );
  v_job_title := nullif(trim(new.raw_user_meta_data->>'job_title'), '');
  v_phone := nullif(trim(new.raw_user_meta_data->>'phone'), '');
  if v_phone is not null and length(v_phone) > 40 then
    v_phone := left(v_phone, 40);
  end if;

  insert into public.profiles (id, user_id, email, full_name, role, job_title, phone)
  values (
    new.id,
    new.id,
    new.email,
    v_full_name,
    coalesce(new.raw_user_meta_data->>'role', null),
    v_job_title,
    v_phone
  )
  on conflict (id) do update
  set
    user_id = excluded.user_id,
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    job_title = coalesce(public.profiles.job_title, excluded.job_title),
    phone = coalesce(public.profiles.phone, excluded.phone),
    updated_at = now();

  update public.profiles
  set
    id = new.id,
    email = coalesce(email, new.email),
    full_name = coalesce(full_name, v_full_name),
    job_title = coalesce(job_title, v_job_title),
    phone = coalesce(phone, v_phone),
    updated_at = now()
  where user_id = new.id
    and id is distinct from new.id;

  return new;
end;
$$;

-- ── 3. onboard_own_company_v1 — owner phone falls back to contact_phone ──

create or replace function internal.onboard_own_company_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to internal, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_company public.companies%rowtype;
  v_admin_role_id uuid;
  v_name text;
  v_legal_name text;
  v_business_type text;
  v_industry text;
  v_contact_email text;
  v_contact_phone text;
  v_owner_display_name text;
  v_owner_phone text;
  v_owner_job_title text;
  v_timezone text;
  v_provisioning jsonb;
  v_core jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  perform pg_advisory_xact_lock(hashtext('onboard_own_company_v1:' || v_user_id::text));

  select * into v_profile
  from public.profiles p
  where p.id = v_user_id or p.user_id = v_user_id
  for update;

  if not found then raise exception 'profile_not_found'; end if;
  if v_profile.company_id is not null then raise exception 'company_already_assigned'; end if;
  if coalesce(v_profile.is_super_admin, false) then raise exception 'super_admin_use_admin_create'; end if;

  v_name := public._company_onboarding_text(p_payload->>'name', 200);
  v_legal_name := public._company_onboarding_text(p_payload->>'legal_name', 200);
  v_business_type := public._company_onboarding_text(p_payload->>'business_type', 80);
  v_industry := public._company_onboarding_text(p_payload->>'industry', 120);
  v_contact_email := public._company_onboarding_text(p_payload->>'contact_email', 254);
  v_contact_phone := public._company_onboarding_text(p_payload->>'contact_phone', 40);
  v_owner_display_name := coalesce(
    public._company_onboarding_text(p_payload->>'owner_display_name', 200),
    public._company_onboarding_text(p_payload->>'owner_full_name', 200),
    v_profile.full_name,
    v_profile.email
  );
  v_owner_phone := coalesce(
    public._company_onboarding_text(p_payload->>'owner_phone', 40),
    v_contact_phone
  );
  v_owner_job_title := coalesce(
    public._company_onboarding_text(p_payload->>'owner_job_title', 120),
    'Owner'
  );
  v_timezone := coalesce(
    public._company_onboarding_text(p_payload->>'timezone', 64),
    v_profile.timezone,
    'UTC'
  );

  if v_name is null then raise exception 'company_name_required'; end if;
  if v_legal_name is null then raise exception 'legal_name_required'; end if;
  if v_business_type is null then raise exception 'business_type_required'; end if;
  if v_industry is null then raise exception 'industry_required'; end if;
  if v_contact_email is null or v_contact_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'contact_email_invalid';
  end if;
  if v_contact_phone is null then raise exception 'contact_phone_required'; end if;

  perform set_config('vault.provisioning_bootstrap', 'true', true);

  insert into public.companies (
    name, status, subscription_plan, subscription_status, company_type,
    industry, business_type, contact_person, contact_email, contact_phone,
    tenant_provisioning_status,
    approval_status, approval_requested_at
  )
  values (
    v_name, 'Trial', 'Basic', 'trialing', 'tenant',
    v_industry, v_business_type, v_owner_display_name, v_contact_email, v_contact_phone,
    'pending',
    'pending', now()
  )
  returning * into v_company;

  v_provisioning := public.execute_tenant_provisioning(v_company.id);

  perform public._apply_company_onboarding_identity(
    v_company.id,
    p_payload || jsonb_build_object('name', v_name, 'timezone', v_timezone)
  );

  v_core := public._ensure_core_system_feature_grants(v_company.id);

  select r.id into v_admin_role_id
  from public.roles r
  where r.company_id = v_company.id
    and r.role_type = 'DEFAULT'
    and r.template_key = 'admin'
  limit 1;

  if v_admin_role_id is null then raise exception 'admin_role_missing'; end if;

  perform set_config('valueor.allow_privileged_profile_update', 'on', true);

  update public.profiles
  set
    company_id = v_company.id,
    full_name = coalesce(v_owner_display_name, full_name),
    phone = coalesce(v_owner_phone, phone),
    job_title = coalesce(v_owner_job_title, job_title),
    timezone = v_timezone,
    updated_at = now()
  where id = v_profile.id;

  delete from public.user_roles where user_id = v_profile.id;
  insert into public.user_roles (user_id, role_id)
  values (v_profile.id, v_admin_role_id);

  perform set_config('vault.provisioning_bootstrap', 'false', true);

  select * into v_company from public.companies where id = v_company.id;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'company_id', v_company.id,
    'role_id', v_admin_role_id,
    'provisioning', v_provisioning,
    'approval_status', v_company.approval_status,
    'core', v_core,
    'subscription', null,
    'trial_ends_at', null,
    'trial_features', '[]'::jsonb
  );
exception
  when unique_violation then
    raise exception 'duplicate_onboarding';
end;
$$;

create or replace function public.onboard_own_company_v1(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path to public, internal
as $w$
  select internal.onboard_own_company_v1(p_payload);
$w$;

revoke all on function public.onboard_own_company_v1(jsonb) from public;
revoke all on function internal.onboard_own_company_v1(jsonb) from public;
grant execute on function public.onboard_own_company_v1(jsonb) to service_role, authenticated;
grant execute on function internal.onboard_own_company_v1(jsonb) to service_role, authenticated;

comment on function public.onboard_own_company_v1(jsonb) is
  'First-time authenticated users without a company create their tenant, billing identity, HQ branch, and Company Admin membership in one transaction. Owner profile.phone falls back to contact_phone when owner_phone is omitted.';

-- ── 4. Backfill owner / admin phones from company contact_phone ──

update public.profiles p
set
  phone = nullif(trim(c.contact_phone), ''),
  updated_at = now()
from public.companies c
where p.company_id = c.id
  and (p.phone is null or length(trim(p.phone)) = 0)
  and nullif(trim(c.contact_phone), '') is not null
  and exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p.id
      and r.company_id = c.id
      and r.template_key = 'admin'
  );
