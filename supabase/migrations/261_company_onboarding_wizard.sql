-- ============================================================
-- Company Onboarding Wizard — additive schema + secure RPCs
-- - companies.industry / business_type (NOT company_type)
-- - company_billing_profiles.commercial_registration
-- - onboard_own_company_v1 (first-time self-serve)
-- - create_company_admin_v1 (authorized Add Company)
-- ============================================================

-- ── 1. Additive columns ─────────────────────────────────────

alter table public.companies
  add column if not exists industry text,
  add column if not exists business_type text;

comment on column public.companies.industry is
  'Business industry label for the tenant (onboarding / directory). Distinct from company_type.';
comment on column public.companies.business_type is
  'Business type label (e.g. clinic, retail). Distinct from tenant company_type.';

alter table public.company_billing_profiles
  add column if not exists commercial_registration text;

comment on column public.company_billing_profiles.commercial_registration is
  'Commercial registration / CR number for the company legal identity.';

create index if not exists idx_companies_industry
  on public.companies (industry)
  where industry is not null;

create index if not exists idx_companies_business_type
  on public.companies (business_type)
  where business_type is not null;

-- ── 2. Allow SECURITY DEFINER onboarding to set company_id ──

create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  -- Explicit opt-in for trusted SECURITY DEFINER onboarding / provisioning paths.
  if current_setting('valueor.allow_privileged_profile_update', true) = 'on' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  -- Only enforce when the authenticated user is editing their own row.
  if not (old.id = auth.uid() or old.user_id = auth.uid()) then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.company_id is distinct from old.company_id
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.is_super_admin is distinct from old.is_super_admin
     or new.is_active is distinct from old.is_active
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Cannot modify privileged profile fields';
  end if;

  if not public.is_valid_avatar_url(new.avatar_url) then
    raise exception 'Invalid avatar URL';
  end if;

  return new;
end;
$$;

-- ── 3. Shared helpers ───────────────────────────────────────

create or replace function public._company_onboarding_text(p_value text, p_max integer default 500)
returns text
language sql
immutable
as $$
  select nullif(left(trim(coalesce(p_value, '')), p_max), '');
$$;

create or replace function public._apply_company_onboarding_identity(
  p_company_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_legal_name text;
  v_address text;
  v_tax_id text;
  v_commercial_registration text;
  v_website text;
  v_description text;
  v_branding jsonb;
  v_currency text;
  v_timezone text;
  v_country text;
  v_city text;
  v_branch_name text;
  v_company_name text;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  v_legal_name := public._company_onboarding_text(p_payload->>'legal_name', 200);
  v_address := public._company_onboarding_text(p_payload->>'address', 1000);
  v_tax_id := public._company_onboarding_text(p_payload->>'tax_id', 80);
  v_commercial_registration := public._company_onboarding_text(p_payload->>'commercial_registration', 80);
  v_website := public._company_onboarding_text(p_payload->>'website', 300);
  v_description := public._company_onboarding_text(p_payload->>'description', 2000);
  v_currency := upper(coalesce(public._company_onboarding_text(p_payload->>'currency', 8), 'SAR'));
  v_timezone := coalesce(public._company_onboarding_text(p_payload->>'timezone', 64), 'UTC');
  v_country := public._company_onboarding_text(p_payload->>'country', 120);
  v_city := public._company_onboarding_text(p_payload->>'city', 120);
  v_company_name := public._company_onboarding_text(p_payload->>'name', 200);
  v_branch_name := coalesce(v_company_name, 'Headquarters');

  insert into public.company_billing_profiles (
    company_id,
    legal_name,
    address,
    tax_id,
    commercial_registration
  )
  values (
    p_company_id,
    v_legal_name,
    v_address,
    v_tax_id,
    v_commercial_registration
  )
  on conflict (company_id) do update
  set
    legal_name = coalesce(excluded.legal_name, public.company_billing_profiles.legal_name),
    address = coalesce(excluded.address, public.company_billing_profiles.address),
    tax_id = coalesce(excluded.tax_id, public.company_billing_profiles.tax_id),
    commercial_registration = coalesce(
      excluded.commercial_registration,
      public.company_billing_profiles.commercial_registration
    ),
    updated_at = now();

  select coalesce(c.branding, '{}'::jsonb)
  into v_branding
  from public.companies c
  where c.id = p_company_id;

  v_branding := jsonb_set(
    coalesce(v_branding, '{}'::jsonb),
    '{general}',
    coalesce(v_branding->'general', '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'website', v_website,
          'description', v_description
        )
      ),
    true
  );

  update public.companies
  set branding = v_branding,
      updated_at = now()
  where id = p_company_id;

  insert into public.company_financial_settings (company_id, default_currency)
  values (p_company_id, v_currency)
  on conflict (company_id) do update
  set
    default_currency = excluded.default_currency,
    updated_at = now();

  -- Structured geo lives on branches (not companies). Create/update primary HQ branch.
  if exists (
    select 1
    from public.branches b
    where b.company_id = p_company_id
      and b.deleted_at is null
      and b.is_primary = true
  ) then
    update public.branches
    set
      name = coalesce(nullif(name, ''), v_branch_name),
      timezone = v_timezone,
      address_line1 = coalesce(v_address, address_line1),
      city = coalesce(v_city, city),
      country = coalesce(v_country, country),
      updated_at = now()
    where company_id = p_company_id
      and deleted_at is null
      and is_primary = true;
  else
    insert into public.branches (
      company_id,
      name,
      timezone,
      status,
      address_line1,
      city,
      country,
      is_primary,
      created_by
    )
    values (
      p_company_id,
      v_branch_name,
      v_timezone,
      'active',
      v_address,
      v_city,
      v_country,
      true,
      auth.uid()
    );
  end if;
