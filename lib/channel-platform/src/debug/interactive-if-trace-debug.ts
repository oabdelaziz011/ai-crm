import { readRuntimeEnvFlag } from "@workspace/platform-crypto/runtime-env-unified";

export function isInteractiveIfTraceEnabled(): boolean {
  return (
    readRuntimeEnvFlag("AUTOMATION_WORKFLOW_TRACE_DEBUG") ||
    readRuntimeEnvFlag("AUTOMATION_IF_TRACE_DEBUG")
  );
}

export function logInteractiveIfTrace(payload: Record<string, unknown>): void {
  if (!isInteractiveIfTraceEnabled()) return;
  console.info(JSON.stringify({ event: "automation.interactive_if_trace", ...payload }));
}

export function summarizeWhatsAppListReplyPayload(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const message = payload.message as
    | {
        type?: string;
        interactive?: { list_reply?: { id?: string; title?: string; description?: string } };
      }
    | undefined;
  if (message?.type !== "interactive" || !message.interactive?.list_reply) return undefined;

  const listReply = message.interactive.list_reply;
  return {
    messageType: message.type,
    listReplyId: listReply.id ?? null,
    listReplyTitle: listReply.title ?? null,
    listReplyDescription: listReply.description ?? null,
  };
}

export function traceWhatsAppRawWebhookPayload(payload: Record<string, unknown>): void {
  const summary = summarizeWhatsAppListReplyPayload(payload);
  if (!summary) return;
  logInteractiveIfTrace({
    stage: "raw_webhook_payload",
    channelKey: "whatsapp",
    rawWebhookSummary: summary,
  });
}

export function traceParsedInboundMessage(input: {
  channelKey: string;
  externalUserId: string;
  text: string;
  metadata: Record<string, unknown>;
  rawWebhookSummary?: Record<string, unknown>;
}): void {
  if (input.rawWebhookSummary) {
    logInteractiveIfTrace({
      stage: "raw_webhook_payload",
      channelKey: input.channelKey,
      rawWebhookSummary: input.rawWebhookSummary,
    });
  }

  logInteractiveIfTrace({
    stage: "parsed_inbound_message",
    channelKey: input.channelKey,
    externalUserId: input.externalUserId,
    text: input.text,
    replyId: input.metadata.replyId ?? null,
    title: input.metadata.title ?? null,
    kind: input.metadata.kind ?? null,
    interactionType: input.metadata.interactionType ?? null,
    whatsappMessageType: input.metadata.whatsappMessageType ?? null,
  });
}
