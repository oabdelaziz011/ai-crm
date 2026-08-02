export type WebhookProcessingStep =
  | "webhook.received"
  | "webhook.payload_parsed"
  | "webhook.phone_number_extracted"
  | "webhook.routing_resolved"
  | "webhook.routing_failed"
  | "webhook.signature_verified"
  | "webhook.signature_rejected"
  | "webhook.handler_started"
  | "webhook.adapter_parsed"
  | "webhook.inbound_event_created"
  | "webhook.inbound_message_reused"
  | "webhook.message_normalized"
  | "webhook.workflow_resolved"
  | "webhook.workflow_missing"
  | "webhook.session_resolved"
  | "webhook.automation_started"
  | "webhook.automation_completed"
  | "webhook.outbound_dispatched"
  | "webhook.outbound_failed"
  | "webhook.ai_runtime_started"
  | "webhook.ai_employee_resolved"
  | "webhook.ai_employee_runtime_prepared"
  | "webhook.processing_completed"
  | "webhook.processing_failed"
  | "webhook.diag_early_return"
  | "webhook.diag"
  | "webhook.email_thread_resolved";

export type WebhookProcessingTrace = {
  step: (step: WebhookProcessingStep, detail?: Record<string, unknown>) => void;
};

export function createWebhookProcessingTrace(
  log: (detail: Record<string, unknown>, message: string) => void,
  base: Record<string, unknown> = {},
): WebhookProcessingTrace {
  let sequence = 0;

  return {
    step(step, detail = {}) {
      sequence += 1;
      log(
        {
          ...base,
          webhookStep: step,
          webhookStepSequence: sequence,
          ...detail,
        },
        `WhatsApp webhook step: ${step}`,
      );
    },
  };
}

export function summarizeWhatsAppWebhookPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  let messageCount = 0;
  let statusCount = 0;
  let phoneNumberId: string | null = null;
  let senderExternalId: string | null = null;
  let externalMessageId: string | null = null;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;

      const metadata = (value as { metadata?: unknown }).metadata;
      if (metadata && typeof metadata === "object") {
        const candidate = (metadata as { phone_number_id?: unknown }).phone_number_id;
        if (typeof candidate === "string" && candidate.trim()) {
          phoneNumberId = candidate.trim();
        }
      }

      const messages = (value as { messages?: unknown }).messages;
      if (Array.isArray(messages)) {
        messageCount += messages.length;
        const first = messages[0];
        if (first && typeof first === "object") {
          const from = (first as { from?: unknown }).from;
          const id = (first as { id?: unknown }).id;
          if (typeof from === "string") senderExternalId = from;
          if (typeof id === "string") externalMessageId = id;
        }
      }

      const statuses = (value as { statuses?: unknown }).statuses;
      if (Array.isArray(statuses)) statusCount += statuses.length;
    }
  }

  return {
    object: payload.object ?? null,
    entryCount: entries.length,
    messageCount,
    statusCount,
    phoneNumberId,
    senderExternalId,
    externalMessageId,
  };
}