end;
$$;

revoke all on function public._apply_company_onboarding_identity(uuid, jsonb) from public;
grant execute on function public._apply_company_onboarding_identity(uuid, jsonb) to service_role;

-- ── 4. First-time self-serve onboarding ─────────────────────

create or replace function public.onboard_own_company_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
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
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  -- Serialize duplicate onboarding attempts for the same user.
  perform pg_advisory_xact_lock(hashtext('onboard_own_company_v1:' || v_user_id::text));

  select *
  into v_profile
  from public.profiles p
  where p.id = v_user_id or p.user_id = v_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  if v_profile.company_id is not null then
    raise exception 'company_already_assigned';
  end if;

  -- Super-admins managing the platform should use Add Company, not self-serve onboarding.
  if coalesce(v_profile.is_super_admin, false) then
    raise exception 'super_admin_use_admin_create';
  end if;

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
  v_owner_phone := public._company_onboarding_text(p_payload->>'owner_phone', 40);
  v_owner_job_title := coalesce(
    public._company_onboarding_text(p_payload->>'owner_job_title', 120),
    'Owner'
  );
  v_timezone := coalesce(
    public._company_onboarding_text(p_payload->>'timezone', 64),
    v_profile.timezone,
    'UTC'
  );

  if v_name is null then
    raise exception 'company_name_required';
  end if;
  if v_legal_name is null then
    raise exception 'legal_name_required';
  end if;
  if v_business_type is null then
    raise exception 'business_type_required';
  end if;
  if v_industry is null then
    raise exception 'industry_required';
  end if;
  if v_contact_email is null or v_contact_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'contact_email_invalid';
  end if;
  if v_contact_phone is null then
    raise exception 'contact_phone_required';
  end if;

  -- Allow AFTER INSERT tenant provisioning trigger for this trusted self-serve path.
  perform set_config('vault.provisioning_bootstrap', 'true', true);

  insert into public.companies (
    name,
    status,
    subscription_plan,
    subscription_status,
    company_type,
    industry,
    business_type,
    contact_person,
    contact_email,
    contact_phone,
    tenant_provisioning_status
  )
  values (
    v_name,
    'Trial',
    'Basic',
    'trialing',
    'tenant',
    v_industry,
    v_business_type,
    v_owner_display_name,
    v_contact_email,
    v_contact_phone,
    'pending'
  )
  returning * into v_company;

  -- Trigger provisions roles; call again for synchronous completion.
  v_provisioning := public.execute_tenant_provisioning(v_company.id);

  perform public._apply_company_onboarding_identity(
    v_company.id,
    p_payload || jsonb_build_object('name', v_name, 'timezone', v_timezone)
  );

  select r.id
  into v_admin_role_id
  from public.roles r
  where r.company_id = v_company.id
    and r.role_type = 'DEFAULT'
    and r.template_key = 'admin'
  limit 1;

  if v_admin_role_id is null then
    raise exception 'admin_role_missing';
  end if;

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

  select * into v_company from public.companies where id = v_company.id;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'company_id', v_company.id,
    'role_id', v_admin_role_id,
    'provisioning', v_provisioning
  );
