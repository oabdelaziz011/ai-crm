/**
 * Browser-safe bridge for Sprint 2.4 conversation observability.
 * Server installs the real ALS via whatsapp-conversation-trace.ts.
 */

type ConversationTraceLike = {
  bindConversation(conversationId: string | null | undefined): void;
  bindSession(channelSessionId: string | null | undefined): void;
  bindWorkflow(workflowId: string | null | undefined): void;
  bindAutomationRun(runId: string | null | undefined): void;
  bindInboundExternalMessageId(id: string | null | undefined): void;
  recordNode(): void;
  recordQuery(durationMs?: number): void;
  addMetaTime(durationMs: number): void;
  setWorkflowTime(durationMs: number): void;
  setCacheStats(hits: number, misses: number): void;
  setMetaTime?(durationMs: number): void;
  incrementOutbound(count?: number): void;
  noteError(message: string | null | undefined): void;
  setDeliveryStatus(status: string | null | undefined): void;
  registerOutboundExternalId(externalMessageId: string | null | undefined): void;
  printSummary(): void;
};

type ConversationTraceApi = {
  printStatusUpdate(externalMessageId: string | null | undefined, status: string): void;
};

const GLOBAL_KEY = "__WHATSAPP_CONVERSATION_TRACE__";
const GLOBAL_GETTER_KEY = "__WHATSAPP_GET_CONVERSATION_TRACE__";
const GLOBAL_API_KEY = "__WHATSAPP_CONVERSATION_TRACE_API__";

function getTrace(): ConversationTraceLike | null {
  const host = globalThis as Record<string, unknown>;
  const getter = host[GLOBAL_GETTER_KEY];
  if (typeof getter === "function") {
    return (getter as () => ConversationTraceLike | null)() ?? null;
  }
  return (host[GLOBAL_KEY] as ConversationTraceLike | undefined) ?? null;
}

function getApi(): ConversationTraceApi | null {
  const host = globalThis as Record<string, unknown>;
  return (host[GLOBAL_API_KEY] as ConversationTraceApi | undefined) ?? null;
}

export function waTraceBindConversation(conversationId: string | null | undefined): void {
  getTrace()?.bindConversation(conversationId);
}

export function waTraceBindSession(channelSessionId: string | null | undefined): void {
  getTrace()?.bindSession(channelSessionId);
}

export function waTraceBindWorkflow(workflowId: string | null | undefined): void {
  getTrace()?.bindWorkflow(workflowId);
}

export function waTraceBindAutomationRun(runId: string | null | undefined): void {
  getTrace()?.bindAutomationRun(runId);
}

export function waTraceBindInboundExternalMessageId(id: string | null | undefined): void {
  getTrace()?.bindInboundExternalMessageId(id);
}

export function waTraceRecordNode(): void {
  getTrace()?.recordNode();
}

export function waTraceRecordQuery(durationMs = 0): void {
  getTrace()?.recordQuery(durationMs);
}

export function waTraceAddMetaTime(durationMs: number): void {
  getTrace()?.addMetaTime(durationMs);
}

export function waTraceSetWorkflowTime(durationMs: number): void {
  getTrace()?.setWorkflowTime(durationMs);
}

export function waTraceIncrementOutbound(count = 1): void {
  getTrace()?.incrementOutbound(count);
}

export function waTraceNoteError(message: string | null | undefined): void {
  getTrace()?.noteError(message);
}

export function waTraceRegisterOutboundExternalId(
  externalMessageId: string | null | undefined,
): void {
  getTrace()?.registerOutboundExternalId(externalMessageId);
}

/** Correlate a later delivery/read status webhook to the inbound TRACE. */
export function waTraceOnDeliveryStatus(
  externalMessageId: string | null | undefined,
  status: string,
): void {
  getApi()?.printStatusUpdate(externalMessageId, status);
}
