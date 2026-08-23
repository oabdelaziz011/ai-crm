-- Allow cancel_booking by bookingReference (BK-…) without requiring bookingId.
update public.tool_definitions
set
  input_schema = '{
    "type": "object",
    "properties": {
      "bookingId": { "type": "string", "description": "Booking UUID of the selected appointment" },
      "bookingReference": { "type": "string", "description": "Customer-facing booking number like BK-000025" },
      "reason": { "type": "string", "description": "Optional cancellation reason" },
      "phone": { "type": "string", "description": "Patient mobile used to authorize cancel when needed" },
      "conversationScopedCancel": { "type": "boolean", "description": "True when the booking reference was listed in this cancel conversation" }
    },
    "additionalProperties": false
  }'::jsonb,
  description = 'Cancel an existing booking by bookingId or BK- reference after the customer selects it.',
  updated_at = now()
where key = 'cancel_booking';
