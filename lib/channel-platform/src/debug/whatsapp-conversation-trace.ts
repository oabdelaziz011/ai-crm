/**
 * Sprint 2.4 — Enterprise WhatsApp conversation observability.
 * Request-scoped via AsyncLocalStorage. Correlates later delivery/read
 * status webhooks via process-local outbound externalMessageId → traceId map.
 * Observation only — no business-logic side effects.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const GLOBAL_KEY = "__WHATSAPP_CONVERSATION_TRACE__";
const GLOBAL_GETTER_KEY = "__WHATSAPP_GET_CONVERSATION_TRACE__";
const CORRELATION_TTL_MS = 60 * 60 * 1000;
const CORRELATION_MAX = 5_000;

export type WhatsAppConversationTraceSnapshot = {
  traceId: string;
  conversationId: string | null;
  workflowId: string | null;
  automationRunId: string | null;
  workflowTimeMs: number | null;
  dbTimeMs: number;
  metaTimeMs: number;
  nodesExecuted: number;
  queries: number;
  cacheHits: number;
  cacheMisses: number;
  outboundCount: number;
  deliveryStatus: string | null;
  readStatus: string | null;
  errors: string[];
};

type CorrelationEntry = {
  traceId: string;
  createdAt: number;
  conversationId: string | null;
  workflowId: string | null;
  automationRunId: string | null;
  deliveryStatus: string | null;
  readStatus: string | null;
};

const traceAls = new AsyncLocalStorage<WhatsAppConversationTrace>();
const outboundCorrelation = new Map<string, CorrelationEntry>();

function pruneCorrelation(now = Date.now()): void {
  for (const [key, entry] of outboundCorrelation) {
    if (now - entry.createdAt > CORRELATION_TTL_MS) outboundCorrelation.delete(key);
  }
  while (outboundCorrelation.size > CORRELATION_MAX) {
    const oldest = outboundCorrelation.keys().next().value;
    if (oldest == null) break;
    outboundCorrelation.delete(oldest);
  }
}

export class WhatsAppConversationTrace {
  readonly traceId: string;
  conversationId: string | null = null;
  channelSessionId: string | null = null;
  workflowId: string | null = null;
  automationRunId: string | null = null;
  inboundExternalMessageId: string | null = null;
  workflowTimeMs: number | null = null;
  dbTimeMs = 0;
  metaTimeMs = 0;
  nodesExecuted = 0;
  queries = 0;
  cacheHits = 0;
  cacheMisses = 0;
  outboundCount = 0;
  deliveryStatus: string | null = null;
  readStatus: string | null = null;
  readonly errors: string[] = [];
  private readonly outboundExternalIds = new Set<string>();
  private summaryPrinted = false;

  constructor(traceId: string) {
    this.traceId = traceId;
  }

  bindConversation(conversationId: string | null | undefined): void {
    if (conversationId) this.conversationId = conversationId;
  }

  bindSession(channelSessionId: string | null | undefined): void {
    if (channelSessionId) this.channelSessionId = channelSessionId;
  }

  bindWorkflow(workflowId: string | null | undefined): void {
    if (workflowId) this.workflowId = workflowId;
  }

  bindAutomationRun(runId: string | null | undefined): void {
    if (runId) this.automationRunId = runId;
  }

  bindInboundExternalMessageId(id: string | null | undefined): void {
    if (id) this.inboundExternalMessageId = id;
  }

  recordNode(): void {
    this.nodesExecuted += 1;
  }

  recordQuery(durationMs = 0): void {
    this.queries += 1;
    if (durationMs > 0) this.dbTimeMs += durationMs;
  }

  addMetaTime(durationMs: number): void {
    if (durationMs > 0) this.metaTimeMs += durationMs;
  }

  setMetaTime(durationMs: number): void {
    this.metaTimeMs = Math.max(0, durationMs);
  }

  setWorkflowTime(durationMs: number): void {
    this.workflowTimeMs = Math.max(0, durationMs);
  }

  setCacheStats(hits: number, misses: number): void {
    this.cacheHits = Math.max(0, hits);
    this.cacheMisses = Math.max(0, misses);
  }

  incrementOutbound(count = 1): void {
    this.outboundCount += Math.max(0, count);
  }

  noteError(message: string | null | undefined): void {
    if (!message?.trim()) return;
    this.errors.push(message.trim());
  }

  setDeliveryStatus(status: string | null | undefined): void {
    if (!status) return;
    this.deliveryStatus = status;
    if (status === "read") this.readStatus = "read";
  }

  setReadStatus(status: string | null | undefined): void {
    if (!status) return;
    this.readStatus = status;
  }

  registerOutboundExternalId(externalMessageId: string | null | undefined): void {
    const id = externalMessageId?.trim();
    if (!id) return;
    this.outboundExternalIds.add(id);
    pruneCorrelation();
    outboundCorrelation.set(id, {
      traceId: this.traceId,
      createdAt: Date.now(),
      conversationId: this.conversationId,
      workflowId: this.workflowId,
      automationRunId: this.automationRunId,
      deliveryStatus: this.deliveryStatus,
      readStatus: this.readStatus,
    });
  }

  snapshot(): WhatsAppConversationTraceSnapshot {
    return {
      traceId: this.traceId,
      conversationId: this.conversationId,
      workflowId: this.workflowId,
      automationRunId: this.automationRunId,
      workflowTimeMs: this.workflowTimeMs,
      dbTimeMs: this.dbTimeMs,
      metaTimeMs: this.metaTimeMs,
      nodesExecuted: this.nodesExecuted,
      queries: this.queries,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      outboundCount: this.outboundCount,
      deliveryStatus: this.deliveryStatus,
      readStatus: this.readStatus,
      errors: [...this.errors],
    };
  }

  printSummary(): void {
    if (this.summaryPrinted) return;
    this.summaryPrinted = true;

    const lines = [
      "",
      "========================================",
      "",
      "TRACE",
      this.traceId,
      "",
      "Conversation",
      this.conversationId ?? "(none)",
      "",
      "Workflow",
      this.workflowId ?? "(none)",
      "",
      "Automation Run",
      this.automationRunId ?? "(none)",
      "",
      "Workflow Time",
      this.workflowTimeMs == null ? "(n/a)" : `${Math.round(this.workflowTimeMs)} ms`,
      "",
      "DB Time",
      `${Math.round(this.dbTimeMs)} ms`,
      "",
      "Meta Time",
      `${Math.round(this.metaTimeMs)} ms`,
      "",
      "Nodes Executed",
      String(this.nodesExecuted),
      "",
      "Queries",
      String(this.queries),
      "",
      "Cache Hits",
      String(this.cacheHits),
      "",
      "Cache Misses",
      String(this.cacheMisses),
      "",
      "Outbound Count",
      String(this.outboundCount),
      "",
      "Delivery Status",
      this.deliveryStatus ?? "(pending)",
      "",
      "Read Status",
      this.readStatus ?? "(pending)",
      "",
      "Errors",
      this.errors.length === 0 ? "(none)" : this.errors.join(" | "),
      "",
      "========================================",
      "",
    ];

    console.log(lines.join("\n"));
  }
}

type GlobalTraceHost = typeof globalThis & {
  [GLOBAL_KEY]?: WhatsAppConversationTrace | null;
  [GLOBAL_GETTER_KEY]?: () => WhatsAppConversationTrace | null;
};

export function getWhatsAppConversationTrace(): WhatsAppConversationTrace | null {
  return traceAls.getStore() ?? (globalThis as GlobalTraceHost)[GLOBAL_KEY] ?? null;
}

type GlobalTraceApiHost = typeof globalThis & {
  __WHATSAPP_CONVERSATION_TRACE_API__?: {
    printStatusUpdate(externalMessageId: string | null | undefined, status: string): void;
  };
};

export function setWhatsAppConversationTrace(trace: WhatsAppConversationTrace | null): void {
  const host = globalThis as GlobalTraceHost & GlobalTraceApiHost;
  host[GLOBAL_KEY] = trace;
  host[GLOBAL_GETTER_KEY] = getWhatsAppConversationTrace;
  host.__WHATSAPP_CONVERSATION_TRACE_API__ = {
    printStatusUpdate: printConversationTraceStatusUpdate,
  };
}

/** Ensure status-correlation API is installed even before an inbound ALS scope. */
export function installWhatsAppConversationTraceApi(): void {
  const host = globalThis as GlobalTraceApiHost;
  host.__WHATSAPP_CONVERSATION_TRACE_API__ = {
    printStatusUpdate: printConversationTraceStatusUpdate,
  };
}

