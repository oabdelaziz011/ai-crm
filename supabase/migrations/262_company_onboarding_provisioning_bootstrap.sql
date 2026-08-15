-- ============================================================
-- Fix company onboarding RPCs to use trusted provisioning bootstrap
-- (same gate used by migration-safe provisioning paths).
-- Without this, non-super-admin first-time onboarding fails inside
-- execute_tenant_provisioning → assert_trusted_provisioning_caller.
-- ============================================================

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

  perform set_config('vault.provisioning_bootstrap', 'false', true);

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

  perform set_config('vault.provisioning_bootstrap', 'false', true);

  select * into v_company from public.companies where id = v_company.id;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'company_id', v_company.id,
    'provisioning', v_provisioning
  );
end;
$$;
