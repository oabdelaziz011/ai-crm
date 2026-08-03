import type { PlatformEvent, PlatformEventType } from "../types/event-types.js";
import type { PlatformEventEnvelope, PublishResult } from "../types/envelope.js";
import { validatePlatformEventEnvelope } from "../contracts/validators.js";
import type {
  AuditTrailStorePort,
  CorrelationStorePort,
  DeadLetterQueuePort,
  EventTelemetryPort,
  IdempotencyStorePort,
  TimelineStorePort,
} from "../stores/store-ports.js";
import {
  sharedMemoryAuditTrailStore,
  sharedMemoryCorrelationStore,
  sharedMemoryDeadLetterQueue,
  sharedMemoryEventTelemetry,
  sharedMemoryIdempotencyStore,
  sharedMemoryTimelineStore,
} from "../stores/memory-stores.js";
import type { RetryEngine } from "../retry/retry-engine.js";
import { sharedRetryEngine } from "../retry/retry-engine.js";
import type { PlatformEventSubscriber, EventBusPublishRecord, SubscriberDispatchResult } from "../subscribers/subscriber-types.js";
import { subscriberMatchesEvent } from "../subscribers/subscriber-types.js";

export type PlatformEventBusOptions = {
  auditStore?: AuditTrailStorePort;
  timelineStore?: TimelineStorePort;
  correlationStore?: CorrelationStorePort;
  idempotencyStore?: IdempotencyStorePort;
  retryEngine?: RetryEngine;
  deadLetterQueue?: DeadLetterQueuePort;
  telemetry?: EventTelemetryPort;
  /** When true, subscriber dispatch is awaited sequentially. Default: false (parallel). */
  awaitSubscribers?: boolean;
};

/**
 * Enterprise Event Bus — modules publish typed events; subscribers react in isolation.
 * No module imports another module. Future queue backends plug in behind store ports.
 */
export class PlatformEventBus {
  private readonly subscribers = new Map<string, PlatformEventSubscriber>();
  private readonly publishLog: EventBusPublishRecord[] = [];
  private readonly auditStore: AuditTrailStorePort;
  private readonly timelineStore: TimelineStorePort;
  private readonly correlationStore: CorrelationStorePort;
  private readonly idempotencyStore: IdempotencyStorePort;
  private readonly retryEngine: RetryEngine;
  private readonly deadLetterQueue: DeadLetterQueuePort;
  private readonly telemetry: EventTelemetryPort;
  private readonly awaitSubscribers: boolean;

  constructor(options: PlatformEventBusOptions = {}) {
    this.auditStore = options.auditStore ?? sharedMemoryAuditTrailStore;
    this.timelineStore = options.timelineStore ?? sharedMemoryTimelineStore;
    this.correlationStore = options.correlationStore ?? sharedMemoryCorrelationStore;
    this.idempotencyStore = options.idempotencyStore ?? sharedMemoryIdempotencyStore;
    this.retryEngine = options.retryEngine ?? sharedRetryEngine;
    this.deadLetterQueue = options.deadLetterQueue ?? sharedMemoryDeadLetterQueue;
    this.telemetry = options.telemetry ?? sharedMemoryEventTelemetry;
    this.awaitSubscribers = options.awaitSubscribers ?? false;
  }

  registerSubscriber(subscriber: PlatformEventSubscriber): void {
    if (this.subscribers.has(subscriber.subscriberId)) {
      throw new Error(`Subscriber already registered: ${subscriber.subscriberId}`);
    }
    this.subscribers.set(subscriber.subscriberId, subscriber);
  }

  unregisterSubscriber(subscriberId: string): void {
    this.subscribers.delete(subscriberId);
  }

  listSubscribers(): PlatformEventSubscriber[] {
    return [...this.subscribers.values()];
  }

  getIdempotencyStore(): IdempotencyStorePort {
    return this.idempotencyStore;
  }

