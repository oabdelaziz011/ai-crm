-- ============================================================
-- 341 — CVP Human Handoff auto-routing infrastructure
--
-- - handoff_increment_member_assignment RPC (atomic load bump)
-- - handoff_sync_member_active_conversation_count RPC (release/close reconcile)
-- - CVP Customer Support queue + customer_requested escalation rule
-- - Queue members: active users with Human Handoff Agent role
-- - CVP workflow support branch: send_message(1966) -> handoff_to_human
-- ============================================================

-- ── RPC: increment member assignment load (atomic) ───────────

create or replace function public.handoff_increment_member_assignment(
  p_queue_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.handoff_queue_members
  set
    active_conversation_count = active_conversation_count + 1,
    last_assigned_at = now(),
    updated_at = now()
  where queue_id = p_queue_id
    and user_id = p_user_id
    and is_active = true;

  if not found then
    raise exception 'handoff queue member not found for queue % and user %', p_queue_id, p_user_id;
  end if;
end;
$$;

revoke all on function public.handoff_increment_member_assignment(uuid, uuid) from public;
grant execute on function public.handoff_increment_member_assignment(uuid, uuid) to service_role;

-- ── RPC: reconcile member load from ownership (release/close) ─

create or replace function public.handoff_sync_member_active_conversation_count(
  p_company_id uuid,
  p_user_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.handoff_queue_members m
  set
    active_conversation_count = coalesce(
      (
        select count(*)::int
        from public.handoff_conversation_ownership o
        where o.company_id = p_company_id
          and o.assigned_user_id = p_user_id
          and o.owner_type = 'human_agent'
          and o.lifecycle_state in (
            'ASSIGNED',
            'PENDING_CUSTOMER',
            'PENDING_INTERNAL',
            'ESCALATED'
          )
      ),
      0
    ),
    updated_at = now()
  where m.company_id = p_company_id
    and m.user_id = p_user_id
    and m.is_active = true;
$$;

revoke all on function public.handoff_sync_member_active_conversation_count(uuid, uuid) from public;
grant execute on function public.handoff_sync_member_active_conversation_count(uuid, uuid) to service_role;

-- ── CVP handoff queue + escalation rule + members ────────────

do $$
declare
  v_company_id uuid := 'd4fdae9a-bb72-4bae-903c-cb4b971d18a8';
  v_queue_id uuid;
  v_member_count integer := 0;
begin
  if not exists (select 1 from public.companies c where c.id = v_company_id) then
    raise notice '341: CVP company % not found — skipping handoff seed', v_company_id;
    return;
  end if;

  select q.id
  into v_queue_id
  from public.handoff_queues q
  where q.company_id = v_company_id
    and q.slug = 'support'
    and q.deleted_at is null
  limit 1;

  if v_queue_id is null then
    insert into public.handoff_queues (
      company_id,
      name,
      slug,
      description,
      routing_strategy,
      is_active
    ) values (
      v_company_id,
      'Customer Support',
      'support',
      'CVP WhatsApp human handoff queue',
      'least_busy',
      true
    )
    returning id into v_queue_id;
  else
    update public.handoff_queues
    set
      name = 'Customer Support',
      description = 'CVP WhatsApp human handoff queue',
      routing_strategy = 'least_busy',
      is_active = true,
      updated_at = now()
    where id = v_queue_id;
  end if;

  insert into public.handoff_escalation_rules (
    company_id,
    name,
    trigger_code,
    target_queue_id,
    is_active
  )
  select
    v_company_id,
    'Customer requested human',
    'customer_requested',
    v_queue_id,
    true
  where not exists (
    select 1
    from public.handoff_escalation_rules r
    where r.company_id = v_company_id
      and r.trigger_code = 'customer_requested'
      and r.deleted_at is null
  );

  update public.handoff_escalation_rules r
  set
    target_queue_id = v_queue_id,
    is_active = true,
    updated_at = now()
  where r.company_id = v_company_id
    and r.trigger_code = 'customer_requested'
    and r.deleted_at is null;

  insert into public.handoff_queue_members (
    queue_id,
    company_id,
    user_id,
    is_active
  )
  select distinct
    v_queue_id,
    v_company_id,
    ur.user_id,
    true
  from public.user_roles ur
  inner join public.roles r
    on r.id = ur.role_id
   and r.company_id = v_company_id
   and r.template_key = 'human_handoff_agent'
  inner join public.profiles p
    on p.user_id = ur.user_id
   and p.company_id = v_company_id
   and p.is_active = true
  on conflict (queue_id, user_id) do update
  set is_active = true, updated_at = now();

  get diagnostics v_member_count = row_count;

  if v_member_count = 0 then
    raise notice '341: no active Human Handoff Agent users found for CVP — queue created without members';
  end if;
end;
$$;

-- ── CVP workflow: support branch handoff_to_human ────────────

do $$
declare
  v_company_id uuid := 'd4fdae9a-bb72-4bae-903c-cb4b971d18a8';
  v_flow_id uuid := 'c51aba68-50ed-4758-bb66-fef2bddf2010';
  v_flow public.automation_flows%rowtype;
  v_active_version public.automation_flow_versions%rowtype;
  v_snapshot jsonb;
  v_nodes jsonb;
  v_edges jsonb;
  v_node jsonb;
  v_new_nodes jsonb := '[]'::jsonb;
  v_changed boolean := false;
  v_publish jsonb;
begin
  select f.*
  into v_flow
  from public.automation_flows f
  where f.id = v_flow_id
    and f.company_id = v_company_id
    and f.deleted_at is null;

  if not found then
    raise notice '341: CVP workflow % not found — skipping workflow publish', v_flow_id;
    return;
  end if;

  select v.*
  into v_active_version
  from public.automation_flow_versions v
  where v.flow_id = v_flow_id
    and v.is_active = true
    and v.status = 'published'
  order by v.version_number desc
  limit 1;

  if not found then
    raise notice '341: no active published version for CVP workflow %', v_flow_id;
    return;
  end if;

  v_snapshot := coalesce(v_active_version.snapshot, '{}'::jsonb);
  v_nodes := coalesce(v_snapshot->'nodes', '[]'::jsonb);
  v_edges := coalesce(v_snapshot->'edges', '[]'::jsonb);

  for v_node in
    select value
    from jsonb_array_elements(v_nodes)
  loop
    if coalesce(v_node->'config'->>'action', '') = 'send_message'
       and (
         coalesce(v_node->'config'->>'message', '') ilike '%1966%'
         or coalesce(v_node->'config'->'message'->>'ar', '') ilike '%1966%'
         or coalesce(v_node->'config'->'message'->>'en', '') ilike '%1966%'
         or coalesce(v_node->'config'->>'text', '') ilike '%1966%'
       )
    then
      v_node := jsonb_set(
        v_node,
        '{config}',
        coalesce(v_node->'config', '{}'::jsonb)
          || jsonb_build_object(
            'action', 'handoff_to_human',
            'builderType', 'handoff_to_human',
            'triggerCode', 'customer_requested',
            'reason', 'Customer requested human support'
          ),
        true
      );
      v_changed := true;
    end if;

    v_new_nodes := v_new_nodes || jsonb_build_array(v_node);
  end loop;

  if not v_changed then
    raise notice '341: CVP support send_message(1966) node not found — workflow unchanged';
    return;
  end if;

  v_snapshot := jsonb_set(v_snapshot, '{nodes}', v_new_nodes, true);

  v_publish := public.publish_automation_workflow_version(
    v_flow_id,
    v_company_id,
    'Replace support 1966 message with automatic human handoff',
    v_snapshot,
    null,
    v_flow.name,
    coalesce(v_flow.description, ''),
    v_flow.trigger_type,
    coalesce(v_flow.metadata, '{}'::jsonb),
    null
  );

  raise notice '341: published CVP handoff workflow version %', v_publish->>'version_number';
end;
$$;
