-- ============================================================
-- 305 — Fix package feature grant source drift
--
-- Production still has the Phase 6 CHECK (trial/manual/contract/system)
-- while assign_company_package_v1 / _set_company_feature_grant_internal
-- write source='package' (Phase 7.2).
--
-- Additive. Does NOT re-run 263/267. Does NOT replace the 289 public
-- wrapper. Does NOT sync or backfill company package grants.
-- ============================================================

alter table public.company_feature_overrides
  drop constraint if exists company_feature_overrides_source_check;

alter table public.company_feature_overrides
  add constraint company_feature_overrides_source_check
  check (source in ('trial', 'manual', 'contract', 'system', 'package'));

comment on constraint company_feature_overrides_source_check on public.company_feature_overrides is
  'Grant provenance. package is required so package assign/change can revoke only package-derived grants.';

-- Restore package on the 289-moved body. Public wrapper is unchanged.
create or replace function internal.set_company_feature_grant(
  p_company_id uuid,
  p_feature_code text,
  p_enabled boolean,
  p_source text default 'manual',
  p_starts_at timestamptz default now(),
  p_expires_at timestamptz default null,
  p_notes text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path to internal, public
as $$
declare
  v_id uuid;
  v_previous jsonb;
  v_source text := coalesce(nullif(trim(p_source), ''), 'manual');
  v_state text := case when coalesce(p_enabled, false) then 'enabled' else 'disabled' end;
  v_reason text := coalesce(
    nullif(trim(p_reason), ''),
    nullif(trim(p_notes), ''),
    case when coalesce(p_enabled, false) then 'Feature enabled' else 'Feature disabled' end
  );
  v_event text;
begin
  if auth.role() <> 'authenticated' and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  -- Commercial grant mutations: platform super-admin only (not tenant billing.features.edit)
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Insufficient permissions to manage company feature grants';
  end if;

  if p_company_id is null or p_feature_code is null then
    raise exception 'company_id and feature_code are required';
  end if;

  if v_source not in ('trial', 'manual', 'contract', 'system', 'package') then
    raise exception 'Invalid grant source: %', v_source;
  end if;

  if not exists (
    select 1 from public.feature_definitions fd
    where fd.code = p_feature_code and fd.is_active = true
  ) then
    raise exception 'Unknown feature code: %', p_feature_code;
  end if;

  select jsonb_build_object(
    'override_state', o.override_state,
    'source', o.source,
    'starts_at', o.starts_at,
    'expires_at', o.expires_at,
    'notes', o.notes,
    'reason', o.reason
  )
  into v_previous
  from public.company_feature_overrides o
  where o.company_id = p_company_id
    and o.feature_code = p_feature_code
    and o.is_active = true
  limit 1;

  update public.company_feature_overrides
  set is_active = false,
      updated_by = auth.uid(),
      updated_at = now()
  where company_id = p_company_id
    and feature_code = p_feature_code
    and is_active = true;

  insert into public.company_feature_overrides (
    company_id,
    feature_code,
    override_state,
    reason,
    starts_at,
    expires_at,
    source,
    notes,
    is_active,
    created_by,
    updated_by
  )
  values (
    p_company_id,
    p_feature_code,
    v_state,
    v_reason,
    coalesce(p_starts_at, now()),
    p_expires_at,
    v_source,
    p_notes,
    true,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  v_event := case
    when v_state = 'enabled'
      and v_previous is not null
      and (v_previous->>'expires_at') is distinct from coalesce(p_expires_at::text, '')
      and p_expires_at is not null
      and (v_previous->>'override_state') = 'enabled'
      then 'feature_extended'
    when v_state = 'enabled' then 'feature_enabled'
    else 'feature_disabled'
  end;

  perform public.write_billing_audit_log(
    v_event,
    p_company_id,
    v_previous,
    jsonb_build_object(
      'override_state', v_state,
      'source', v_source,
      'starts_at', coalesce(p_starts_at, now()),
      'expires_at', p_expires_at,
      'notes', p_notes,
      'reason', v_reason
    ),
    'manual',
    jsonb_build_object('feature_code', p_feature_code, 'override_id', v_id)
  );

  return v_id;
end;
$$;

revoke all on function internal.set_company_feature_grant(uuid, text, boolean, text, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function internal.set_company_feature_grant(uuid, text, boolean, text, timestamptz, timestamptz, text, text) to authenticated, service_role;
