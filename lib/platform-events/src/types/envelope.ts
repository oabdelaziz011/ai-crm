/** Current schema version for all platform events. Bump when breaking payload changes occur. */
export const PLATFORM_EVENT_SCHEMA_VERSION = 1 as const;

export type PlatformEventSchemaVersion = typeof PLATFORM_EVENT_SCHEMA_VERSION;

export type PlatformActorType = "user" | "system" | "ai";

export type PlatformEventEnvelope<TType extends string, TPayload> = {
  eventId: string;
  eventType: TType;
  schemaVersion: PlatformEventSchemaVersion;
  occurredAt: string;
  publishedAt: string;
  correlationId: string;
  causationId?: string;
  tenantId: string;
  workspaceId?: string;
  actorId?: string;
  actorType: PlatformActorType;
  sourceModule: string;
  entityType?: string;
  entityId?: string;
  payload: TPayload;
};

export type PublishContext = {
  tenantId: string;
  workspaceId?: string;
  actorId?: string;
  actorType?: PlatformActorType;
  correlationId?: string;
  causationId?: string;
  sourceModule: string;
  entityType?: string;
  entityId?: string;
  occurredAt?: string;
};

export type PublishResult = {
  eventId: string;
  correlationId: string;
  subscriberCount: number;
  dispatchedAt: string;
};
