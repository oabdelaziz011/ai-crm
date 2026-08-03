# Sprint 6.12 — Phase 0 Compatibility Report

## 1. Components Remaining Unchanged

| Component | Path | Reason |
|-----------|------|--------|
| BookingDomainService | `lib/scheduling-engine/src/booking-domain/` | Production scheduling engine — all validation, conflict, lifecycle |
| AvailabilityEngine | `lib/scheduling-engine/src/availability-engine/` | Slot/availability logic unchanged |
| SlotGenerationEngine | `lib/scheduling-engine/src/slot-generation-engine/` | Time slot generation unchanged |
| BookingRepository (engine) | `lib/scheduling-engine/src/booking-domain/booking-repository.ts` | Used internally by engine |
| BookingFactory | `artifacts/login-app/src/lib/scheduling/booking-domain/booking-factory.ts` | Existing UI/automation wiring preserved |
| Public booking pages | `artifacts/login-app/src/pages/portal/` | UI unchanged |
| Customer portal | `artifacts/login-app/src/lib/customer-portal/` | Portal services unchanged |
| Operations UI | `artifacts/login-app/src/components/scheduling/operations/` | Dashboard operations unchanged |
| Automation booking actions | `lib/automation-platform/src/engine/crm/` | Legacy automation path preserved |
| REST `/bookings` routes | `artifacts/api-server/src/routes/v1/resources.ts` | Existing API unchanged |
| AI tool names | `create_booking`, `search_availability`, etc. | Tool catalog keys unchanged |
| `scheduling_bookings` table | Migration 145+ | Canonical storage — extended only |

## 2. Components Becoming Wrappers

| Component | Wrapper Role |
|-----------|--------------|
| AppointmentCommandService | Delegates mutations to BookingDomainService via SchedulingEnginePort |
| AppointmentQueryService | Read model over scheduling_bookings + RPC metrics |
| AppointmentReadPort | Facade over AppointmentQueryService |
| login-app scheduling-tool-ports-adapter | Routes create_booking through AppointmentCommandService |

## 3. Adapters Introduced

| Adapter | Purpose |
|---------|---------|
| `createSchedulingEnginePort` | Wraps `@workspace/scheduling-engine` BookingDomainService |
| `createAppointmentReadPort` | Maps queries to read port interface |
| `createAppointmentBookingDomainAdapter` | Implements AI `BookingDomainServicePort` via AppointmentCommandService |
| `appointment-dashboard-read-adapter` | Dashboard metrics via AppointmentReadPort |
| `appointment-platform-factory` | Event bridge + platform wiring in login-app |
| Customer360 `fetchAppointmentsViaReadPort` | Replaces direct scheduling_bookings query when port wired |

## 4. Facades Introduced

| Facade | Exposes |
|--------|---------|
| `createAppointmentPlatformServices()` | commands, queries, reads |
| `AppointmentReadPort` | All external read access |
| `AppointmentCommandService` | Enterprise command surface (CreateAppointment, etc.) |

## 5. Public APIs Remaining Unchanged

- `BookingFactory.create()` / `getBookingDomainServices()`
- `@workspace/scheduling-engine` exports
- REST `GET/POST /bookings`
- AI tools: `create_booking`, `search_availability`, `find_next_available`, `recommend_appointment`
- Automation `BookingServicePort`
- All existing hooks: `use-bookings`, `use-booking-domain`

## 6. Services Becoming Internal

| Service | Visibility |
|---------|------------|
| `SupabaseAppointmentRepository` | Internal to `@workspace/appointment-platform` only |
| Engine BookingRepository | Remains internal to scheduling-engine |

## 7. Migrations Required

| Migration | Changes |
|-----------|---------|
| `219_appointment_platform_promotion_sprint6_12.sql` | Add `lead_id`, `conversation_id` to `scheduling_bookings`; metrics RPC; indexes |

No changes to existing booking permissions — reuses `bookings.view/create/edit/delete`.

## 8. Integrations Requiring No Changes

- Public booking flow
- Customer portal check-in
- Billing bridge (`BookingBillingBridge`)
- Communication event publisher
- Workflow create-booking actions (automation-platform)
- Scheduling settings UI
- Resource/service catalog management

## Regression Strategy

- Zero changes to BookingDomainService logic
- Appointment platform adds columns post-create via repository link (non-blocking)
- Existing booking creates without lead_id/conversation_id continue working
- Architecture test blocks external repository imports
