-- Seed read-only product lookup tools for AI Employees (Product Tools Phase 1).
-- Text only: no image URLs, cost, margin, stock or internal metadata are returned.

insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'search_products',
    'Search Products',
    'Search the company''s active product catalog by name, SKU, brand, description, tag, or category name. Read-only; returns at most 5 products without internal cost data.',
    'products', '1.0.0', true,
    '["tools.execute","products.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"query":{"type":"string"},"categoryId":{"type":"string"},"limit":{"type":"number"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"found":{"type":"boolean"},"resultCount":{"type":"number"},"truncated":{"type":"boolean"},"products":{"type":"array"}}}'::jsonb,
    15000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
  ),
  (
    'get_product_details',
    'Get Product Details',
    'Return customer-facing details for up to 3 active company products by id. Read-only; no image URLs, cost, margin, or stock.',
    'products', '1.0.0', true,
    '["tools.execute","products.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"productIds":{"type":"array"}},"required":["productIds"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"found":{"type":"boolean"},"products":{"type":"array"},"notFoundIds":{"type":"array"}}}'::jsonb,
    15000, '{"maxAttempts":1,"backoffMs":500}'::jsonb
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
