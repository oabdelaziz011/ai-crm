-- Sprint S-Availability-2 — Configurable window + find_next_available tool

update public.tool_definitions
set
  input_schema = '{"type":"object","properties":{"serviceId":{"type":"string"},"resourceId":{"type":"string"},"branchId":{"type":"string"},"date":{"type":"string"},"daysAhead":{"type":"number","minimum":1,"maximum":90}},"required":["serviceId"]}'::jsonb,
  output_schema = '{"type":"object","properties":{"success":{"type":"boolean"},"availableDates":{"type":"array"},"resources":{"type":"array"},"searchedWindow":{"type":"number"},"nextSuggestion":{"type":["number","null"]},"message":{"type":"string"}}}'::jsonb,
  description = 'Search real bookable appointment availability for a scheduling service with a configurable daysAhead window (default 7, max 90).',
  updated_at = now()
where key = 'search_availability';

insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'find_next_available',
    'Find Next Available',
    'Find the first real bookable appointment slot for a service within a configurable search window.',
    'scheduling', '1.0.0', true,
    '["tools.execute", "availability.search"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"serviceId":{"type":"string"},"resourceId":{"type":"string"},"branchId":{"type":"string"},"daysAhead":{"type":"number","minimum":1,"maximum":90}},"required":["serviceId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"searchedWindow":{"type":"number"},"nextSuggestion":{"type":["number","null"]},"message":{"type":"string"},"slot":{"type":["object","null"]}}}'::jsonb,
    45000,
    '{"maxAttempts":2,"backoffMs":500}'::jsonb
  )
on conflict (key) do update set
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