exception
  when unique_violation then
    raise exception 'duplicate_onboarding';
end;
$$;

comment on function public.onboard_own_company_v1(jsonb) is
  'First-time authenticated users without a company create their tenant, billing identity, HQ branch, and Company Admin membership in one transaction.';

revoke all on function public.onboard_own_company_v1(jsonb) from public;
grant execute on function public.onboard_own_company_v1(jsonb) to authenticated;
grant execute on function public.onboard_own_company_v1(jsonb) to service_role;

-- ── 5. Authorized admin Add Company (enriched) ──────────────

create or replace function public.create_company_admin_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_name text;
  v_legal_name text;
  v_business_type text;
  v_industry text;
  v_contact_email text;
  v_contact_phone text;
  v_contact_person text;
  v_status text;
  v_plan text;
  v_provisioning jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not (
    public.is_super_admin()
    or public.user_has_permission('companies.create')
  ) then
    raise exception 'forbidden';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  v_name := public._company_onboarding_text(p_payload->>'name', 200);
  v_legal_name := public._company_onboarding_text(p_payload->>'legal_name', 200);
  v_business_type := public._company_onboarding_text(p_payload->>'business_type', 80);
  v_industry := public._company_onboarding_text(p_payload->>'industry', 120);
  v_contact_email := public._company_onboarding_text(p_payload->>'contact_email', 254);
  v_contact_phone := public._company_onboarding_text(p_payload->>'contact_phone', 40);
  v_contact_person := public._company_onboarding_text(p_payload->>'contact_person', 200);
  v_status := coalesce(public._company_onboarding_text(p_payload->>'status', 32), 'Trial');
  v_plan := coalesce(public._company_onboarding_text(p_payload->>'subscription_plan', 64), 'Basic');

  if v_name is null then
    raise exception 'company_name_required';
  end if;
  if v_legal_name is null then
    raise exception 'legal_name_required';
  end if;
  if v_business_type is null then
    raise exception 'business_type_required';
  end if;
  if v_industry is null then
    raise exception 'industry_required';
  end if;
  if v_contact_email is null or v_contact_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'contact_email_invalid';
  end if;
  if v_contact_phone is null then
    raise exception 'contact_phone_required';
  end if;
  if v_status not in ('Active', 'Suspended', 'Trial') then
    raise exception 'invalid_status';
  end if;

  -- Trusted for companies.create holders who are not platform super-admins.
  perform set_config('vault.provisioning_bootstrap', 'true', true);

  insert into public.companies (
    name,
    status,
    subscription_plan,
    company_type,
    industry,
    business_type,
    contact_person,
    contact_email,
    contact_phone,
    tenant_provisioning_status
  )
  values (
    v_name,
    v_status,
    v_plan,
    'tenant',
    v_industry,
    v_business_type,
    v_contact_person,
    v_contact_email,
    v_contact_phone,
    'pending'
  )
  returning * into v_company;

  v_provisioning := public.execute_tenant_provisioning(v_company.id);

  perform public._apply_company_onboarding_identity(
    v_company.id,
    p_payload || jsonb_build_object('name', v_name)
  );

  select * into v_company from public.companies where id = v_company.id;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'company_id', v_company.id,
    'provisioning', v_provisioning
  );
end;
$$;

comment on function public.create_company_admin_v1(jsonb) is
  'Authorized platform/admin company create with onboarding identity fields. Requires is_super_admin or companies.create. Does not invite owners.';

revoke all on function public.create_company_admin_v1(jsonb) from public;
grant execute on function public.create_company_admin_v1(jsonb) to authenticated;
grant execute on function public.create_company_admin_v1(jsonb) to service_role;
