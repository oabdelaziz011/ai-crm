-- Sprint AI-Scheduling-1 — Intelligent appointment recommendation tool

insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'recommend_appointment',
    'Recommend Appointment',
    'Recommend ranked appointment options with alternative resource and branch suggestions.',
    'scheduling', '1.0.0', true,
    '["tools.execute", "availability.search"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"serviceId":{"type":"string"},"preferredResourceId":{"type":"string"},"preferredBranchId":{"type":"string"},"preferredDate":{"type":"string"},"preferredTime":{"type":"string"},"daysAhead":{"type":"number","minimum":1,"maximum":90}},"required":["serviceId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"searchedWindow":{"type":"number"},"recommendations":{"type":"array"},"alternativeResource":{"type":["object","null"]},"alternativeBranch":{"type":["object","null"]},"nearestDate":{"type":["object","null"]}}}'::jsonb,
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