export async function runWithWhatsAppConversationTrace<T>(
  trace: WhatsAppConversationTrace,
  fn: () => Promise<T>,
): Promise<T> {
  setWhatsAppConversationTrace(trace);
  return traceAls.run(trace, async () => {
    try {
      return await fn();
    } finally {
      // Caller prints + clears.
    }
  });
}

export function lookupConversationTraceByOutboundExternalId(
  externalMessageId: string | null | undefined,
): CorrelationEntry | null {
  const id = externalMessageId?.trim();
  if (!id) return null;
  pruneCorrelation();
  return outboundCorrelation.get(id) ?? null;
}

export function updateConversationTraceDeliveryStatus(
  externalMessageId: string | null | undefined,
  status: string,
): CorrelationEntry | null {
  const entry = lookupConversationTraceByOutboundExternalId(externalMessageId);
  if (!entry) return null;
  entry.deliveryStatus = status;
  if (status === "read") entry.readStatus = "read";
  outboundCorrelation.set(externalMessageId!.trim(), entry);

  const active = getWhatsAppConversationTrace();
  if (active && active.traceId === entry.traceId) {
    active.setDeliveryStatus(status);
  }
  return entry;
}

/** Print a status-update summary for a correlated outbound wamid (separate HTTP request). */
export function printConversationTraceStatusUpdate(
  externalMessageId: string | null | undefined,
  status: string,
): void {
  const entry = updateConversationTraceDeliveryStatus(externalMessageId, status);
  if (!entry) return;

  const lines = [
    "",
    "========================================",
    "",
    "STATUS UPDATE",
    "",
    "TRACE",
    entry.traceId,
    "",
    "Conversation",
    entry.conversationId ?? "(none)",
    "",
    "Workflow",
    entry.workflowId ?? "(none)",
    "",
    "Automation Run",
    entry.automationRunId ?? "(none)",
    "",
    "Delivery Status",
    entry.deliveryStatus ?? "(pending)",
    "",
    "Read Status",
    entry.readStatus ?? "(pending)",
    "",
    "Outbound External Id",
    externalMessageId?.trim() || "(none)",
    "",
    "========================================",
    "",
  ];
  console.log(lines.join("\n"));
}

/** @internal test helper */
export function __resetConversationTraceCorrelationForTests(): void {
  outboundCorrelation.clear();
}
