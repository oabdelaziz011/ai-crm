import type { ChannelConversationPort, ChannelDispatcherPort } from "../ports/channel-platform-ports.js";
import type { ServiceContext } from "../types.js";
import type { AutomationOutboundDispatchMessage } from "./extract-automation-outbound.js";

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

export async function dispatchAutomationOutboundMessages(
  ctx: ServiceContext,
  dispatcher: ChannelDispatcherPort,
  conversation: ChannelConversationPort,
  input: DispatchAutomationOutboundInput,
): Promise<DispatchAutomationOutboundResult> {
  const deliveryEventIds: string[] = [];
  const outboundMessageIds: string[] = [];

  for (const message of input.messages) {
    const text = message.text.trim();
    if (!text && !(message.attachments?.length ?? 0)) continue;

    const metadata = {
      automationRunId: input.automationRunId,
      correlationId: input.correlationId,
      ...(message.payload ? { outboundPayload: message.payload } : {}),
    };

    const persisted = await conversation.addOutgoingMessage({
      conversationId: input.conversationId,
      content: text || " ",
      metadata,
    });

    outboundMessageIds.push(persisted.id);

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

  const responseContent = input.messages.length > 0 ? input.messages[input.messages.length - 1]?.text?.trim() : undefined;

  return {
    deliveryEventIds,
    outboundMessageIds,
    lastDeliveryEventId: deliveryEventIds[deliveryEventIds.length - 1],
    responseContent: responseContent || undefined,
  };
}
