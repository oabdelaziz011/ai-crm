/**
 * Migration 384 — Company registration acquisition source (tenant attribution).
 *
 * Distinct from customers.source (CRM first-touch).
 * LOCAL ONLY until explicitly approved for production.
 */

alter table public.companies
  add column if not exists acquisition_source text,
  add column if not exists acquisition_source_detail text;

comment on column public.companies.acquisition_source is
  'How the company discovered ValueOR at registration (canonical). Immutable first-touch attribution; not customer/channel source.';

comment on column public.companies.acquisition_source_detail is
  'Free-text detail when acquisition_source = other. Null for all other sources.';

alter table public.companies
  drop constraint if exists companies_acquisition_source_check;

alter table public.companies
  add constraint companies_acquisition_source_check
  check (
    acquisition_source is null
    or acquisition_source in (
      'search_engine',
      'linkedin',
      'social_media',
      'youtube_video',
      'referral',
      'partner_agency',
      'advertisement',
      'event_conference',
      'direct_outreach',
      'website_blog',
      'other'
    )
  );

alter table public.companies
  drop constraint if exists companies_acquisition_source_detail_check;

alter table public.companies
  add constraint companies_acquisition_source_detail_check
  check (
    acquisition_source_detail is null
    or length(btrim(acquisition_source_detail)) > 0
  );

create index if not exists idx_companies_acquisition_source
  on public.companies (acquisition_source)
  where acquisition_source is not null;

-- Preserve first-touch registration attribution once set.
create or replace function public.preserve_company_acquisition_source()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.acquisition_source is not null
     and new.acquisition_source is distinct from old.acquisition_source then
    new.acquisition_source := old.acquisition_source;
  end if;
  if tg_op = 'UPDATE'
     and old.acquisition_source is not null
     and old.acquisition_source <> 'other'
     and new.acquisition_source_detail is distinct from old.acquisition_source_detail then
    new.acquisition_source_detail := old.acquisition_source_detail;
  end if;
  if tg_op = 'UPDATE'
     and old.acquisition_source = 'other'
     and old.acquisition_source_detail is not null
     and new.acquisition_source = 'other'
     and (
       new.acquisition_source_detail is null
       or btrim(new.acquisition_source_detail) = ''
     ) then
    new.acquisition_source_detail := old.acquisition_source_detail;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preserve_company_acquisition_source on public.companies;
create trigger trg_preserve_company_acquisition_source
  before update on public.companies
  for each row
  execute function public.preserve_company_acquisition_source();

create or replace function public._company_onboarding_parse_acquisition(
  p_payload jsonb,
  out source text,
  out detail text
)
returns record
language plpgsql
stable
as $$
begin
  source := nullif(trim(coalesce(p_payload->>'acquisition_source', '')), '');
  detail := nullif(trim(coalesce(p_payload->>'acquisition_source_detail', '')), '');

  if source is null then
    raise exception 'acquisition_source_required';
  end if;

  if source not in (
    'search_engine',
    'linkedin',
    'social_media',
    'youtube_video',
    'referral',
    'partner_agency',
    'advertisement',
    'event_conference',
    'direct_outreach',
    'website_blog',
    'other'
  ) then
    raise exception 'acquisition_source_invalid';
  end if;

  if source = 'other' then
    if detail is null then
      raise exception 'acquisition_source_detail_required';
    end if;
    if length(detail) > 500 then
      raise exception 'acquisition_source_detail_too_long';
    end if;
  else
    detail := null;
  end if;
end;
$$;

-- ── onboard_own_company_v1 (require acquisition at registration) ─────────────

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
  v_acquisition_source text;
  v_acquisition_detail text;
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

  select s.source, s.detail
    into v_acquisition_source, v_acquisition_detail
  from public._company_onboarding_parse_acquisition(p_payload) s;

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
    acquisition_source, acquisition_source_detail,
    tenant_provisioning_status,
    approval_status, approval_requested_at
  )
  values (
    v_name, 'Trial', 'Basic', 'trialing', 'tenant',
    v_industry, v_business_type, v_owner_display_name, v_contact_email, v_contact_phone,
    v_acquisition_source, v_acquisition_detail,
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

-- ── create_company_admin_v1 (same acquisition requirement) ───────────────────

create or replace function internal.create_company_admin_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to internal, public
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
  v_acquisition_source text;
  v_acquisition_detail text;
  v_provisioning jsonb;
  v_core jsonb;
  v_auto_approve boolean := false;
  v_mode text := 'trial';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

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
  v_auto_approve := coalesce((p_payload->>'auto_approve')::boolean, false)
    and public.is_super_admin();
  v_mode := case
    when lower(coalesce(p_payload->>'access_mode', '')) = 'active' then 'active'
    when v_status = 'Active' then 'active'
    else 'trial'
  end;

  select s.source, s.detail
    into v_acquisition_source, v_acquisition_detail
  from public._company_onboarding_parse_acquisition(p_payload) s;

  if v_name is null then raise exception 'company_name_required'; end if;
  if v_legal_name is null then raise exception 'legal_name_required'; end if;
  if v_business_type is null then raise exception 'business_type_required'; end if;
  if v_industry is null then raise exception 'industry_required'; end if;
  if v_contact_email is null or v_contact_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'contact_email_invalid';
  end if;
  if v_contact_phone is null then raise exception 'contact_phone_required'; end if;
  if v_status not in ('Active', 'Suspended', 'Trial') then
    raise exception 'invalid_status';
  end if;

  perform set_config('vault.provisioning_bootstrap', 'true', true);

  insert into public.companies (
    name, status, subscription_plan, subscription_status, company_type,
    industry, business_type, contact_person, contact_email, contact_phone,
    acquisition_source, acquisition_source_detail,
    tenant_provisioning_status,
    approval_status, approval_requested_at
  )
  values (
    v_name,
    v_status,
    v_plan,
    case when v_status = 'Active' then 'active' else 'trialing' end,
    'tenant',
    v_industry, v_business_type, v_contact_person, v_contact_email, v_contact_phone,
    v_acquisition_source, v_acquisition_detail,
    'pending',
    'pending', now()
  )
  returning * into v_company;

  v_provisioning := public.execute_tenant_provisioning(v_company.id);

  perform public._apply_company_onboarding_identity(
    v_company.id,
    p_payload || jsonb_build_object('name', v_name)
  );

  v_core := public._ensure_core_system_feature_grants(v_company.id);

  perform set_config('vault.provisioning_bootstrap', 'false', true);

  if v_auto_approve then
    return public.approve_company_v1(v_company.id, v_mode, p_payload->>'approval_notes');
  end if;

  select * into v_company from public.companies where id = v_company.id;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'company_id', v_company.id,
    'provisioning', v_provisioning,
    'approval_status', v_company.approval_status,
    'core', v_core,
    'subscription', null,
    'trial_ends_at', null,
    'trial_features', '[]'::jsonb
  );
end;
$$;

create or replace function public.create_company_admin_v1(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path to public, internal
as $w$
  select internal.create_company_admin_v1(p_payload);
$w$;

revoke all on function public.create_company_admin_v1(jsonb) from public;
revoke all on function internal.create_company_admin_v1(jsonb) from public;
grant execute on function public.create_company_admin_v1(jsonb) to service_role, authenticated;
grant execute on function internal.create_company_admin_v1(jsonb) to service_role, authenticated;
