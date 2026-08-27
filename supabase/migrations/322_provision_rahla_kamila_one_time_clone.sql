-- ============================================================
-- 322 — One-time deep clone of Super Admin «رحلة كاملة»
--
-- When a company becomes entitled to workflow_automation, create
-- exactly ONE independent company-owned copy of the platform
-- source workflow named «رحلة كاملة».
--
-- This is a ONE-TIME SNAPSHOT / DEEP CLONE:
--   - new flow / node / edge IDs
--   - company_id = target company
--   - NO parent_flow_id / template sync / version propagation
--   - source mutations never affect copies
--   - copy mutations never affect source or other companies
--
-- Idempotency: metadata.one_time_clone_key = 'rahla_kamila'
-- (unique per company among non-deleted flows).
-- ============================================================

-- Durable idempotency marker (not a live parent reference).
create unique index if not exists uq_automation_flows_one_time_clone_key
  on public.automation_flows (company_id, ((metadata ->> 'one_time_clone_key')))
  where deleted_at is null
    and nullif(trim(metadata ->> 'one_time_clone_key'), '') is not null;

comment on index public.uq_automation_flows_one_time_clone_key is
  'Ensures at most one auto-provisioned initial workflow clone per company per clone key.';

-- ── Resolve platform source «رحلة كاملة» (read-only lookup) ──

create or replace function public.resolve_rahla_kamila_source_flow_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  -- Canonical ValueOR platform company that owns the Super Admin source.
  v_platform_company_id constant uuid := '2d27f7fb-c15e-4d60-84e9-1793f36f2172';
begin
  select f.id
  into v_id
  from public.automation_flows f
  where f.company_id = v_platform_company_id
    and f.deleted_at is null
    and f.name = 'رحلة كاملة'
    and coalesce(nullif(trim(f.metadata ->> 'one_time_clone_key'), ''), '') = ''
  order by f.updated_at desc nulls last
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  -- Fallback: any non-clone platform-company flow with this name.
  select f.id
  into v_id
  from public.automation_flows f
  join public.companies c on c.id = f.company_id
  where c.company_type = 'platform'
    and f.deleted_at is null
    and f.name = 'رحلة كاملة'
    and coalesce(nullif(trim(f.metadata ->> 'one_time_clone_key'), ''), '') = ''
  order by f.updated_at desc nulls last
  limit 1;

  return v_id;
end;
$$;

revoke all on function public.resolve_rahla_kamila_source_flow_id() from public, anon;
grant execute on function public.resolve_rahla_kamila_source_flow_id() to authenticated, service_role;

-- ── Build snapshot from draft graph if no published version ──

create or replace function public._rahla_kamila_snapshot_from_draft(p_flow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_flow public.automation_flows%rowtype;
  v_nodes jsonb;
  v_edges jsonb;
begin
  select * into v_flow
  from public.automation_flows
  where id = p_flow_id
    and deleted_at is null;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', n.id::text,
      'type', n.type,
      'config', n.config,
      'positionX', n.position_x,
      'positionY', n.position_y
    )
    order by n.position_y, n.position_x, n.id
  ), '[]'::jsonb)
  into v_nodes
  from public.automation_nodes n
  where n.flow_id = p_flow_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.id::text,
      'sourceNodeId', e.source_node_id::text,
      'targetNodeId', e.target_node_id::text,
      'condition', e.condition
    )
    order by e.id
  ), '[]'::jsonb)
  into v_edges
  from public.automation_edges e
  where e.flow_id = p_flow_id;

  return jsonb_build_object(
    'name', v_flow.name,
    'description', v_flow.description,
    'triggerType', v_flow.trigger_type,
    'metadata', coalesce(v_flow.metadata, '{}'::jsonb),
    'nodes', v_nodes,
    'edges', v_edges
  );
end;
$$;

revoke all on function public._rahla_kamila_snapshot_from_draft(uuid) from public, anon;
grant execute on function public._rahla_kamila_snapshot_from_draft(uuid) to service_role;

-- ── Deep-clone provisioner (idempotent, no live sync) ────────

