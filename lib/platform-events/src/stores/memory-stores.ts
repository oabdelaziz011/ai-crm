import type {
  AuditTrailEntry,
  AuditTrailStorePort,
  CorrelationEntry,
  CorrelationStorePort,
  DeadLetterEntry,
  DeadLetterQueuePort,
  EventTelemetryPort,
  IdempotencyStorePort,
  TimelineActivityEntry,
  TimelineStorePort,
} from "./store-ports.js";
import type { PlatformEventEnvelope } from "../types/envelope.js";

export function createMemoryAuditTrailStore(): AuditTrailStorePort & { clear(): void } {
  const entries: AuditTrailEntry[] = [];
  return {
    async recordFromEvent(envelope) {
      const entry: AuditTrailEntry = Object.freeze({
        id: `audit_${envelope.eventId}`,
        timestamp: envelope.occurredAt,
        actorId: envelope.actorId,
        actorType: envelope.actorType,
        module: envelope.sourceModule,
        correlationId: envelope.correlationId,
        tenantId: envelope.tenantId,
        workspaceId: envelope.workspaceId,
        entityType: envelope.entityType,
        entityId: envelope.entityId,
        eventType: envelope.eventType,
        eventId: envelope.eventId,
        summary: `${envelope.eventType} published by ${envelope.sourceModule}`,
      });
      entries.push(entry);
      return entry;
    },
    async list(tenantId) {
      if (!tenantId) return Object.freeze([...entries]);
      return Object.freeze(entries.filter((e) => e.tenantId === tenantId));
    },
    async listByCorrelation(correlationId) {
      return Object.freeze(entries.filter((e) => e.correlationId === correlationId));
    },
    clear() {
      entries.length = 0;
    },
  };
}

export function createMemoryTimelineStore(): TimelineStorePort & { clear(): void } {
  const entries: TimelineActivityEntry[] = [];
  return {
    async recordFromEvent(envelope) {
      const entityLabel =
        envelope.entityType && envelope.entityId
          ? `${envelope.entityType}:${envelope.entityId}`
          : "platform";
      const entry: TimelineActivityEntry = Object.freeze({
        id: `timeline_${envelope.eventId}`,
        occurredAt: envelope.occurredAt,
        eventType: envelope.eventType,
        eventId: envelope.eventId,
        correlationId: envelope.correlationId,
        tenantId: envelope.tenantId,
        workspaceId: envelope.workspaceId,
        entityType: envelope.entityType,
        entityId: envelope.entityId,
        actorId: envelope.actorId,
        title: envelope.eventType,
        description: `${envelope.sourceModule} event for ${entityLabel}`,
        sourceModule: envelope.sourceModule,
      });
      entries.push(entry);
      return entry;
    },
    async listForEntity(entityType, entityId) {
      return Object.freeze(
        entries
          .filter((e) => e.entityType === entityType && e.entityId === entityId)
          .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
      );
    },
    async listForTenant(tenantId) {
      return Object.freeze(entries.filter((e) => e.tenantId === tenantId));
    },
    clear() {
      entries.length = 0;
    },
  };
}

export function createMemoryDeadLetterQueue(): DeadLetterQueuePort & { clear(): void } {
  const entries: DeadLetterEntry[] = [];
  return {
    async push(input) {
      const entry: DeadLetterEntry = Object.freeze({
        ...input,
        id: `dlq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        deadLetteredAt: new Date().toISOString(),
      });
      entries.push(entry);
      return entry;
    },
    async list() {
      return Object.freeze([...entries]);
    },
    async listForSubscriber(subscriberId) {
      return Object.freeze(entries.filter((e) => e.subscriberId === subscriberId));
    },
    async markReplayed(id) {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx >= 0) entries.splice(idx, 1);
    },
    clear() {
      entries.length = 0;
    },
  };
}

export function createMemoryCorrelationStore(): CorrelationStorePort & { clear(): void } {
  const entries: CorrelationEntry[] = [];
  return {
    async recordChain(input) {
      const entry: CorrelationEntry = Object.freeze({
        id: `corr_${input.eventId}`,
        tenantId: input.tenantId,
        correlationId: input.correlationId,
        rootEventId: input.rootEventId,
        eventId: input.eventId,
        eventType: input.eventType,
        parentEventId: input.parentEventId,
        createdAt: new Date().toISOString(),
      });
      entries.push(entry);
      return entry;
    },
    async listByCorrelation(correlationId) {
      return Object.freeze(entries.filter((e) => e.correlationId === correlationId));
    },
    clear() {
      entries.length = 0;
    },
  };
}

export function createMemoryEventTelemetry(): EventTelemetryPort & { reset(): void } {
  let published = 0;
  let failures = 0;
  let retries = 0;
  let deadLetters = 0;
  const subscribers = new Map<string, { success: number; failure: number; totalLatencyMs: number }>();

  return {
    recordPublished() {
      published += 1;
    },
    recordFailure() {
      failures += 1;
    },
    recordRetry() {
      retries += 1;
    },
    recordDeadLetter() {
      deadLetters += 1;
    },
    recordSubscriberFailure() {},
    async recordSubscriberExecution(record) {
      const current = subscribers.get(record.subscriberId) ?? { success: 0, failure: 0, totalLatencyMs: 0 };
      if (record.success) {
        current.success += 1;
        current.totalLatencyMs += record.latencyMs;
      } else {
        current.failure += 1;
      }
      subscribers.set(record.subscriberId, current);
    },
    snapshot() {
      const subSnap: Record<string, { success: number; failure: number; avgLatencyMs: number }> = {};
      for (const [id, m] of subscribers) {
        subSnap[id] = Object.freeze({
          success: m.success,
          failure: m.failure,
          avgLatencyMs: m.success > 0 ? Math.round(m.totalLatencyMs / m.success) : 0,
        });
      }
      return Object.freeze({ published, failures, retries, deadLetters, subscribers: Object.freeze(subSnap) });
    },
    reset() {
      published = 0;
      failures = 0;
      retries = 0;
      deadLetters = 0;
      subscribers.clear();
    },
  };
}

export function createMemoryIdempotencyStore(): IdempotencyStorePort & { clear(): void } {
  const store = new Map<string, string>();
  const storeKey = (tenantId: string, scope: string, idempotencyKey: string) =>
    `${tenantId}:${scope}:${idempotencyKey}`;

  return {
    async exists(tenantId, scope, idempotencyKey) {
      return store.has(storeKey(tenantId, scope, idempotencyKey));
    },
    async store(tenantId, scope, idempotencyKey, resultHash) {
      store.set(storeKey(tenantId, scope, idempotencyKey), resultHash ?? "1");
    },
    clear() {
      store.clear();
    },
  };
}

export const sharedMemoryAuditTrailStore = createMemoryAuditTrailStore();
export const sharedMemoryTimelineStore = createMemoryTimelineStore();
export const sharedMemoryDeadLetterQueue = createMemoryDeadLetterQueue();
export const sharedMemoryCorrelationStore = createMemoryCorrelationStore();
export const sharedMemoryEventTelemetry = createMemoryEventTelemetry();
export const sharedMemoryIdempotencyStore = createMemoryIdempotencyStore();
