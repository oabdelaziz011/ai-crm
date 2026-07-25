-- ============================================================
-- Vault OS – Version graph hardening
-- Immutability, runtime constraints, atomic publish RPC
-- ============================================================

-- ── Immutability: published version graphs are insert-only ───

create or replace function public.prevent_automation_version_graph_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Published workflow version graphs are immutable. Create a new version instead.';
end;
$$;

drop trigger if exists automation_flow_version_nodes_immutable on public.automation_flow_version_nodes;
create trigger automation_flow_version_nodes_immutable
  before update or delete on public.automation_flow_version_nodes
  for each row execute function public.prevent_automation_version_graph_mutation();

drop trigger if exists automation_flow_version_edges_immutable on public.automation_flow_version_edges;
create trigger automation_flow_version_edges_immutable
  before update or delete on public.automation_flow_version_edges
  for each row execute function public.prevent_automation_version_graph_mutation();

-- Deny UPDATE/DELETE via RLS (insert-only for authenticated roles)
drop policy if exists automation_flow_version_nodes_update on public.automation_flow_version_nodes;
drop policy if exists automation_flow_version_nodes_delete on public.automation_flow_version_nodes;
drop policy if exists automation_flow_version_edges_update on public.automation_flow_version_edges;
drop policy if exists automation_flow_version_edges_delete on public.automation_flow_version_edges;

-- ── Runtime version pinning constraints ──────────────────────

alter table public.automation_runs
  drop constraint if exists automation_runs_current_node_requires_version;

alter table public.automation_runs
  add constraint automation_runs_current_node_requires_version
  check (current_node_id is null or flow_version_id is not null);

alter table public.conversation_sessions
  drop constraint if exists conversation_sessions_current_node_requires_version;

alter table public.conversation_sessions
  add constraint conversation_sessions_current_node_requires_version
  check (current_node_id is null or flow_version_id is not null);

-- ── Pre-FK validation (idempotent safety check) ──────────────

do $$
declare
  orphan_run_count integer;
  orphan_session_count integer;
begin
  select count(*) into orphan_run_count
  from public.automation_runs r
  where r.current_node_id is not null
    and r.flow_version_id is not null
    and not exists (
      select 1
      from public.automation_flow_version_nodes n
      where n.flow_version_id = r.flow_version_id
        and n.id = r.current_node_id
    );

  select count(*) into orphan_session_count
  from public.conversation_sessions s
  where s.current_node_id is not null
    and s.flow_version_id is not null
    and not exists (
      select 1
      from public.automation_flow_version_nodes n
      where n.flow_version_id = s.flow_version_id
        and n.id = s.current_node_id
    );

  if orphan_run_count > 0 or orphan_session_count > 0 then
    raise exception
      'Version graph migration validation failed: % orphan run(s), % orphan session(s). Backfill automation_flow_version_nodes before applying FK constraints.',
      orphan_run_count, orphan_session_count;
  end if;
end;
$$;

-- ── Atomic publish RPC (single transaction) ──────────────────

create or replace function public.publish_automation_workflow_version(
  p_flow_id uuid,
  p_company_id uuid,
  p_release_notes text,
  p_snapshot jsonb,
  p_published_by uuid,
  p_flow_name text,
  p_flow_description text,
  p_flow_trigger_type text,
  p_flow_metadata jsonb,
  p_updated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow public.automation_flows%rowtype;
  v_version_number integer;
  v_version_id uuid;
  v_node jsonb;
  v_edge jsonb;
begin
  select * into v_flow
  from public.automation_flows
  where id = p_flow_id
    and company_id = p_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Automation flow % not found for company %.', p_flow_id, p_company_id;
  end if;

  if v_flow.status = 'archived' then
    raise exception 'Archived workflows cannot be published.';
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_version_number
  from public.automation_flow_versions
  where flow_id = p_flow_id;

  insert into public.automation_flow_versions (
    flow_id,
    company_id,
    version_number,
    release_notes,
    snapshot,
    status,
    is_active,
    is_immutable,
    published_at,
    published_by
  ) values (
    p_flow_id,
    p_company_id,
    v_version_number,
    coalesce(p_release_notes, ''),
    p_snapshot,
    'published',
    false,
    true,
    now(),
    p_published_by
  )
  returning id into v_version_id;

  for v_node in
    select value
    from jsonb_array_elements(coalesce(p_snapshot->'nodes', '[]'::jsonb))
  loop
    if v_node->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      insert into public.automation_flow_version_nodes (
        flow_version_id, id, flow_id, type, config, position_x, position_y
      ) values (
        v_version_id,
        (v_node->>'id')::uuid,
        p_flow_id,
        v_node->>'type',
        coalesce(v_node->'config', '{}'::jsonb),
        coalesce((v_node->>'positionX')::numeric, 0),
        coalesce((v_node->>'positionY')::numeric, 0)
      );
    end if;
  end loop;

  for v_edge in
    select value
    from jsonb_array_elements(coalesce(p_snapshot->'edges', '[]'::jsonb))
  loop
    if v_edge->>'sourceNodeId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and v_edge->>'targetNodeId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (
         select 1 from public.automation_flow_version_nodes n
         where n.flow_version_id = v_version_id
           and n.id = (v_edge->>'sourceNodeId')::uuid
       )
       and exists (
         select 1 from public.automation_flow_version_nodes n
         where n.flow_version_id = v_version_id
           and n.id = (v_edge->>'targetNodeId')::uuid
       )
    then
      insert into public.automation_flow_version_edges (
        flow_version_id, id, flow_id, source_node_id, target_node_id, condition
      ) values (
        v_version_id,
        v_edge->>'id',
        p_flow_id,
        (v_edge->>'sourceNodeId')::uuid,
        (v_edge->>'targetNodeId')::uuid,
        coalesce(v_edge->'condition', '{}'::jsonb)
      );
    end if;
  end loop;

  update public.automation_flow_versions
  set is_active = false
  where flow_id = p_flow_id;

  update public.automation_flow_versions
  set is_active = true, status = 'published'
  where id = v_version_id;

  update public.automation_flows
  set
    name = p_flow_name,
    description = coalesce(p_flow_description, ''),
    trigger_type = p_flow_trigger_type,
    metadata = coalesce(p_flow_metadata, '{}'::jsonb),
    active_version_id = v_version_id,
    version = v_version_number,
    has_unpublished_draft = false,
    status = 'active',
    updated_by = p_updated_by,
    updated_at = now()
  where id = p_flow_id;

  return jsonb_build_object(
    'version_id', v_version_id,
    'version_number', v_version_number,
    'flow_id', p_flow_id
  );
exception
  when others then
    raise;
end;
$$;

revoke all on function public.publish_automation_workflow_version(uuid, uuid, text, jsonb, uuid, text, text, text, jsonb, uuid) from public;
grant execute on function public.publish_automation_workflow_version(uuid, uuid, text, jsonb, uuid, text, text, text, jsonb, uuid) to service_role;
