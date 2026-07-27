-- Sprint CRM-Agent-1 — Enterprise CRM Agent tools + ops metrics

insert into public.permissions (code, category, module, action, description)
values
  ('customers.search', 'customers', 'customers', 'search', 'Search customer records via CRM agent tools.'),
  ('customers.update', 'customers', 'customers', 'update', 'Update customer fields via CRM agent tools.'),
  ('customers.merge', 'customers', 'customers', 'merge', 'Merge duplicate customer records via CRM agent tools.'),
  ('customers.import', 'customers', 'customers', 'import', 'Bulk import customers via CRM agent tools.')
on conflict (code) do update set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- CRM agent tool definitions
insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'search_customer',
    'Search Customers',
    'Search CRM customers by name, email, phone, or inactivity window.',
    'crm', '1.0.0', true,
    '["tools.execute", "customers.search"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"query":{"type":"string"},"inactiveDays":{"type":"number"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"total":{"type":"number"}}}'::jsonb,
    20000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'update_customer',
    'Update Customer',
    'Update a single field on an existing CRM customer.',
    'crm', '1.0.0', true,
    '["tools.execute", "customers.update"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"customerId":{"type":"string"},"field":{"type":"string"},"value":{"type":"string"}},"required":["customerId","field","value"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"customerId":{"type":"string"}}}'::jsonb,
    20000,
    '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'merge_customers',
    'Merge Customers',
    'Merge duplicate customer records into a primary profile. Requires explicit confirmation.',
    'crm', '1.0.0', true,
    '["tools.execute", "customers.merge"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"primaryCustomerId":{"type":"string"},"duplicateCustomerIds":{"type":"array"},"confirmed":{"type":"boolean"}},"required":["primaryCustomerId","duplicateCustomerIds"]}'::jsonb,
    '{"type":"object","properties":{"merged":{"type":"boolean"},"mergedCount":{"type":"number"}}}'::jsonb,
    30000,
    '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'import_customers',
    'Import Customers',
    'Bulk import customers from structured rows. Requires explicit confirmation.',
    'crm', '1.0.0', true,
    '["tools.execute", "customers.import"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"rows":{"type":"array"},"confirmed":{"type":"boolean"}},"required":["rows"]}'::jsonb,
    '{"type":"object","properties":{"imported":{"type":"number"},"skipped":{"type":"number"}}}'::jsonb,
    60000,
    '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'knowledge_search',
    'Knowledge Search',
    'Hybrid RAG search across company knowledge for policies, FAQs, and procedures.',
    'knowledge', '1.0.0', true,
    '["tools.execute", "knowledge.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"results":{"type":"array"}}}'::jsonb,
    45000,
    '{"maxAttempts":2,"backoffMs":1000}'::jsonb
  ),
  (
    'invoice_search',
    'Invoice Search',
    'Search customer invoices including overdue filters.',
    'billing', '1.0.0', true,
    '["tools.execute", "invoices.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"status":{"type":"string"},"overdueOnly":{"type":"boolean"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"total":{"type":"number"}}}'::jsonb,
    20000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'booking_search',
    'Booking Search',
    'Search bookings by customer and recency window.',
    'scheduling', '1.0.0', true,
    '["tools.execute", "bookings.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"customerId":{"type":"string"},"daysBack":{"type":"number"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"total":{"type":"number"}}}'::jsonb,
    20000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'find_duplicate_customers',
    'Find Duplicate Customers',
    'Detect duplicate CRM profiles by matching phone or email.',
    'crm', '1.0.0', true,
    '["tools.execute", "customers.search"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"total":{"type":"number"}}}'::jsonb,
    30000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  )
on conflict (key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  is_enabled = excluded.is_enabled,
  required_permissions = excluded.required_permissions,
  supported_states = excluded.supported_states,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  timeout_ms = excluded.timeout_ms,
  retry_policy = excluded.retry_policy,
  updated_at = now();

-- Extend agent workflow ops feed with CRM agent metadata
drop function if exists public.platform_ai_ops_agent_workflows(int);

create or replace function public.platform_ai_ops_agent_workflows(p_limit int default 20)
returns table (
  id uuid,
  company_id uuid,
  company_name text,
  goal text,
  status text,
  progress numeric,
  task_count int,
  correlation_id text,
  agent_type text,
  tools_used text[],
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.platform_ai_ops_assert_super_admin();

  return query
  select
    w.id,
    w.company_id,
    c.name,
    w.goal,
    w.status,
    coalesce((w.memory->'executionState'->>'progress')::numeric, 0),
    jsonb_array_length(coalesce(w.task_graph->'nodes', '[]'::jsonb))::int,
    w.correlation_id,
    coalesce(w.task_graph->>'agentType', w.memory->'executionState'->>'agentType', 'generic'),
    coalesce(
      (
        select array_agg(distinct node->>'tool')
        from jsonb_array_elements(coalesce(w.task_graph->'nodes', '[]'::jsonb)) node
        where coalesce(node->>'tool', '') <> ''
      ),
      array[]::text[]
    ),
    w.created_at,
    w.updated_at
  from public.agent_workflows w
  join public.companies c on c.id = w.company_id
  order by w.updated_at desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.platform_ai_ops_agent_workflows(int) to authenticated;

-- CRM agent summary for ops dashboard
create or replace function public.platform_ai_ops_crm_agent_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  perform public.platform_ai_ops_assert_super_admin();

  select jsonb_build_object(
    'total_workflows', count(*)::int,
    'crm_workflows', count(*) filter (where coalesce(task_graph->>'agentType', 'generic') = 'crm')::int,
    'running', count(*) filter (where status in ('running', 'planning'))::int,
    'waiting_user', count(*) filter (where status = 'waiting_user')::int,
    'completed_24h', count(*) filter (
      where status = 'completed' and completed_at >= now() - interval '24 hours'
    )::int,
    'failed_24h', count(*) filter (
      where status = 'failed' and updated_at >= now() - interval '24 hours'
    )::int,
    'top_tools', coalesce(
      (
        select jsonb_agg(jsonb_build_object('tool', tool_key, 'count', tool_count) order by tool_count desc)
        from (
          select node->>'tool' as tool_key, count(*)::int as tool_count
          from public.agent_workflows w,
               jsonb_array_elements(coalesce(w.task_graph->'nodes', '[]'::jsonb)) node
          where coalesce(w.task_graph->>'agentType', 'generic') = 'crm'
            and coalesce(node->>'tool', '') <> ''
          group by node->>'tool'
          order by count(*) desc
          limit 8
        ) tools
      ),
      '[]'::jsonb
    )
  )
  into result
  from public.agent_workflows;

  return coalesce(result, '{}'::jsonb);
end;
$$;

grant execute on function public.platform_ai_ops_crm_agent_summary() to authenticated;
