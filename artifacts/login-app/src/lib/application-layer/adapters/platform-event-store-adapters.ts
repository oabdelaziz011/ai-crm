import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditTrailStorePort,
  CorrelationStorePort,
  DeadLetterQueuePort,
  EventTelemetryPort,
  IdempotencyStorePort,
  TimelineStorePort,
} from "@workspace/platform-events";
import type { PlatformEventEnvelope } from "@workspace/platform-events";

export function createSupabaseAuditTrailStore(client: SupabaseClient): AuditTrailStorePort {
  return {
    async recordFromEvent(envelope) {
      const entry = {
        tenant_id: envelope.tenantId,
        event_id: envelope.eventId,
        event_type: envelope.eventType,
        correlation_id: envelope.correlationId,
        causation_id: envelope.causationId ?? null,
        actor_id: envelope.actorId ?? null,
        actor_type: envelope.actorType,
        source_module: envelope.sourceModule,
        entity_type: envelope.entityType ?? null,
        entity_id: envelope.entityId ?? null,
        summary: `${envelope.eventType} published by ${envelope.sourceModule}`,
        envelope,
        occurred_at: envelope.occurredAt,
      };
      const { error } = await client.from("platform_event_audit").insert(entry);
      if (error) throw error;
      return Object.freeze({
        id: envelope.eventId,
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
        summary: entry.summary,
      });
    },
    async list(tenantId) {
      let q = client.from("platform_event_audit").select("*").order("occurred_at", { ascending: false }).limit(200);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      const { data } = await q;
      return Object.freeze(
        (data ?? []).map((row) =>
          Object.freeze({
            id: String(row.event_id),
            timestamp: String(row.occurred_at),
            actorId: row.actor_id ?? undefined,
            actorType: String(row.actor_type),
            module: String(row.source_module),
            correlationId: String(row.correlation_id),
            tenantId: String(row.tenant_id),
            entityType: row.entity_type ?? undefined,
            entityId: row.entity_id ?? undefined,
            eventType: String(row.event_type),
            eventId: String(row.event_id),
            summary: String(row.summary),
          }),
        ),
      );
    },
    async listByCorrelation(correlationId) {
      const { data } = await client
        .from("platform_event_audit")
        .select("*")
        .eq("correlation_id", correlationId)
        .order("occurred_at", { ascending: false });
      return Object.freeze(
        (data ?? []).map((row) =>
          Object.freeze({
            id: String(row.event_id),
            timestamp: String(row.occurred_at),
            actorType: String(row.actor_type),
            module: String(row.source_module),
            correlationId: String(row.correlation_id),
            tenantId: String(row.tenant_id),
            eventType: String(row.event_type),
            eventId: String(row.event_id),
            summary: String(row.summary),
          }),
        ),
      );
    },
  };
}

