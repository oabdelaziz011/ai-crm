import type { ChannelConversationPort, ChannelDispatcherPort } from "../ports/channel-platform-ports.js";
import type { ServiceContext } from "../types.js";
import type { AutomationOutboundDispatchMessage } from "./extract-automation-outbound.js";
import { waPerfMeasure } from "../debug/whatsapp-pipeline-perf.js";

export type DispatchAutomationOutboundInput = {
  companyId: string;
  companyChannelId: string;
  channelKey: string;
  conversationId: string;
  channelSessionId: string;
  externalThreadId: string;
  automationRunId: string;
  correlationId: string;
  messages: AutomationOutboundDispatchMessage[];
};

export type DispatchAutomationOutboundResult = {
  deliveryEventIds: string[];
  outboundMessageIds: string[];
  lastDeliveryEventId?: string;
  responseContent?: string;
};

function outboundMessageFingerprint(message: AutomationOutboundDispatchMessage): string {
  const payload = message.payload;
  const text = message.text.trim();
  if (payload && typeof payload === "object") {
    const kind = typeof payload.kind === "string" ? payload.kind : "payload";
    if (kind === "list") {
      const title = typeof payload.title === "string" ? payload.title : "";
      const body = typeof payload.body === "string" ? payload.body : "";
      const sections = Array.isArray(payload.sections) ? JSON.stringify(payload.sections) : "";
      return `list:${title}|${body}|${sections}`;
    }
    if (kind === "buttons") {
      const buttonText = typeof payload.text === "string" ? payload.text : text;
      const buttons = Array.isArray(payload.buttons) ? JSON.stringify(payload.buttons) : "";
      return `buttons:${buttonText}|${buttons}`;
    }
    if (kind === "text") {
      const body = typeof payload.text === "string" ? payload.text : text;
      return `text:${body.trim()}`;
    }
    // Include text so automation_prompt / other kinds dedupe identical bubbles.
    return `${kind}:${text}|${JSON.stringify(payload)}`;
  }
  return `text:${text}`;
}

export async function dispatchAutomationOutboundMessages(
  ctx: ServiceContext,
  dispatcher: ChannelDispatcherPort,
  conversation: ChannelConversationPort,
  input: DispatchAutomationOutboundInput,
): Promise<DispatchAutomationOutboundResult> {
  return waPerfMeasure(
    "Outbound dispatch",
    async () => {
      const deliveryEventIds: string[] = [];
      const outboundMessageIds: string[] = [];
      const sentFingerprints = new Set<string>();

      for (const message of input.messages) {
        const text = message.text.trim();
        if (!text && !(message.attachments?.length ?? 0)) continue;

        // Workflow graphs (and duplicate webhook resumes) can emit the same bubble twice.
        const fingerprint = outboundMessageFingerprint(message);
        if (sentFingerprints.has(fingerprint)) {
          continue;
        }
        sentFingerprints.add(fingerprint);

        const metadata = {
          automationRunId: input.automationRunId,
          correlationId: input.correlationId,
          ...(message.payload ? { outboundPayload: message.payload } : {}),
        };

        const persisted = await waPerfMeasure("Supabase query: add outgoing message", () =>
          conversation.addOutgoingMessage({
            conversationId: input.conversationId,
            content: text || " ",
            metadata,
          }),
        );

        outboundMessageIds.push(persisted.id);

        console.log("[WHATSAPP_OUTBOUND_TRACE] workflow reply persisted; dispatching provider send", {
          companyId: input.companyId,
          companyChannelId: input.companyChannelId,
          channelKey: input.channelKey,
          conversationId: input.conversationId,
          outboundMessageId: persisted.id,
          automationRunId: input.automationRunId,
          externalThreadId: input.externalThreadId,
          textPreview: text.slice(0, 160),
          hasStructuredPayload: Boolean(message.payload),
        });

        const outbound = await dispatcher.dispatch(ctx, {
          companyId: input.companyId,
          companyChannelId: input.companyChannelId,
          channelKey: input.channelKey,
          conversationId: input.conversationId,
          channelSessionId: input.channelSessionId,
          externalThreadId: input.externalThreadId,
          text: text || " ",
          attachments: message.attachments,
          outboundPayload: message.payload,
          outboundMessageId: persisted.id,
          metadata,
          persistConversationMessage: false,
        });

        deliveryEventIds.push(outbound.deliveryEventId);
      }

      const responseContent =
        input.messages.length > 0 ? input.messages[input.messages.length - 1]?.text?.trim() : undefined;

      return {
        deliveryEventIds,
        outboundMessageIds,
        lastDeliveryEventId: deliveryEventIds[deliveryEventIds.length - 1],
        responseContent: responseContent || undefined,
      };
    },
    { messageCount: input.messages.length, automationRunId: input.automationRunId },
  );
}
