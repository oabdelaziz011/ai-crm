-- ============================================================
-- ValueOR Phase 5 — Company commercial approval workflow
-- Additive. Does NOT overload companies.status or tenant_provisioning_status.
-- ============================================================

-- ── 1. Approval columns on companies ──────────────────────────

alter table public.companies
  add column if not exists approval_status text;

alter table public.companies
  add column if not exists approval_requested_at timestamptz;

alter table public.companies
  add column if not exists approval_reviewed_at timestamptz;

alter table public.companies
  add column if not exists approval_reviewed_by uuid references auth.users(id) on delete set null;

alter table public.companies
  add column if not exists approval_rejection_reason text;

alter table public.companies
  add column if not exists approval_notes text;

-- Existing tenants are already commercially live → approved (do NOT convert to pending)
update public.companies
set
  approval_status = 'approved',
  approval_requested_at = coalesce(approval_requested_at, created_at),
  approval_reviewed_at = coalesce(approval_reviewed_at, created_at)
where approval_status is null
   or trim(approval_status) = '';

alter table public.companies
  alter column approval_status set default 'pending';

alter table public.companies
  alter column approval_status set not null;

alter table public.companies
  drop constraint if exists companies_approval_status_check;

alter table public.companies
  add constraint companies_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

create index if not exists idx_companies_approval_status
  on public.companies (approval_status, created_at desc);

-- ── 2. Audit event types ──────────────────────────────────────

insert into public.billing_audit_event_types (code, label, description)
values
  ('company_approved', 'Company Approved', 'Platform admin approved a company for commercial access'),
  ('company_rejected', 'Company Rejected', 'Platform admin rejected a company application')
on conflict (code) do update
set label = excluded.label, description = excluded.description, is_active = true;

-- ── 3. Approve company (composes Phase 4 provisioner) ─────────

create or replace function public.approve_company_v1(
  p_company_id uuid,
  p_mode text default 'trial',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_mode text := lower(coalesce(nullif(trim(p_mode), ''), 'trial'));
  v_access jsonb;
  v_previous jsonb;
  v_already_approved boolean := false;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to approve company';
  end if;

  if p_company_id is null then
    raise exception 'company_id_required';
  end if;

  if v_mode not in ('trial', 'active') then
    raise exception 'invalid_access_mode';
  end if;

  select * into v_company
  from public.companies
  where id = p_company_id
  for update;

  if not found then
    raise exception 'company_not_found';
  end if;

  v_previous := jsonb_build_object(
    'approval_status', v_company.approval_status,
    'status', v_company.status,
    'subscription_status', v_company.subscription_status
  );

  if v_company.approval_status = 'approved' then
    v_already_approved := true;
  end if;

  if v_company.approval_status = 'rejected' then
    -- Allow re-approval from rejected
    null;
  elsif v_company.approval_status not in ('pending', 'approved') then
    raise exception 'invalid_approval_state';
  end if;

  update public.companies
  set
    approval_status = 'approved',
    approval_reviewed_at = now(),
    approval_reviewed_by = auth.uid(),
    approval_rejection_reason = null,
    approval_notes = nullif(trim(coalesce(p_notes, '')), ''),
    status = case when v_mode = 'active' then 'Active' else 'Trial' end,
    subscription_status = case when v_mode = 'active' then 'active' else 'trialing' end,
    updated_at = now()
  where id = p_company_id;

  -- Idempotent commercial provision (Phase 4)
  v_access := public.provision_company_commercial_access_v1(p_company_id, v_mode);

  if not v_already_approved then
    perform public.write_billing_audit_log(
      'company_approved',
      p_company_id,
      v_previous,
      jsonb_build_object(
        'approval_status', 'approved',
        'mode', v_mode,
        'notes', nullif(trim(coalesce(p_notes, '')), ''),
        'access', v_access
      ),
      'manual',
      jsonb_build_object('source', 'approve_company_v1')
    );
  end if;

  select * into v_company from public.companies where id = p_company_id;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'company_id', p_company_id,
    'mode', v_mode,
    'already_approved', v_already_approved,
    'access', v_access
  );
end;
$$;

-- ── 4. Reject company ─────────────────────────────────────────

create or replace function public.reject_company_v1(
  p_company_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_previous jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to reject company';
  end if;

  if p_company_id is null then
    raise exception 'company_id_required';
  end if;

  if v_reason is null then
    raise exception 'rejection_reason_required';
  end if;

  select * into v_company
  from public.companies
  where id = p_company_id
  for update;

  if not found then
    raise exception 'company_not_found';
  end if;

  if v_company.approval_status = 'approved' then
    raise exception 'cannot_reject_approved_company';
  end if;

  v_previous := jsonb_build_object(
    'approval_status', v_company.approval_status,
    'status', v_company.status
  );

  update public.companies
  set
    approval_status = 'rejected',
    approval_reviewed_at = now(),
    approval_reviewed_by = auth.uid(),
    approval_rejection_reason = v_reason,
    updated_at = now()
  where id = p_company_id;

  -- Do NOT provision trial/commercial access. Do NOT delete company.

  perform public.write_billing_audit_log(
    'company_rejected',
    p_company_id,
    v_previous,
    jsonb_build_object(
      'approval_status', 'rejected',
      'reason', v_reason
    ),
    'manual',
    jsonb_build_object('source', 'reject_company_v1')
  );

  select * into v_company from public.companies where id = p_company_id;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'company_id', p_company_id,
    'approval_status', 'rejected',
    'reason', v_reason
  );
end;
$$;

-- ── 5. Redefine onboard_own_company_v1 — Pending, core only ───

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

  -- Core only until Platform Admin approves (no trial commercial pack yet)
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

-- ── 6. Redefine create_company_admin_v1 — Pending by default ──

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
  v_core jsonb;
  v_auto_approve boolean := false;
  v_mode text := 'trial';
  v_access jsonb;
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

-- ── 7. Grants ─────────────────────────────────────────────────

revoke all on function public.approve_company_v1(uuid, text, text) from public;
grant execute on function public.approve_company_v1(uuid, text, text) to authenticated;
grant execute on function public.approve_company_v1(uuid, text, text) to service_role;

revoke all on function public.reject_company_v1(uuid, text) from public;
grant execute on function public.reject_company_v1(uuid, text) to authenticated;
grant execute on function public.reject_company_v1(uuid, text) to service_role;

revoke all on function public.onboard_own_company_v1(jsonb) from public;
grant execute on function public.onboard_own_company_v1(jsonb) to authenticated;
grant execute on function public.onboard_own_company_v1(jsonb) to service_role;

revoke all on function public.create_company_admin_v1(jsonb) from public;
grant execute on function public.create_company_admin_v1(jsonb) to authenticated;
grant execute on function public.create_company_admin_v1(jsonb) to service_role;
