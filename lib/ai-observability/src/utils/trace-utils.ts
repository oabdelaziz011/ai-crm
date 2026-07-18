import { randomUUID } from "@workspace/platform-crypto";
import type { TraceContext } from "../types.js";

export function createTraceIdentifiers(correlationId?: string | null): {
  traceId: string;
  correlationId: string;
} {
  const resolvedCorrelationId = correlationId ?? randomUUID();
  return {
    traceId: randomUUID(),
    correlationId: resolvedCorrelationId,
  };
}

export function toTraceContext(
  trace: { id: string; trace_id: string; correlation_id: string; company_id: string; conversation_id?: string | null },
): TraceContext {
  return {
    traceId: trace.trace_id,
    traceRecordId: trace.id,
    correlationId: trace.correlation_id,
    companyId: trace.company_id,
    conversationId: trace.conversation_id ?? null,
  };
}

export function resolveBillingPeriod(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function assertCorrelationConsistency(
  expectedCorrelationId: string,
  actualCorrelationId: string,
): void {
  if (expectedCorrelationId !== actualCorrelationId) {
    throw new Error("TRACE_CORRELATION_MISMATCH");
  }
}

export function elapsedMs(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}
