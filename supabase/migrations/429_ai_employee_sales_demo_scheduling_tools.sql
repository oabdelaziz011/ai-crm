-- Seed additive sales-demo scheduling tools (Slice C).
-- Does not change clinic create_booking / search_availability schemas.
-- Idempotent upsert on key. Apply only after 428_scheduling_service_kind_demo.

insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'list_demo_types',
    'List Demo Types',
    'List sales_demo scheduling services for product demos. Never returns clinic/operational services.',
    'scheduling', '1.0.0', true,
    '["tools.execute","availability.search"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"demos":{"type":"array"}}}'::jsonb,
    10000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
  ),
  (
    'search_demo_availability',
    'Search Demo Availability',
    'Search availability for a sales_demo service only. Rejects clinic/operational service IDs.',
    'scheduling', '1.0.0', true,
    '["tools.execute","availability.search"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"serviceId":{"type":"string"},"resourceId":{"type":"string"},"branchId":{"type":"string"},"date":{"type":"string"},"daysAhead":{"type":"number"}},"required":["serviceId"],"additionalProperties":false}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"resources":{"type":"array"}}}'::jsonb,
    45000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'find_next_demo',
    'Find Next Demo',
    'Find the earliest available sales demo slot for a sales_demo service.',
    'scheduling', '1.0.0', true,
    '["tools.execute","availability.search"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"serviceId":{"type":"string"},"resourceId":{"type":"string"},"branchId":{"type":"string"},"daysAhead":{"type":"number"}},"required":["serviceId"],"additionalProperties":false}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"slot":{"type":["object","null"]}}}'::jsonb,
    45000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'create_demo_booking',
    'Create Demo Booking',
    'Create a confirmed sales product demo booking. resourceId is optional (auto-assign). Pass clientRequestId for idempotent retries. Do not use create_booking for demos.',
    'scheduling', '1.0.0', true,
    '["tools.execute","bookings.create"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"customerId":{"type":"string"},"serviceId":{"type":"string"},"resourceId":{"type":"string"},"date":{"type":"string"},"slotStart":{"type":"string"},"branchId":{"type":"string"},"notes":{"type":"string"},"clientRequestId":{"type":"string"}},"required":["customerId","serviceId","date","slotStart"],"additionalProperties":false}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"bookingId":{"type":"string"},"status":{"type":"string"},"errors":{"type":"array"}}}'::jsonb,
    45000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  category = excluded.category,
  version = excluded.version,
  is_enabled = excluded.is_enabled,
  required_permissions = excluded.required_permissions,
  supported_states = excluded.supported_states,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  timeout_ms = excluded.timeout_ms,
  retry_policy = excluded.retry_policy,
  updated_at = now();

-- Guard: clinic create_booking must still require resourceId (no auto-assign).
do $$
declare
  schema jsonb;
  required jsonb;
begin
  select input_schema into schema
  from public.tool_definitions
  where key = 'create_booking';
  if schema is null then
    raise notice 'create_booking not present — skip resourceId required guard';
    return;
  end if;
  required := coalesce(schema->'required', '[]'::jsonb);
  if not (required ? 'resourceId') then
    raise exception 'create_booking must keep resourceId in required (clinic contract)';
  end if;
end $$;
