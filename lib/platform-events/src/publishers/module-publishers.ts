import type { PlatformEventType, PlatformEventMap, TypedPlatformEvent } from "../types/event-types.js";
import type { PublishContext, PublishResult, PlatformEventEnvelope } from "../types/envelope.js";
import { PLATFORM_EVENT_SCHEMA_VERSION } from "../types/envelope.js";
import { validatePayload } from "../contracts/validators.js";
import type { PlatformEventPublisherPort } from "./publisher-port.js";
import type { PlatformEventBus } from "../bus/platform-event-bus.js";

function buildEventId(entityId: string, eventType: string, occurredAt: string): string {
  return `${entityId}:${eventType}:${occurredAt}`;
}

export class ModuleEventPublisher implements PlatformEventPublisherPort {
  constructor(
    private readonly bus: PlatformEventBus,
    private readonly sourceModule: string,
  ) {}

  async publish<T extends PlatformEventType>(
    eventType: T,
    payload: PlatformEventMap[T],
    context: PublishContext,
  ): Promise<PublishResult> {
    validatePayload(eventType, payload);

    const occurredAt = context.occurredAt ?? new Date().toISOString();
    const entityId =
      context.entityId ??
      ("customerId" in payload ? String((payload as { customerId?: string }).customerId) : undefined) ??
      ("bookingId" in payload ? String((payload as { bookingId?: string }).bookingId) : undefined) ??
      ("leadId" in payload ? String((payload as { leadId?: string }).leadId) : undefined) ??
      crypto.randomUUID();

    const envelope: TypedPlatformEvent<T> = {
      eventId: buildEventId(entityId, eventType, occurredAt),
      eventType,
      schemaVersion: PLATFORM_EVENT_SCHEMA_VERSION,
      occurredAt,
      publishedAt: new Date().toISOString(),
      correlationId: context.correlationId ?? crypto.randomUUID(),
      causationId: context.causationId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      actorType: context.actorType ?? "system",
      sourceModule: context.sourceModule || this.sourceModule,
      entityType: context.entityType,
      entityId: context.entityId ?? entityId,
      payload,
    };

    return this.bus.publish(envelope);
  }
}

/** Booking module publisher — publishes events only, never calls other modules. */
export class BookingEventPublisher {
  constructor(private readonly publisher: ModuleEventPublisher) {}

  async publishBookingCompleted(
    payload: PlatformEventMap["BookingCompleted"],
    context: Omit<PublishContext, "sourceModule">,
  ): Promise<PublishResult> {
    return this.publisher.publish("BookingCompleted", payload, {
      ...context,
      sourceModule: "booking",
      entityType: "booking",
      entityId: payload.bookingId,
    });
  }

  async publishBookingCreated(
    payload: PlatformEventMap["BookingCreated"],
    context: Omit<PublishContext, "sourceModule">,
  ): Promise<PublishResult> {
    return this.publisher.publish("BookingCreated", payload, {
      ...context,
      sourceModule: "booking",
      entityType: "booking",
      entityId: payload.bookingId,
    });
  }
}

export class CustomerEventPublisher {
  constructor(private readonly publisher: ModuleEventPublisher) {}

  async publishCustomerCreated(
    payload: PlatformEventMap["CustomerCreated"],
    context: Omit<PublishContext, "sourceModule">,
  ): Promise<PublishResult> {
    return this.publisher.publish("CustomerCreated", payload, {
      ...context,
      sourceModule: "crm",
      entityType: "customer",
      entityId: payload.customerId,
    });
  }
}

export class LeadEventPublisher {
  constructor(private readonly publisher: ModuleEventPublisher) {}

  async publishLeadConverted(
    payload: PlatformEventMap["LeadConverted"],
    context: Omit<PublishContext, "sourceModule">,
  ): Promise<PublishResult> {
    return this.publisher.publish("LeadConverted", payload, {
      ...context,
      sourceModule: "leads",
      entityType: "lead",
      entityId: payload.leadId,
    });
  }
}

export function createModulePublisher(bus: PlatformEventBus, sourceModule: string): ModuleEventPublisher {
  return new ModuleEventPublisher(bus, sourceModule);
}
