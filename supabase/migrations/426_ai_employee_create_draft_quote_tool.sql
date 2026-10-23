-- Seed create_draft_quote for AI Employees (Sales Brain Phase 2).
-- Draft-only: ToolRouter required_permissions are tools.execute + quotes.create only.
-- Intentionally omits send / approve / delete quote permissions from required_permissions.
-- Idempotent upsert on key (same pattern as 254 / 414). No down migration pattern in-repo for tool seeds.

insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'create_draft_quote',
    'Create Draft Quote',
    'Create an internal draft quote from verified product interest and the open opportunity. Draft only: never sends, approves, orders, or takes payment.',
    'sales', '1.0.0', true,
    '["tools.execute","quotes.create"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"title":{"type":"string"},"quantity":{"type":"number"},"productId":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"draftOnly":{"type":"boolean"},"status":{"type":"string"},"quoteId":{"type":"string"},"quoteNumber":{"type":"string"},"alreadyExists":{"type":"boolean"},"sent":{"type":"boolean"},"approved":{"type":"boolean"}}}'::jsonb,
    20000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
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
