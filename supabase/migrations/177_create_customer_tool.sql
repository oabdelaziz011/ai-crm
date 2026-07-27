-- Sprint AI-2: activate create_customer tool for LLM function calling

insert into public.tool_definitions (
  key,
  display_name,
  description,
  category,
  version,
  is_enabled,
  required_permissions,
  supported_states,
  input_schema,
  output_schema,
  timeout_ms,
  retry_policy
)
values (
  'create_customer',
  'Create Customer',
  'Create a new CRM customer with name and phone. Create-only — no updates or deletes.',
  'crm',
  '1.0.0',
  true,
  '["tools.execute", "customers.create"]'::jsonb,
  '["idle", "greeting", "collecting_information", "waiting_user", "waiting_api", "transferred_to_human"]'::jsonb,
  '{"type":"object","properties":{"name":{"type":"string","minLength":1},"phone":{"type":"string","minLength":7},"email":{"type":"string"}},"required":["name","phone"]}'::jsonb,
  '{"type":"object","properties":{"success":{"type":"boolean"},"customerId":{"type":"string"},"message":{"type":"string"}}}'::jsonb,
  20000,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb
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

insert into public.permissions (code, category, module, action, description)
values (
  'customers.create',
  'customers',
  'customers',
  'create',
  'Create new customer records via CRM tools and UI.'
)
on conflict (code) do update set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();
