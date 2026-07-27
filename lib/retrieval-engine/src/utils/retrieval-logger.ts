import type { RetrievalTelemetryEvent } from "../types.js";
import { isTestRuntime } from "@workspace/platform-crypto/client";

export type RetrievalLogEvent = {
  correlationId: string;
  event: string;
  companyId?: string;
  executionId?: string;
  policyId?: string | null;
  chunksSelected?: number;
  chunksRejected?: number;
  budgetUsedTokens?: number;
  budgetTokens?: number;
  executionTimeMs?: number;
  orchestrationTimeMs?: number;
  errorCode?: string;
  collectionId?: string;
  providerKey?: string;
  dimensions?: number;
  vectorQueryExecutionId?: string;
  resultCount?: number;
};

const REDACTED_KEYS = ["vector", "embedding", "credentials", "apiKey", "token", "secret", "password"];

export function createStructuredLogEvent(
  event: string,
  correlationId: string,
  details: Omit<RetrievalLogEvent, "event" | "correlationId"> = {},
): RetrievalLogEvent {
  return {
    event,
    correlationId,
    ...details,
  };
}

export function telemetryToLogEvent(event: RetrievalTelemetryEvent): RetrievalLogEvent {
  return {
    correlationId: event.correlationId,
    event: event.error ? "retrieval_failed" : "retrieval_completed",
    companyId: event.companyId,
    executionId: event.executionId,
    policyId: event.policyId,
    chunksSelected: event.chunksSelected,
    chunksRejected: event.chunksRejected,
    budgetUsedTokens: event.budgetUsedTokens,
    budgetTokens: event.budgetTokens,
    executionTimeMs: event.executionTimeMs,
    errorCode: event.error ? "RETRIEVAL_FAILED" : undefined,
  };
}

function sanitizeLogPayload(payload: RetrievalLogEvent): RetrievalLogEvent {
  const clone = { ...payload } as Record<string, unknown>;
  for (const key of Object.keys(clone)) {
    if (REDACTED_KEYS.some((blocked) => key.toLowerCase().includes(blocked))) {
      delete clone[key];
    }
  }
  return clone as RetrievalLogEvent;
}

export function serializeStructuredLog(payload: RetrievalLogEvent): string {
  return JSON.stringify(sanitizeLogPayload(payload));
}

export function logRetrievalEvent(payload: RetrievalLogEvent): void {
  if (isTestRuntime()) return;
  console.info(serializeStructuredLog(payload));
}