  async publish(envelope: PlatformEventEnvelope<string, unknown>): Promise<PublishResult> {
    validatePlatformEventEnvelope(envelope);

    this.telemetry.recordPublished();
    await this.auditStore.recordFromEvent(envelope);
    await this.timelineStore.recordFromEvent(envelope);
    await this.correlationStore.recordChain({
      tenantId: envelope.tenantId,
      correlationId: envelope.correlationId,
      rootEventId: envelope.eventId,
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      parentEventId: envelope.causationId,
    });

    const typedEnvelope = envelope as PlatformEvent;
    const dispatchResults: SubscriberDispatchResult[] = [];
    const matched = this.listSubscribers().filter((s) =>
      subscriberMatchesEvent(s, typedEnvelope.eventType as PlatformEventType),
    );

    const dispatchOne = async (subscriber: PlatformEventSubscriber) => {
      const start = Date.now();
      const idempotencyKey = `${subscriber.subscriberId}:${envelope.eventId}`;
      if (await this.idempotencyStore.exists(envelope.tenantId, "subscriber", idempotencyKey)) {
        dispatchResults.push({
          subscriberId: subscriber.subscriberId,
          success: true,
          latencyMs: 0,
        });
        return;
      }

      try {
        await this.retryEngine.execute(() => subscriber.handle(typedEnvelope));
        const latencyMs = Date.now() - start;
        await this.idempotencyStore.store(envelope.tenantId, "subscriber", idempotencyKey);
        await this.telemetry.recordSubscriberExecution({
          subscriberId: subscriber.subscriberId,
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          correlationId: envelope.correlationId,
          tenantId: envelope.tenantId,
          success: true,
          latencyMs,
        });
        dispatchResults.push({ subscriberId: subscriber.subscriberId, success: true, latencyMs });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const latencyMs = Date.now() - start;
        if ("recordSubscriberFailure" in this.telemetry && typeof this.telemetry.recordSubscriberFailure === "function") {
          (this.telemetry as { recordSubscriberFailure(id: string): void }).recordSubscriberFailure(subscriber.subscriberId);
        }
        this.telemetry.recordFailure();
        this.retryEngine.enqueueFailed({
          subscriberId: subscriber.subscriberId,
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          attempt: 1,
          error: message,
        });
        this.telemetry.recordRetry();
        await this.deadLetterQueue.push({
          subscriberId: subscriber.subscriberId,
          envelope,
          error: message,
          attempts: this.retryEngine.getQueue().list().length,
        });
        this.telemetry.recordDeadLetter();
        await this.telemetry.recordSubscriberExecution({
          subscriberId: subscriber.subscriberId,
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          correlationId: envelope.correlationId,
          tenantId: envelope.tenantId,
          success: false,
          latencyMs,
          error: message,
        });
        dispatchResults.push({
          subscriberId: subscriber.subscriberId,
          success: false,
          latencyMs,
          error: message,
        });
      }
    };

    if (this.awaitSubscribers) {
      for (const subscriber of matched) {
        await dispatchOne(subscriber);
      }
    } else {
      await Promise.all(matched.map(dispatchOne));
    }

    this.publishLog.push({
      envelope,
      dispatchResults,
      publishedAt: new Date().toISOString(),
    });

    return {
      eventId: envelope.eventId,
      correlationId: envelope.correlationId,
      subscriberCount: matched.length,
      dispatchedAt: new Date().toISOString(),
    };
  }

  getPublishLog(): EventBusPublishRecord[] {
    return [...this.publishLog];
  }

  getAuditStore(): AuditTrailStorePort {
    return this.auditStore;
  }

  getTimelineStore(): TimelineStorePort {
    return this.timelineStore;
  }

  getTelemetry(): EventTelemetryPort {
    return this.telemetry;
  }

  getDeadLetterQueue(): DeadLetterQueuePort {
    return this.deadLetterQueue;
  }

  getCorrelationStore(): CorrelationStorePort {
    return this.correlationStore;
  }

  async replayDeadLetter(entryId: string): Promise<boolean> {
    const entries = await this.deadLetterQueue.list();
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return false;

    const subscriber = this.subscribers.get(entry.subscriberId);
    if (!subscriber) return false;

    await subscriber.handle(entry.envelope as PlatformEvent);
    await this.deadLetterQueue.markReplayed(entryId);
    return true;
  }
}

let sharedBus: PlatformEventBus | null = null;

export function getPlatformEventBus(): PlatformEventBus {
  if (!sharedBus) {
    sharedBus = new PlatformEventBus({ awaitSubscribers: true });
  }
  return sharedBus;
}

export function resetPlatformEventBus(): void {
  sharedBus = null;
  if ("clear" in sharedMemoryAuditTrailStore) sharedMemoryAuditTrailStore.clear();
  if ("clear" in sharedMemoryTimelineStore) sharedMemoryTimelineStore.clear();
  if ("clear" in sharedMemoryDeadLetterQueue) sharedMemoryDeadLetterQueue.clear();
  if ("clear" in sharedMemoryCorrelationStore) sharedMemoryCorrelationStore.clear();
  if ("clear" in sharedMemoryIdempotencyStore) sharedMemoryIdempotencyStore.clear();
  if ("reset" in sharedMemoryEventTelemetry) sharedMemoryEventTelemetry.reset();
  sharedRetryEngine.getQueue().clear();
}

export function createConfiguredPlatformEventBus(
  subscribers: PlatformEventSubscriber[],
  options?: PlatformEventBusOptions,
): PlatformEventBus {
  const bus = new PlatformEventBus(options);
  for (const sub of subscribers) {
    bus.registerSubscriber(sub);
  }
  return bus;
}
