type TranscriptAuditTracer = (input: {
  stage: string;
  file: string;
  function: string;
  line: number;
  conversationId?: string | null;
  queryKey?: unknown;
  sqlWhere?: string | null;
  orderBy?: string | null;
  limit?: number | null;
  rows?: Array<{ id: string; created_at: string; message_type?: string; content?: string }>;
  extra?: Record<string, unknown>;
}) => unknown;

declare global {
  interface Window {
    __traceTranscriptMessageStage__?: TranscriptAuditTracer;
  }
}

export function traceTranscriptMessageStageBridge(
  input: Parameters<NonNullable<TranscriptAuditTracer>>[0],
): void {
  if (typeof globalThis !== "undefined") {
    globalThis.window?.__traceTranscriptMessageStage__?.(input);
  }
}
