import type { PlatformEventEnvelope } from "../types/envelope.js";

export type AuditTrailEntry = Readonly<{
  id: string;
  timestamp: string;
  actorId?: string;
  actorType: string;
  module: string;
  correlationId: string;
  tenantId: string;
  workspaceId?: string;
  entityType?: string;
  entityId?: string;
  eventType: string;
  eventId: string;
  summary: string;
}>;

export type TimelineActivityEntry = Readonly<{
  id: string;
  occurredAt: string;
  eventType: string;
  eventId: string;
  correlationId: string;
  tenantId: string;
  workspaceId?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  title: string;
  description: string;
  sourceModule: string;
}>;

export type DeadLetterEntry = Readonly<{
  id: string;
  subscriberId: string;
  envelope: PlatformEventEnvelope<string, unknown>;
  error: string;
  attempts: number;
  deadLetteredAt: string;
}>;

export type CorrelationEntry = Readonly<{
  id: string;
  tenantId: string;
  correlationId: string;
  rootEventId: string;
  eventId: string;
  eventType: string;
  parentEventId?: string;
  createdAt: string;
}>;

export type SubscriberTelemetryRecord = Readonly<{
  subscriberId: string;
  eventId: string;
  eventType: string;
  correlationId: string;
  tenantId: string;
  success: boolean;
  latencyMs: number;
  error?: string;
}>;

export type AuditTrailStorePort = {
  recordFromEvent(envelope: PlatformEventEnvelope<string, unknown>): Promise<AuditTrailEntry>;
  list(tenantId?: string): Promise<readonly AuditTrailEntry[]>;
  listByCorrelation(correlationId: string): Promise<readonly AuditTrailEntry[]>;
};

export type TimelineStorePort = {
  recordFromEvent(envelope: PlatformEventEnvelope<string, unknown>): Promise<TimelineActivityEntry>;
  listForEntity(entityType: string, entityId: string): Promise<readonly TimelineActivityEntry[]>;
  listForTenant(tenantId: string): Promise<readonly TimelineActivityEntry[]>;
};

export type DeadLetterQueuePort = {
  push(input: Omit<DeadLetterEntry, "id" | "deadLetteredAt">): Promise<DeadLetterEntry>;
  list(): Promise<readonly DeadLetterEntry[]>;
  listForSubscriber(subscriberId: string): Promise<readonly DeadLetterEntry[]>;
  markReplayed(id: string): Promise<void>;
};

export type CorrelationStorePort = {
  recordChain(input: {
    tenantId: string;
    correlationId: string;
    rootEventId: string;
    eventId: string;
    eventType: string;
    parentEventId?: string;
  }): Promise<CorrelationEntry>;
  listByCorrelation(correlationId: string): Promise<readonly CorrelationEntry[]>;
};

export type EventTelemetryPort = {
  recordPublished(): void;
  recordFailure(): void;
  recordRetry(): void;
  recordDeadLetter(): void;
  recordSubscriberFailure(subscriberId: string): void;
  recordSubscriberExecution(record: SubscriberTelemetryRecord): Promise<void>;
  snapshot(): Readonly<{
    published: number;
    failures: number;
    retries: number;
    deadLetters: number;
    subscribers: Readonly<Record<string, { success: number; failure: number; avgLatencyMs: number }>>;
  }>;
};

export type IdempotencyStorePort = {
  exists(tenantId: string, scope: string, key: string): Promise<boolean>;
  store(tenantId: string, scope: string, key: string, resultHash?: string): Promise<void>;
};
