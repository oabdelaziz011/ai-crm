import type { ChannelRouter } from "@workspace/channel-platform";
import type { HandoffServicePort } from "@workspace/automation-platform";
import type { PublicWebChatInboundPort } from "./public-web-chat-service.js";

type SystemContext = {
  userId: null;
  companyId: null;
  isSuperAdmin: true;
  hasPermission: (code: string) => boolean;
};

/**
 * Visitor messages enter the existing Channel Platform (ChannelRouter.routeInbound →
 * InboundMessagePipeline) with trusted server-side ids only. The conversation and
 * channel_session are pre-provisioned by web_chat_public_ensure_conversation, so the
 * session engine binds to them instead of creating a new conversation.
 */
export function createPublicWebChatInboundPort(deps: {
  router: Pick<ChannelRouter, "routeInbound">;
  systemContext: SystemContext;
  automationGate?: {
    evaluate(input: { companyId: string; conversationId: string }): Promise<{ allowAutomatedReply: boolean }>;
  } | null;
  handoffService: Pick<HandoffServicePort, "requestCustomerHandoff">;
}): PublicWebChatInboundPort {
  return {
    async routeVisitorMessage(input) {
      const response = await deps.router.routeInbound(deps.systemContext, {
        companyId: input.companyId,
        companyChannelId: input.companyChannelId,
        channelKey: "web_chat",
        source: "direct",
        idempotencyKey: input.externalMessageId,
        externalThreadId: input.externalThreadId,
        externalMessageId: input.externalMessageId,
        senderExternalId: input.externalThreadId,
        conversationId: input.conversationId,
        payload: {
          text: input.text,
          externalThreadId: input.externalThreadId,
          externalMessageId: input.externalMessageId,
          senderExternalId: input.externalThreadId,
          metadata: {
            publicWebChat: true,
            ...(input.locale ? { locale: input.locale } : {}),
          },
        },
        executeAi: input.executeAi,
        ...(input.executeAi && input.aiEmployeeId ? { aiEmployeeId: input.aiEmployeeId } : {}),
        requestId: input.requestId,
      });

      return {
        incomingMessageId: response.incomingMessageId || null,
        responseContent: typeof response.responseContent === "string" ? response.responseContent : null,
        duplicate: response.duplicate === true,
      };
    },

    async isHumanOwned(input) {
      if (!deps.automationGate) return false;
      const decision = await deps.automationGate.evaluate(input);
      return !decision.allowAutomatedReply;
    },

    async requestHandoff(input) {
      await deps.handoffService.requestCustomerHandoff({
        companyId: input.companyId,
        conversationId: input.conversationId,
        triggerCode: "repeated_failures",
        reason: input.reason,
      });
    },
  };
}
