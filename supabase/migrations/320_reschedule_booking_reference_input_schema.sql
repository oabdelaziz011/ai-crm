-- Align reschedule_booking tool_definitions schema with scheduling-agent-tools
-- (bookingId OR bookingReference + date + slotStart + optional phone).

update public.tool_definitions
set
  input_schema = '{
    "type": "object",
    "required": ["date", "slotStart"],
    "properties": {
      "bookingId": { "type": "string", "description": "Booking UUID, or BK- confirmation number" },
      "bookingReference": { "type": "string", "description": "Customer-facing booking number like BK-000026" },
      "date": { "type": "string", "description": "YYYY-MM-DD local date for the new appointment" },
      "slotStart": { "type": "string", "description": "HH:mm local wall time for the new appointment" },
      "reason": { "type": "string", "description": "Optional reschedule reason" },
      "phone": { "type": "string", "description": "Patient mobile used to authorize reschedule when trusted customer is not linked" }
    },
    "additionalProperties": false
  }'::jsonb,
  description = 'Reschedule an existing booking by bookingId or BK- reference to a new date/time after ownership is verified.',
  updated_at = now()
where key = 'reschedule_booking';
