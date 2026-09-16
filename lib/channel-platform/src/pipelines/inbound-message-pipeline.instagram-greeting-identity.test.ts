import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ChannelAdapterContext,
  ChannelAdapterPort,
  ChannelAdapterSendResult,
} from "../ports/channel-adapter-port.js";
import type {
  NormalizedInboundMessageDto,
  OutboundChannelMessageDto,
  WebhookEnvelopeDto,
} from "../dto/channel-dto.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

const IGSID = "17841405788211234";

class StubInstagramAdapter implements ChannelAdapterPort {
  readonly channelKey = "instagram";

  parseWebhook(_ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    return {
      eventType: "message.received",
      companyChannelId: "company-channel-ig-1",
      channelKey: this.channelKey,
      idempotencyKey: String(rawPayload.externalMessageId ?? "mid.in"),
      externalThreadId: String(rawPayload.externalThreadId ?? IGSID),
      payload: rawPayload,
    };
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    return {
      externalThreadId: String(payload.externalThreadId ?? IGSID),
      externalMessageId: String(payload.externalMessageId ?? "mid.in"),
      senderExternalId: String(payload.senderExternalId ?? IGSID),
      text: String(payload.text ?? ""),
      attachments: [],
      metadata: {},
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    return { to: message.externalThreadId, text: message.text };
  }

  async sendOutbound(
    _ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult> {
    return { externalMessageId: "mid.out-1", providerResponse: formattedPayload };
  }
}

describe("Instagram inbound greeting identity", () => {
  it("still starts the workflow when conversation customer lookup throws", async () => {
    let startedText: string | undefined;
    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-ig-1",
        companyId: "company-1",
        channelKey: "instagram",
        displayName: "Instagram",
        isEnabled: true,
        provider: "meta",
        configuration: { instagramBusinessAccountId: "17841400000000000" },
      },
      adapters: [new StubInstagramAdapter()],
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-ig-1",
        automationFlowId: "flow-ig-1",
      },
      automationPort: {
        async startWorkflow(input) {
          startedText = input.messageText;
          return {
            runId: "automation-run-ig-1",
            responseContent: "اهلا بيك يا فندم اقدر اساعدك ازاي ؟",
          };
        },
      },
    });

    env.ports.conversation.getConversationCustomerId = async () => {
      throw new Error("Conversation not found");
    };
    env.ports.customerIdentity = {
      async resolveTrustedCustomer() {
        return { status: "unknown", customerId: null, trustedCustomerName: null };
      },
      async getCustomerById() {
        throw new Error("should not be required after conversation lookup failure");
      },
    };

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-ig-1",
      channelKey: "instagram",
      source: "webhook",
      executeAi: true,
      externalThreadId: IGSID,
      payload: {
        text: "مرحبا",
        externalThreadId: IGSID,
        senderExternalId: IGSID,
        externalMessageId: "mid.greeting-1",
      },
    });

    assert.equal(startedText, "مرحبا");
    assert.equal(response.automationRunId, "automation-run-ig-1");
    assert.equal(response.responseContent, "اهلا بيك يا فندم اقدر اساعدك ازاي ؟");
    assert.equal(env.outgoingMessages.some((message) => message.content.includes("اهلا بيك")), true);
  });
});
