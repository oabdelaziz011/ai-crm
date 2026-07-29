-- Sprint AI.3 Phase 2 — Production create_booking tool

insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'create_booking',
    'Create Booking',
    'Create a confirmed scheduling booking via BookingDomainService. Writes to scheduling_bookings only.',
    'scheduling', '1.0.0', true,
    '["tools.execute", "bookings.create"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"customerId":{"type":"string"},"serviceId":{"type":"string"},"resourceId":{"type":"string"},"date":{"type":"string"},"slotStart":{"type":"string"},"branchId":{"type":"string"},"notes":{"type":"string"}},"required":["customerId","serviceId","resourceId","date","slotStart"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"bookingId":{"type":"string"},"status":{"type":"string"},"startAt":{"type":"string"},"endAt":{"type":"string"},"errors":{"type":"array"}}}'::jsonb,
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

update public.tool_definitions
set is_enabled = false,
    description = coalesce(description, '') || ' [Deprecated — replaced by create_booking]',
    updated_at = now()
where key = 'booking';
