# Appointment Platform Architecture

Enterprise orchestration layer over the production Scheduling Engine.

## Read Path

```
Consumer → AppointmentReadPort → AppointmentQueryService (RBAC + cache) → AppointmentRepository → scheduling_bookings / RPC
```

## Write Path

```
Consumer → AppointmentCommandService → SchedulingEnginePort → BookingDomainService → scheduling_bookings
         → AppointmentRepository (identity links: lead_id, conversation_id)
         → Event / Audit ports
```

## Scheduling Engine Preservation

All slot validation, conflict resolution, lifecycle transitions, and calendar logic remain in `@workspace/scheduling-engine`. The Appointment Platform never reimplements these capabilities.

## Identity

Appointments link to:

- `customer_id` (required by scheduling engine)
- `lead_id` (optional — pre/post conversion)
- `conversation_id` (optional — omnichannel context)

## Backward Compatibility

- `BookingFactory` unchanged
- REST `/bookings` unchanged
- AI tool `create_booking` routes through `AppointmentCommandService` via adapter
- Existing booking events map to appointment workflow events + legacy webhook types

## Repository Visibility

Repositories are internal. External consumers use `AppointmentCommandService`, `AppointmentQueryService`, or `AppointmentReadPort`.