export function createSupabaseTimelineStore(client: SupabaseClient): TimelineStorePort {
  return {
    async recordFromEvent(envelope) {
      const entityLabel =
        envelope.entityType && envelope.entityId
          ? `${envelope.entityType}:${envelope.entityId}`
          : "platform";
      const { error } = await client.from("platform_event_timeline").insert({
        tenant_id: envelope.tenantId,
        event_id: envelope.eventId,
        event_type: envelope.eventType,
        correlation_id: envelope.correlationId,
        entity_type: envelope.entityType ?? null,
        entity_id: envelope.entityId ?? null,
        actor_id: envelope.actorId ?? null,
        title: envelope.eventType,
        description: `${envelope.sourceModule} event for ${entityLabel}`,
        source_module: envelope.sourceModule,
        occurred_at: envelope.occurredAt,
      });
      if (error) throw error;
      return Object.freeze({
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
    },
    async listForEntity(entityType, entityId) {
      const { data } = await client
        .from("platform_event_timeline")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("occurred_at", { ascending: false })
        .limit(100);
      return Object.freeze(
        (data ?? []).map((row) =>
          Object.freeze({
            id: String(row.id),
            occurredAt: String(row.occurred_at),
            eventType: String(row.event_type),
            eventId: String(row.event_id),
            correlationId: String(row.correlation_id),
            tenantId: String(row.tenant_id),
            entityType: row.entity_type ?? undefined,
            entityId: row.entity_id ?? undefined,
            title: String(row.title),
            description: String(row.description),
            sourceModule: String(row.source_module),
          }),
        ),
      );
    },
    async listForTenant(tenantId) {
      const { data } = await client
        .from("platform_event_timeline")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("occurred_at", { ascending: false })
        .limit(200);
      return Object.freeze(
        (data ?? []).map((row) =>
          Object.freeze({
            id: String(row.id),
            occurredAt: String(row.occurred_at),
            eventType: String(row.event_type),
            eventId: String(row.event_id),
            correlationId: String(row.correlation_id),
            tenantId: String(row.tenant_id),
            title: String(row.title),
            description: String(row.description),
            sourceModule: String(row.source_module),
          }),
        ),
      );
    },
  };
}

export function createSupabaseDeadLetterQueue(client: SupabaseClient): DeadLetterQueuePort {
  return {
    async push(input) {
      const { data, error } = await client
        .from("platform_event_dlq")
        .insert({
          tenant_id: input.envelope.tenantId,
          subscriber_id: input.subscriberId,
          event_id: input.envelope.eventId,
          event_type: input.envelope.eventType,
          correlation_id: input.envelope.correlationId,
          envelope: input.envelope,
          error: input.error,
          attempts: input.attempts,
        })
        .select("id, dead_lettered_at")
        .single();
      if (error || !data) throw error ?? new Error("DLQ insert failed");
      return Object.freeze({
        id: String(data.id),
        subscriberId: input.subscriberId,
        envelope: input.envelope,
        error: input.error,
        attempts: input.attempts,
        deadLetteredAt: String(data.dead_lettered_at),
      });
    },
    async list() {
      const { data } = await client.from("platform_event_dlq").select("*").order("dead_lettered_at", { ascending: false }).limit(200);
      return Object.freeze(
        (data ?? []).map((row) =>
          Object.freeze({
            id: String(row.id),
            subscriberId: String(row.subscriber_id),
            envelope: row.envelope as PlatformEventEnvelope<string, unknown>,
            error: String(row.error),
            attempts: Number(row.attempts),
            deadLetteredAt: String(row.dead_lettered_at),
          }),
        ),
      );
    },
    async listForSubscriber(subscriberId) {
      const { data } = await client
        .from("platform_event_dlq")
        .select("*")
        .eq("subscriber_id", subscriberId)
        .order("dead_lettered_at", { ascending: false })
        .limit(100);
      return Object.freeze(
        (data ?? []).map((row) =>
          Object.freeze({
            id: String(row.id),
            subscriberId: String(row.subscriber_id),
            envelope: row.envelope as PlatformEventEnvelope<string, unknown>,
            error: String(row.error),
            attempts: Number(row.attempts),
            deadLetteredAt: String(row.dead_lettered_at),
          }),
        ),
      );
    },
    async markReplayed(id) {
      await client.from("platform_event_dlq").update({ replayed_at: new Date().toISOString() }).eq("id", id);
    },
  };
}

export function createSupabaseCorrelationStore(client: SupabaseClient): CorrelationStorePort {
  return {
    async recordChain(input) {
      const { error } = await client.from("platform_event_correlations").insert({
        tenant_id: input.tenantId,
        correlation_id: input.correlationId,
        root_event_id: input.rootEventId,
        event_id: input.eventId,
        event_type: input.eventType,
        parent_event_id: input.parentEventId ?? null,
      });
      if (error) throw error;
      return Object.freeze({
        id: `corr_${input.eventId}`,
        tenantId: input.tenantId,
        correlationId: input.correlationId,
        rootEventId: input.rootEventId,
        eventId: input.eventId,
        eventType: input.eventType,
        parentEventId: input.parentEventId,
        createdAt: new Date().toISOString(),
      });
    },
    async listByCorrelation(correlationId) {
      const { data } = await client
        .from("platform_event_correlations")
        .select("*")
        .eq("correlation_id", correlationId);
      return Object.freeze(
        (data ?? []).map((row) =>
          Object.freeze({
            id: String(row.id),
            tenantId: String(row.tenant_id),
            correlationId: String(row.correlation_id),
            rootEventId: String(row.root_event_id),
            eventId: String(row.event_id),
            eventType: String(row.event_type),
            parentEventId: row.parent_event_id ?? undefined,
            createdAt: String(row.created_at),
          }),
        ),
      );
    },
  };
}

export function createSupabaseIdempotencyStore(client: SupabaseClient): IdempotencyStorePort {
  return {
    async exists(tenantId, scope, key) {
      const { data } = await client
        .from("platform_event_idempotency")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("scope", scope)
        .eq("idempotency_key", key)
        .maybeSingle();
      return Boolean(data);
    },
    async store(tenantId, scope, key, resultHash) {
      await client.from("platform_event_idempotency").upsert(
        {
          tenant_id: tenantId,
          scope,
          idempotency_key: key,
          result_hash: resultHash ?? "1",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: "tenant_id,scope,idempotency_key" },
      );
    },
  };
}

export function createSupabaseEventTelemetry(client: SupabaseClient): EventTelemetryPort {
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
      await client.from("platform_event_subscriber_telemetry").insert({
        tenant_id: record.tenantId,
        subscriber_id: record.subscriberId,
        event_id: record.eventId,
        event_type: record.eventType,
        correlation_id: record.correlationId,
        success: record.success,
        latency_ms: record.latencyMs,
        error: record.error ?? null,
      });
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
  };
}
