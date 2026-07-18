import type { VectorQueryTelemetryEvent } from "../types.js";

export type VectorQueryLogEvent = {
  correlationId: string;
  event: string;
  companyId?: string;
  provider?: string;
  collectionId?: string;
  policyId?: string | null;
  resultCount?: number;
  executionTimeMs?: number;
  errorCode?: string;
};

const REDACTED_KEYS = ["vector", "embedding", "credentials", "apiKey", "token", "secret", "password"];

export function createStructuredLogEvent(
  event: string,
  correlationId: string,
  details: Omit<VectorQueryLogEvent, "event" | "correlationId"> = {},
): VectorQueryLogEvent {
  return {
    event,
    correlationId,
    ...details,
  };
}

export function serializeStructuredLog(payload: VectorQueryLogEvent): string {
  return JSON.stringify(sanitizeLogPayload(payload));
}

export function telemetryToLogEvent(event: VectorQueryTelemetryEvent): VectorQueryLogEvent {
  return {
    correlationId: event.correlationId,
    event: event.error ? "vector_query_failed" : "vector_query_completed",
    companyId: event.companyId,
    provider: event.provider,
    collectionId: event.collectionId,
    policyId: event.policyId ?? null,
    resultCount: event.resultCount,
    executionTimeMs: event.executionTimeMs,
    errorCode: event.error ? "VECTOR_QUERY_FAILED" : undefined,
  };
}

function sanitizeLogPayload(payload: VectorQueryLogEvent): VectorQueryLogEvent {
  const clone = { ...payload } as Record<string, unknown>;
  for (const key of Object.keys(clone)) {
    if (REDACTED_KEYS.some((blocked) => key.toLowerCase().includes(blocked))) {
      delete clone[key];
    }
  }
  return clone as VectorQueryLogEvent;
}

export function logVectorQueryEvent(payload: VectorQueryLogEvent): void {
  if (process.env.NODE_ENV === "test") return;
  console.info(serializeStructuredLog(payload));
}
