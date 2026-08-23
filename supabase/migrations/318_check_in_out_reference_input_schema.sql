-- Allow check_in / check_out by bookingReference (BK-…) + phone without requiring bookingId.
-- Matches scheduling-agent-tools + executeCheckInBooking / executeCheckOutBooking.

update public.tool_definitions
set
  input_schema = '{
    "type": "object",
    "properties": {
      "bookingId": { "type": "string", "description": "Booking UUID" },
      "bookingReference": { "type": "string", "description": "Booking confirmation like BK-000035" },
      "phone": { "type": "string", "description": "Patient mobile used to prove ownership when needed" },
      "roomId": { "type": "string", "description": "Optional room UUID" }
    },
    "additionalProperties": false
  }'::jsonb,
  description = 'Check in a booking by bookingId or BK- reference (with phone when trusted customer is not linked).',
  updated_at = now()
where key = 'check_in';

update public.tool_definitions
set
  input_schema = '{
    "type": "object",
    "properties": {
      "bookingId": { "type": "string", "description": "Booking UUID" },
      "bookingReference": { "type": "string", "description": "Booking confirmation like BK-000035" },
      "phone": { "type": "string", "description": "Patient mobile used to prove ownership when needed" }
    },
    "additionalProperties": false
  }'::jsonb,
  description = 'Check out a booking by bookingId or BK- reference (with phone when trusted customer is not linked).',
  timeout_ms = 90000,
  retry_policy = '{"maxAttempts":1,"backoffMs":0}'::jsonb,
  updated_at = now()
where key = 'check_out';

update public.tool_definitions
set
  timeout_ms = 90000,
  retry_policy = '{"maxAttempts":1,"backoffMs":0}'::jsonb,
  updated_at = now()
where key = 'check_in';
