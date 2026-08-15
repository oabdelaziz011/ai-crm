-- Seed transfer_to_workflow for AI Employee → automation handoff (Phase 1).

insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'transfer_to_workflow',
    'Transfer To Workflow',
    'Hand the WhatsApp/Messenger thread to a configured automation workflow (e.g. booking). Use when the customer asks for a structured flow the employee is allowed to transfer into.',
    'automation', '1.0.0', true,
    '["tools.execute"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api"]'::jsonb,
    '{"type":"object","properties":{"reason":{"type":"string"},"flowId":{"type":"string"}},"required":["reason"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"transferred":{"type":"boolean"},"customerFacingMessage":{"type":"string"}}}'::jsonb,
    60000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  category = excluded.category,
  is_enabled = excluded.is_enabled,
  required_permissions = excluded.required_permissions,
  supported_states = excluded.supported_states,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  timeout_ms = excluded.timeout_ms,
  retry_policy = excluded.retry_policy,
  updated_at = now();
