-- ============================================================
-- 346 — CVP Instagram appointment reschedule workflow
--
-- phone -> upcoming booking -> date -> slot -> domain reschedule
-- ============================================================

do $$
declare
  v_company_id uuid := 'd4fdae9a-bb72-4bae-903c-cb4b971d18a8';
  v_flow_id uuid := 'c51aba68-50ed-4758-bb66-fef2bddf2010';
  v_phone_node_id uuid := 'c3f44eb9-7f8b-4fe5-a581-76b6637320f1';
  v_success_node_id uuid := 'd594ebcb-d174-4a46-839a-df58ca5ad100';
  v_phone_edge_id text := 'a73414d4-76e7-4fc5-965f-f80fe56dbafb';
  v_success_edge_id text := 'b678e344-99a0-46cf-8b4f-c192c80f5061';
  v_flow public.automation_flows%rowtype;
  v_active public.automation_flow_versions%rowtype;
  v_snapshot jsonb;
  v_nodes jsonb;
  v_edges jsonb;
  v_node jsonb;
  v_edge jsonb;
  v_new_nodes jsonb := '[]'::jsonb;
  v_new_edges jsonb := '[]'::jsonb;
  v_phone_node jsonb;
  v_success_node jsonb;
  v_publish jsonb;
  v_required_count integer := 0;