create or replace function public.provision_rahla_kamila_workflow_v1(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clone_key constant text := 'rahla_kamila';
  v_existing_id uuid;
  v_source_id uuid;
  v_source public.automation_flows%rowtype;
  v_snapshot jsonb;
  v_id_map jsonb := '{}'::jsonb;
  v_new_nodes jsonb := '[]'::jsonb;
  v_new_edges jsonb := '[]'::jsonb;
  v_node jsonb;
  v_edge jsonb;
  v_old_id text;
  v_new_id uuid;
  v_new_src text;
  v_new_tgt text;
  v_new_edge_id uuid;
  v_new_flow_id uuid;
  v_meta jsonb;
  v_publish jsonb;
  v_node_count integer := 0;
  v_edge_count integer := 0;
begin
  if p_company_id is null then
    return jsonb_build_object('status', 'error', 'reason', 'company_id_required');
  end if;

  -- Never clone onto platform/demo scaffolding companies.
  if exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.company_type in ('platform', 'demo')
  ) then
    return jsonb_build_object('status', 'skipped_platform_or_demo');
  end if;

  -- Idempotency: already has the one-time auto-provisioned copy.
  select f.id into v_existing_id
  from public.automation_flows f
  where f.company_id = p_company_id
    and f.deleted_at is null
    and f.metadata ->> 'one_time_clone_key' = v_clone_key
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'status', 'already_provisioned',
      'flow_id', v_existing_id,
      'clone_key', v_clone_key
    );
  end if;

  -- Only when Workflow entitlement is effectively ON.
  if not public.is_feature_enabled(p_company_id, 'workflow_automation') then
    return jsonb_build_object('status', 'skipped_not_entitled');
  end if;

  v_source_id := public.resolve_rahla_kamila_source_flow_id();
  if v_source_id is null then
    return jsonb_build_object('status', 'skipped_source_missing');
  end if;

  select * into v_source
  from public.automation_flows
  where id = v_source_id
    and deleted_at is null;

  if not found then
    return jsonb_build_object('status', 'skipped_source_missing');
  end if;

  -- Prefer active published snapshot (complete definition).
  select v.snapshot
  into v_snapshot
  from public.automation_flow_versions v
  where v.flow_id = v_source_id
    and v.is_active = true
  order by v.version_number desc
  limit 1;

  if v_snapshot is null or jsonb_typeof(v_snapshot->'nodes') is distinct from 'array' then
    v_snapshot := public._rahla_kamila_snapshot_from_draft(v_source_id);
  end if;

  if v_snapshot is null
     or jsonb_array_length(coalesce(v_snapshot->'nodes', '[]'::jsonb)) = 0 then
    return jsonb_build_object('status', 'skipped_source_empty', 'source_flow_id', v_source_id);
  end if;

  -- Remap every node to a NEW uuid (deep copy configs via jsonb).
  for v_node in
    select value from jsonb_array_elements(coalesce(v_snapshot->'nodes', '[]'::jsonb))
  loop
    v_old_id := v_node->>'id';
    if v_old_id is null or v_old_id = '' then
      continue;
    end if;
    v_new_id := gen_random_uuid();
    v_id_map := v_id_map || jsonb_build_object(v_old_id, to_jsonb(v_new_id::text));
    v_new_nodes := v_new_nodes || jsonb_build_array(
      jsonb_build_object(
        'id', v_new_id::text,
        'type', coalesce(v_node->>'type', 'action'),
        'config', coalesce(v_node->'config', '{}'::jsonb),
        'positionX', coalesce((v_node->>'positionX')::numeric, 0),
        'positionY', coalesce((v_node->>'positionY')::numeric, 0)
      )
    );
    v_node_count := v_node_count + 1;
  end loop;

  for v_edge in
    select value from jsonb_array_elements(coalesce(v_snapshot->'edges', '[]'::jsonb))
  loop
    v_new_src := v_id_map ->> (v_edge->>'sourceNodeId');
    v_new_tgt := v_id_map ->> (v_edge->>'targetNodeId');
    if v_new_src is null or v_new_tgt is null or v_new_src = v_new_tgt then
      continue;
    end if;
    v_new_edge_id := gen_random_uuid();
    v_new_edges := v_new_edges || jsonb_build_array(
      jsonb_build_object(
        'id', v_new_edge_id::text,
        'sourceNodeId', v_new_src,
        'targetNodeId', v_new_tgt,
        'condition', coalesce(v_edge->'condition', '{}'::jsonb)
      )
    );
    v_edge_count := v_edge_count + 1;
  end loop;

  -- Company-owned metadata: keep builder viewport etc., strip any linkage keys.
  v_meta := coalesce(v_snapshot->'metadata', v_source.metadata, '{}'::jsonb);
  if jsonb_typeof(v_meta) is distinct from 'object' then
    v_meta := '{}'::jsonb;
  end if;
  v_meta := v_meta
    - 'one_time_clone_key'
    - 'one_time_cloned_at'
    - 'parent_flow_id'
    - 'source_flow_id'
    - 'template_id'
    - 'template_key'
    - 'sync_from_template';
  v_meta := v_meta || jsonb_build_object(
    'one_time_clone_key', v_clone_key,
    'one_time_cloned_at', to_jsonb(now()::text)
  );

  begin
    insert into public.automation_flows (
      company_id,
      name,
      description,
      trigger_type,
      status,
      version,
      metadata,
      has_unpublished_draft,
      created_by,
      updated_by
    ) values (
      p_company_id,
      coalesce(nullif(trim(v_snapshot->>'name'), ''), v_source.name, 'رحلة كاملة'),
      coalesce(v_snapshot->>'description', v_source.description, ''),
      coalesce(
        nullif(trim(v_snapshot->>'triggerType'), ''),
        v_source.trigger_type,
        'inbound_message'
      ),
      'draft',
      1,
      v_meta,
      true,
      auth.uid(),
      auth.uid()
    )
    returning id into v_new_flow_id;
  exception
    when unique_violation then
      select f.id into v_existing_id
      from public.automation_flows f
      where f.company_id = p_company_id
        and f.deleted_at is null
        and f.metadata ->> 'one_time_clone_key' = v_clone_key
      limit 1;
      return jsonb_build_object(
        'status', 'already_provisioned',
        'flow_id', v_existing_id,
        'clone_key', v_clone_key
      );
  end;

  -- Draft graph (editable independently).
  for v_node in select value from jsonb_array_elements(v_new_nodes)
  loop
    insert into public.automation_nodes (
      id, flow_id, type, config, position_x, position_y
    ) values (
      (v_node->>'id')::uuid,
      v_new_flow_id,
      v_node->>'type',
      coalesce(v_node->'config', '{}'::jsonb),
      coalesce((v_node->>'positionX')::numeric, 0),
      coalesce((v_node->>'positionY')::numeric, 0)
    );
  end loop;

  for v_edge in select value from jsonb_array_elements(v_new_edges)
  loop
    insert into public.automation_edges (
      id, flow_id, source_node_id, target_node_id, condition
    ) values (
      (v_edge->>'id')::uuid,
      v_new_flow_id,
      (v_edge->>'sourceNodeId')::uuid,
      (v_edge->>'targetNodeId')::uuid,
      coalesce(v_edge->'condition', '{}'::jsonb)
    );
  end loop;

  -- Publish v1 so the copy is a normal usable/active workflow (still fully independent).
  v_publish := public.publish_automation_workflow_version(
    v_new_flow_id,
    p_company_id,
    'Initial one-time clone of رحلة كاملة',
    jsonb_build_object(
      'name', coalesce(nullif(trim(v_snapshot->>'name'), ''), 'رحلة كاملة'),
      'description', coalesce(v_snapshot->>'description', ''),
      'triggerType', coalesce(
        nullif(trim(v_snapshot->>'triggerType'), ''),
        v_source.trigger_type,
        'inbound_message'
      ),
      'metadata', v_meta,
      'nodes', v_new_nodes,
      'edges', v_new_edges
    ),
    auth.uid(),
    coalesce(nullif(trim(v_snapshot->>'name'), ''), 'رحلة كاملة'),
    coalesce(v_snapshot->>'description', ''),
    coalesce(
      nullif(trim(v_snapshot->>'triggerType'), ''),
      v_source.trigger_type,
      'inbound_message'
    ),
    v_meta,
    auth.uid()
  );

  return jsonb_build_object(
    'status', 'provisioned',
    'flow_id', v_new_flow_id,
    'clone_key', v_clone_key,
    'node_count', v_node_count,
    'edge_count', v_edge_count,
    'publish', v_publish
    -- Intentionally NO source_flow_id in the return payload used by apps for sync.
  );
