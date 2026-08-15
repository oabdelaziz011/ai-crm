-- Seed production tool definitions that exist in TOOL_REGISTRY but were missing
-- from tool_definitions (sales/leads, handoff, extra scheduling). Wizard lists
-- enabled rows from this table.

insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'search_bookings',
    'Search Bookings',
    'Search recent bookings by customer and recency.',
    'scheduling', '1.0.0', true,
    '["tools.execute", "bookings.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"customerId":{"type":"string"},"daysBack":{"type":"number"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'reschedule_booking',
    'Reschedule Booking',
    'Reschedule an existing booking.',
    'scheduling', '1.0.0', true,
    '["tools.execute", "bookings.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"bookingId":{"type":"string"},"startAt":{"type":"string"},"endAt":{"type":"string"}},"required":["bookingId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    45000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'cancel_booking',
    'Cancel Booking',
    'Cancel an existing booking.',
    'scheduling', '1.0.0', true,
    '["tools.execute", "bookings.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"bookingId":{"type":"string"},"reason":{"type":"string"}},"required":["bookingId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'check_in',
    'Check In',
    'Check in a booking.',
    'scheduling', '1.0.0', true,
    '["tools.execute", "bookings.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"bookingId":{"type":"string"}},"required":["bookingId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'check_out',
    'Check Out',
    'Check out a booking.',
    'scheduling', '1.0.0', true,
    '["tools.execute", "bookings.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"bookingId":{"type":"string"}},"required":["bookingId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'escalate_to_human',
    'Escalate To Human',
    'Escalate the conversation to a human agent.',
    'handoff', '1.0.0', true,
    '["tools.execute", "handoff.escalate"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"reason":{"type":"string"},"priority":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'queue_handoff',
    'Queue Handoff',
    'Queue the conversation for human pickup.',
    'handoff', '1.0.0', true,
    '["tools.execute", "handoff.queue"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"queueKey":{"type":"string"},"reason":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'return_to_ai',
    'Return To AI',
    'Return a human-handled conversation to the AI employee.',
    'handoff', '1.0.0', true,
    '["tools.execute", "handoff.return_to_ai"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"reason":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'create_lead',
    'Create Lead',
    'Create a sales lead for prospective contacts.',
    'sales', '1.0.0', true,
    '["tools.execute", "leads.create"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"name":{"type":"string"},"phone":{"type":"string"},"email":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'update_lead',
    'Update Lead',
    'Update lead contact fields or score.',
    'sales', '1.0.0', true,
    '["tools.execute", "leads.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"leadId":{"type":"string"},"field":{"type":"string"},"value":{"type":"string"}},"required":["leadId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'qualify_lead',
    'Qualify Lead',
    'Qualify a lead for the sales pipeline.',
    'sales', '1.0.0', true,
    '["tools.execute", "leads.qualify"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"leadId":{"type":"string"},"status":{"type":"string"}},"required":["leadId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'convert_lead',
    'Convert Lead',
    'Convert a lead into a CRM customer.',
    'sales', '1.0.0', true,
    '["tools.execute", "leads.convert"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"leadId":{"type":"string"}},"required":["leadId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    45000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'assign_lead',
    'Assign Lead',
    'Assign a lead to a sales agent.',
    'sales', '1.0.0', true,
    '["tools.execute", "leads.assign"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"leadId":{"type":"string"},"assigneeId":{"type":"string"}},"required":["leadId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'search_lead',
    'Search Leads',
    'Search leads by contact details or lifecycle status.',
    'sales', '1.0.0', true,
    '["tools.execute", "leads.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"query":{"type":"string"},"status":{"type":"string"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'merge_lead',
    'Merge Leads',
    'Merge duplicate leads into a primary lead.',
    'sales', '1.0.0', true,
    '["tools.execute", "leads.merge"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"primaryLeadId":{"type":"string"},"duplicateLeadId":{"type":"string"}},"required":["primaryLeadId","duplicateLeadId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    45000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'score_lead',
    'Score Lead',
    'Update lead score.',
    'sales', '1.0.0', true,
    '["tools.execute", "leads.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"leadId":{"type":"string"},"score":{"type":"number"}},"required":["leadId","score"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'suggest_next_action',
    'Suggest Next Action',
    'Suggest the next best sales action for a lead.',
    'sales', '1.0.0', true,
    '["tools.execute", "leads.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"leadId":{"type":"string"}},"required":["leadId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  )
on conflict (key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  category = excluded.category,
  version = excluded.version,
  is_enabled = true,
  required_permissions = excluded.required_permissions,
  supported_states = excluded.supported_states,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  timeout_ms = excluded.timeout_ms,
  retry_policy = excluded.retry_policy,
  updated_at = now();
