-- ============================================================
-- Sprint Security-1: SECURITY DEFINER RPC + billing RLS hardening
-- ============================================================

-- ── Portal RPCs: scope customer lookup by company ────────────

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
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  select id into v_customer_id
  from public.customers
  where phone = p_phone
    and company_id = p_company_id
  limit 1;

  if v_customer_id is not null then
    return jsonb_build_object('customer_id', v_customer_id, 'exists', true);
  end if;

  select coalesce(p.user_id, p.id) into v_owner
  from public.profiles p
  where p.company_id = p_company_id and coalesce(p.is_active, true) = true
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
  if p_company_id is null then
    raise exception 'company_id is required';
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
    insert into public.customers (user_id, company_id, name, email, phone)
    values (v_owner, p_company_id, p_name, p_email, p_phone)
    returning id into v_customer_id;
  else
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

-- ── Financial RPCs: require caller tenant match ──────────────

create or replace function public.financial_next_invoice_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_seq integer;
  v_number text;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;
  if auth.role() = 'authenticated'
     and not public.is_super_admin()
     and p_company_id is distinct from public.current_company_id() then
    raise exception 'Access denied: company context mismatch';
  end if;

  insert into public.company_financial_settings (company_id)
  values (p_company_id)
  on conflict (company_id) do nothing;

  update public.company_financial_settings
  set next_invoice_sequence = next_invoice_sequence + 1
  where company_id = p_company_id
  returning invoice_prefix, next_invoice_sequence - 1 into v_prefix, v_seq;

  v_number := v_prefix || '-' || lpad(v_seq::text, 6, '0');
  return v_number;
end;
$$;

create or replace function public.financial_append_ledger(
  p_company_id uuid,
  p_entry_type text,
  p_direction text,
  p_amount_cents bigint,
  p_currency text,
  p_reference_type text,
  p_reference_id uuid,
  p_description text,
  p_metadata jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;
  if auth.role() = 'authenticated'
     and not public.is_super_admin()
     and p_company_id is distinct from public.current_company_id() then
    raise exception 'Access denied: company context mismatch';
  end if;

  insert into public.financial_ledger_entries (
    company_id, entry_type, direction, amount_cents, currency,
    reference_type, reference_id, description, metadata, created_by
  ) values (
    p_company_id, p_entry_type, p_direction, p_amount_cents, p_currency,
    p_reference_type, p_reference_id, p_description, p_metadata, p_created_by
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Billing RLS: remove global billing.view bypass ─────────

drop policy if exists company_billing_contacts_select on public.company_billing_contacts;
create policy company_billing_contacts_select on public.company_billing_contacts for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and (
        public.user_has_permission('billing.view')
        or public.user_has_permission('billing.view_own')
        or public.user_has_permission('billing.contact.edit_own')
      )
    )
  )
);

drop policy if exists company_billing_profiles_select on public.company_billing_profiles;
create policy company_billing_profiles_select on public.company_billing_profiles for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and (
        public.user_has_permission('billing.view')
        or public.user_has_permission('billing.view_own')
      )
    )
  )
);

drop policy if exists usage_records_select on public.usage_records;
create policy usage_records_select on public.usage_records for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.view')
    )
  )
);

drop policy if exists usage_aggregates_select on public.usage_aggregates;
create policy usage_aggregates_select on public.usage_aggregates for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.view')
    )
  )
);

drop policy if exists company_usage_snapshots_select on public.company_usage_snapshots;
create policy company_usage_snapshots_select on public.company_usage_snapshots for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('billing.view')
    )
  )
);

-- ── Companies SELECT: scope companies.view to own tenant ─────

drop policy if exists companies_select on public.companies;
drop policy if exists companies_member_select on public.companies;
drop policy if exists companies_super_admin_select on public.companies;
drop policy if exists companies_tenant_select on public.companies;

create policy companies_tenant_select on public.companies for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or id = public.current_company_id()
  )
);

-- ── tenant_admin_role_audit: enable RLS ──────────────────────

alter table if exists public.tenant_admin_role_audit enable row level security;

drop policy if exists tenant_admin_role_audit_select on public.tenant_admin_role_audit;
create policy tenant_admin_role_audit_select on public.tenant_admin_role_audit for select using (
  public.is_super_admin()
);

revoke select on public.tenant_admin_role_audit from authenticated;
grant select on public.tenant_admin_role_audit to service_role;