end;
$$;

comment on function public.provision_rahla_kamila_workflow_v1(uuid) is
  'One-time deep clone of platform «رحلة كاملة» into a company. Idempotent via metadata.one_time_clone_key. No live template sync.';

revoke all on function public.provision_rahla_kamila_workflow_v1(uuid) from public, anon;
grant execute on function public.provision_rahla_kamila_workflow_v1(uuid) to authenticated, service_role;

-- ── Hook: manual / service_role feature grants ───────────────

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

  -- One-time workflow deep clone when Workflow entitlement becomes enabled.
  if v_state = 'enabled' and p_feature_code = 'workflow_automation' then
    perform public.provision_rahla_kamila_workflow_v1(p_company_id);
  end if;

  return v_id;
end;
$$;

revoke all on function internal.set_company_feature_grant(uuid, text, boolean, text, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function internal.set_company_feature_grant(uuid, text, boolean, text, timestamptz, timestamptz, text, text) to authenticated, service_role;

-- ── Hook: package / sync internal grants ─────────────────────

create or replace function public._set_company_feature_grant_internal(
  p_company_id uuid,
  p_feature_code text,
  p_enabled boolean,
  p_source text default 'package',
  p_starts_at timestamptz default now(),
  p_expires_at timestamptz default null,
  p_notes text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_source text := coalesce(nullif(trim(p_source), ''), 'package');
  v_state text := case when coalesce(p_enabled, false) then 'enabled' else 'disabled' end;
  v_reason text := coalesce(
    nullif(trim(p_reason), ''),
    nullif(trim(p_notes), ''),
    case when coalesce(p_enabled, false) then 'Package feature grant' else 'Package feature revoked' end
  );
  v_other_id uuid;
begin
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

  if v_state = 'enabled' then
    select o.id into v_other_id
    from public.company_feature_overrides o
    where o.company_id = p_company_id
      and o.feature_code = p_feature_code
      and o.is_active = true
      and o.source is distinct from v_source
    limit 1;

    if v_other_id is not null then
      -- Another source already holds the grant; still attempt clone if entitled.
      if p_feature_code = 'workflow_automation' then
        perform public.provision_rahla_kamila_workflow_v1(p_company_id);
      end if;
      return v_other_id;
    end if;
  end if;

  update public.company_feature_overrides
  set is_active = false,
      updated_by = auth.uid(),
      updated_at = now()
  where company_id = p_company_id
    and feature_code = p_feature_code
    and source = v_source
    and is_active = true;

  if v_state = 'disabled' then
    return null;
  end if;

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
    'enabled',
    v_reason,
    coalesce(p_starts_at, now()),
    p_expires_at,
    v_source,
    coalesce(p_notes, 'package provisioned'),
    true,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  if p_feature_code = 'workflow_automation' then
    perform public.provision_rahla_kamila_workflow_v1(p_company_id);
  end if;

  return v_id;
end;
$$;

revoke all on function public._set_company_feature_grant_internal(uuid, text, boolean, text, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public._set_company_feature_grant_internal(uuid, text, boolean, text, timestamptz, timestamptz, text, text) to service_role;

-- ── Hook: approval flips pending → entitled ──────────────────

create or replace function internal.approve_company_v1(
  p_company_id uuid,
  p_mode text default 'trial',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to internal, public
as $$
declare
  v_company public.companies%rowtype;
  v_mode text := lower(coalesce(nullif(trim(p_mode), ''), 'trial'));
  v_access jsonb;
  v_previous jsonb;
  v_already_approved boolean := false;
  v_result jsonb;
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

  -- After approval, commercial entitlements (including Workflow) may become effective.
  perform public.provision_rahla_kamila_workflow_v1(p_company_id);

  select * into v_company from public.companies where id = p_company_id;

  v_result := jsonb_build_object(
    'company', to_jsonb(v_company),
    'company_id', p_company_id,
    'mode', v_mode,
    'already_approved', v_already_approved,
    'access', v_access
  );

  return v_result;
end;
$$;

revoke all on function internal.approve_company_v1(uuid, text, text) from public, anon;
grant execute on function internal.approve_company_v1(uuid, text, text) to authenticated, service_role;
