# Platform Events — Enterprise Integration Foundation (Phase 4.1)

## Principle

**Modules never call each other directly.** Every cross-module interaction flows through typed domain events on the platform event bus.

```
Booking Service → publish(BookingCompleted) → Event Bus
                                              ├── Invoice (subscriber)
                                              ├── Payment (subscriber)
                                              ├── Dashboard (subscriber)
                                              ├── Timeline (automatic)
                                              ├── Audit (automatic)
                                              └── Workspace (subscriber, read-only)
```

## Package

`@workspace/platform-events` — zero UI, zero database, mock storage only.

## Components

| Component | Path | Role |
|-----------|------|------|
| Typed contracts | `src/types/` | 21 versioned event types + payloads |
| Validators | `src/contracts/validators.ts` | Strict runtime payload validation |
| Event registry | `src/registry/event-registry.ts` | Publisher, subscribers, schema docs |
| Event bus | `src/bus/platform-event-bus.ts` | Async dispatch, audit, timeline |
| Publishers | `src/publishers/` | Module publishers (publish only) |
| Subscribers | `src/subscribers/` | Isolated mock subscribers |
| Retry engine | `src/retry/retry-engine.ts` | Exponential backoff (mock) |
| Dead letter queue | `src/dlq/dead-letter-queue.ts` | Failed delivery store (mock) |
| Telemetry | `src/telemetry/event-telemetry.ts` | Published/failed/latency metrics |
| Audit trail | `src/audit/audit-trail-store.ts` | Auto audit per event |
| Timeline | `src/timeline/timeline-store.ts` | Auto timeline per event |

## Event Types (v1)

CustomerCreated, CustomerUpdated, LeadCreated, LeadConverted, BookingCreated, BookingConfirmed, BookingCancelled, BookingCompleted, PaymentCollected, InvoiceGenerated, InvoicePaid, TaskAssigned, TaskCompleted, EmailSent, WhatsAppSent, NotificationCreated, WorkflowExecuted, AISummaryGenerated, KnowledgeUpdated, FileUploaded, PermissionChanged

## Publisher Pattern

```typescript
const bus = createConfiguredPlatformEventBus(createDefaultSubscribers());
const booking = new BookingEventPublisher(createModulePublisher(bus, "booking"));

await booking.publishBookingCompleted(
  { bookingId, customerId, completedAt },
  { tenantId, actorId, actorType: "user" },
);
// Booking module does nothing else — no invoice calls
```

## Future Backend Adapters

The bus interface is stable. Replace in-memory stores with:

- Kafka / RabbitMQ / Azure Service Bus / Google Pub/Sub
- Background workers
- Realtime push

Business modules and event contracts remain unchanged.

## Relationship to Existing Integration Hub

`artifacts/login-app/src/lib/integration/events/event-bus-service.ts` is the Supabase webhook bus. `@workspace/platform-events` is the **typed domain foundation** that future module bridges will publish through before fan-out to webhooks, automation, and comms.

Do not duplicate — wire module factories to `PlatformEventBus` in a future phase.