begin
  select *
  into v_flow
  from public.automation_flows
  where id = v_flow_id
    and company_id = v_company_id
    and deleted_at is null;

  if not found then
    raise notice '346: CVP workflow not found; skipping tenant workflow publish';
    return;
  end if;

  select *
  into v_active
  from public.automation_flow_versions
  where id = v_flow.active_version_id
    and flow_id = v_flow_id
    and status = 'published';

  if not found then
    raise notice '346: CVP active workflow version not found; skipping';
    return;
  end if;

  v_snapshot := coalesce(v_active.snapshot, '{}'::jsonb);
  v_nodes := coalesce(v_snapshot->'nodes', '[]'::jsonb);
  v_edges := coalesce(v_snapshot->'edges', '[]'::jsonb);

  -- Idempotency for environments where this tenant patch was already published.
  if exists (
    select 1
    from jsonb_array_elements(v_nodes) n
    where n->>'id' = v_phone_node_id::text
  ) then
    raise notice '346: CVP reschedule phone step already present; skipping republish';
    return;
  end if;

  select count(*)
  into v_required_count
  from jsonb_array_elements(v_nodes) n
  where n->>'id' in (
    'b64af239-2b8c-4717-9349-50b6af61d184',
    'b35e23ca-9ed7-4049-b946-13976661aea4',
    '57390aed-6255-4f20-8d30-77910628a17d',
    '9cd59d37-c6fc-474d-b427-cae580ce2c85',
    'e19b1c16-17b1-4a3d-aa26-be7963862385'
  );
  if v_required_count <> 5 then
    raise exception '346: expected five CVP reschedule nodes, found %', v_required_count;
  end if;

  for v_node in select value from jsonb_array_elements(v_nodes)
  loop
    case v_node->>'id'
      when 'b64af239-2b8c-4717-9349-50b6af61d184' then
        v_node := jsonb_set(
          v_node,
          '{config}',
          coalesce(v_node->'config', '{}'::jsonb)
            || jsonb_build_object(
              'action', 'find_booking',
              'builderType', 'find_booking',
              'lookupBy', 'phone',
              'value', jsonb_build_object(
                'mode', 'variable',
                'variable', '{{customer_phone}}'
              ),
              'reschedulePath', true
            ),
          true
        );
      when 'b35e23ca-9ed7-4049-b946-13976661aea4' then
        v_node := jsonb_set(
          v_node,
          '{config,filters}',
          coalesce(v_node->'config'->'filters', '{}'::jsonb)
            || jsonb_build_object('phone', '{{customer_phone}}'),
          true
        );
      when '57390aed-6255-4f20-8d30-77910628a17d' then
        v_node := jsonb_set(
          v_node,
          '{config,filters}',
          coalesce(v_node->'config'->'filters', '{}'::jsonb)
            || jsonb_build_object(
              'service_id', '{{booking.service_id}}',
              'resource_id', '{{booking.resource_id}}'
            ),
          true
        );
      when '9cd59d37-c6fc-474d-b427-cae580ce2c85' then
        v_node := jsonb_set(
          v_node,
          '{config,filters}',
          coalesce(v_node->'config'->'filters', '{}'::jsonb)
            || jsonb_build_object(
              'service_id', '{{booking.service_id}}',
              'resource_id', '{{booking.resource_id}}',
              'date', '{{selected_date.date}}'
            ),
          true
        );
      when 'e19b1c16-17b1-4a3d-aa26-be7963862385' then
        v_node := jsonb_set(
          v_node,
          '{config}',
          coalesce(v_node->'config', '{}'::jsonb)
            || jsonb_build_object(
              'action', 'reschedule_booking',
              'builderType', 'reschedule_booking',
              'bookingId', jsonb_build_object(
                'mode', 'variable',
                'variable', '{{booking.id}}'
              )
            ),
          true
        );
      else
        null;
    end case;
    v_new_nodes := v_new_nodes || jsonb_build_array(v_node);
  end loop;

  select value
  into v_node
  from jsonb_array_elements(v_nodes)
  where value->>'id' = 'b64af239-2b8c-4717-9349-50b6af61d184';
  v_phone_node := jsonb_build_object(
    'id', v_phone_node_id,
    'type', 'action',
    'config', jsonb_build_object(
      'action', 'wait_for_input',
      'builderType', 'wait_for_input',
      'inputKey', 'customer_phone',
      'message', 'من فضلك اكتبي رقم التليفون المسجل عليه الحجز.',
      'messages', jsonb_build_object(
        'ar', 'من فضلك اكتبي رقم التليفون المسجل عليه الحجز.',
        'en', 'Please enter the phone number used for the booking.'
      )
    ),
    'positionX', coalesce((v_node->>'positionX')::numeric, 0) - 320,
    'positionY', coalesce((v_node->>'positionY')::numeric, 0)
  );

  select value
  into v_node
  from jsonb_array_elements(v_nodes)
  where value->>'id' = 'e19b1c16-17b1-4a3d-aa26-be7963862385';
  v_success_node := jsonb_build_object(
    'id', v_success_node_id,
    'type', 'action',
    'config', jsonb_build_object(
      'action', 'send_message',
      'builderType', 'send_message',
      'channel', 'instagram',
      'message', E'تم تغيير ميعاد الكشف بنجاح ✅\nالتاريخ الجديد: {{booking.display_date}}\nالوقت الجديد: {{booking.display_time}}\nرقم الحجز: {{booking.confirmation_number}}',
      'messages', jsonb_build_object(
        'ar', E'تم تغيير ميعاد الكشف بنجاح ✅\nالتاريخ الجديد: {{booking.display_date}}\nالوقت الجديد: {{booking.display_time}}\nرقم الحجز: {{booking.confirmation_number}}',
        'en', E'Your appointment was rescheduled successfully ✅\nNew date: {{booking.display_date}}\nNew time: {{booking.display_time}}\nBooking number: {{booking.confirmation_number}}'
      )
    ),
    'positionX', coalesce((v_node->>'positionX')::numeric, 0) + 320,
    'positionY', coalesce((v_node->>'positionY')::numeric, 0)
  );
  v_new_nodes := v_new_nodes || jsonb_build_array(v_phone_node, v_success_node);

  for v_edge in select value from jsonb_array_elements(v_edges)
  loop
    if v_edge->>'id' = '6bd56398-1086-4035-a3c1-905e454a7adc' then
      v_edge := jsonb_set(v_edge, '{targetNodeId}', to_jsonb(v_phone_node_id::text), true);
    elsif v_edge->>'id' = '0e4f2ee9-2995-484c-b944-831094d12af2' then
      v_edge := jsonb_set(v_edge, '{targetNodeId}', to_jsonb(v_success_node_id::text), true);
    end if;
    v_new_edges := v_new_edges || jsonb_build_array(v_edge);
  end loop;

  v_new_edges := v_new_edges || jsonb_build_array(
    jsonb_build_object(
      'id', v_phone_edge_id,
      'sourceNodeId', v_phone_node_id,
      'targetNodeId', 'b64af239-2b8c-4717-9349-50b6af61d184',
      'condition', '{}'::jsonb
    ),
    jsonb_build_object(
      'id', v_success_edge_id,
      'sourceNodeId', v_success_node_id,
      'targetNodeId', '11a88e9b-8abc-4792-9b7a-b646e92c77b2',
      'condition', '{}'::jsonb
    )
  );

  v_snapshot := jsonb_set(
    jsonb_set(v_snapshot, '{nodes}', v_new_nodes, true),
    '{edges}',
    v_new_edges,
    true
  );

  -- Keep Workflow Builder draft in sync so a later UI publish cannot regress this fix.
  for v_node in select value from jsonb_array_elements(v_new_nodes)
  loop
    if v_node->>'id' in (
      'b64af239-2b8c-4717-9349-50b6af61d184',
      'b35e23ca-9ed7-4049-b946-13976661aea4',
      '57390aed-6255-4f20-8d30-77910628a17d',
      '9cd59d37-c6fc-474d-b427-cae580ce2c85',
      'e19b1c16-17b1-4a3d-aa26-be7963862385'
    ) then
      update public.automation_nodes
      set config = v_node->'config'
      where id = (v_node->>'id')::uuid
        and flow_id = v_flow_id;
    end if;
  end loop;

  insert into public.automation_nodes (id, flow_id, type, config, position_x, position_y)
  values
    (
      v_phone_node_id, v_flow_id, 'action', v_phone_node->'config',
      (v_phone_node->>'positionX')::numeric, (v_phone_node->>'positionY')::numeric
    ),
    (
      v_success_node_id, v_flow_id, 'action', v_success_node->'config',
      (v_success_node->>'positionX')::numeric, (v_success_node->>'positionY')::numeric
    )
  on conflict (id) do update set
    config = excluded.config,
    position_x = excluded.position_x,
    position_y = excluded.position_y;

  update public.automation_edges
  set target_node_id = v_phone_node_id
  where id = '6bd56398-1086-4035-a3c1-905e454a7adc'
    and flow_id = v_flow_id;

  update public.automation_edges
  set target_node_id = v_success_node_id
  where id = '0e4f2ee9-2995-484c-b944-831094d12af2'
    and flow_id = v_flow_id;

  insert into public.automation_edges (id, flow_id, source_node_id, target_node_id, condition)
  values
    (
      v_phone_edge_id, v_flow_id, v_phone_node_id,
      'b64af239-2b8c-4717-9349-50b6af61d184', '{}'::jsonb
    ),
    (
      v_success_edge_id, v_flow_id, v_success_node_id,
      '11a88e9b-8abc-4792-9b7a-b646e92c77b2', '{}'::jsonb
    )
  on conflict (id) do update set
    source_node_id = excluded.source_node_id,
    target_node_id = excluded.target_node_id,
    condition = excluded.condition;

  v_publish := public.publish_automation_workflow_version(
    v_flow_id,
    v_company_id,
    'Add Instagram phone-first appointment reschedule flow',
    v_snapshot,
    null,
    v_flow.name,
    coalesce(v_flow.description, ''),
    v_flow.trigger_type,
    coalesce(v_flow.metadata, '{}'::jsonb),
    null
  );

  raise notice '346: published CVP reschedule workflow version %', v_publish->>'version_number';
end;
$$;
