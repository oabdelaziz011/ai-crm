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
import { ProviderAcceptanceUnconfirmedError, ValidationError } from "../errors.js";
import { planStuckWhatsAppReplyRecovery } from "../services/reconcile-stuck-whatsapp-replies.js";
import { recoverGeneratedReply } from "../services/recover-generated-reply.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

type FakeMode = "accept" | "reject" | "unknown";

class FakeWhatsAppProvider implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";
  sendCalls = 0;

  constructor(private readonly mode: FakeMode) {}

  parseWebhook(): WebhookEnvelopeDto {
    throw new Error("not used");
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    return {
      externalThreadId: String(payload.externalThreadId ?? "201000000001"),
      externalMessageId: String(payload.externalMessageId ?? "wamid.in"),
      senderExternalId: String(payload.senderExternalId ?? "201000000001"),
      text: String(payload.text ?? ""),
      attachments: [],
      metadata: {},
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    return { to: message.externalThreadId, text: message.text };
  }

  async sendOutbound(): Promise<ChannelAdapterSendResult> {
    this.sendCalls += 1;
    if (this.mode === "reject") {
      throw new ValidationError("fake provider rejected before accept", { metaErrorCode: 131026 });
    }
    if (this.mode === "unknown") {
      throw new Error("fake provider network timeout");
    }
    return { externalMessageId: "wamid.fake-accepted", providerResponse: { fake: true } };
  }
}

function inboundRequest(idempotencyKey: string) {
  return {
    companyId: "company-1",
    companyChannelId: "company-channel-1",
    channelKey: "whatsapp" as const,
    source: "webhook" as const,
    idempotencyKey,
    externalThreadId: "201000000001",
    externalMessageId: idempotencyKey,
    payload: {
      text: "hello",
      externalThreadId: "201000000001",
      externalMessageId: idempotencyKey,
      senderExternalId: "201000000001",
    },
    executeAi: true,
    aiAssistantId: "assistant-1",
    runtimeConfig: { providerConnectionId: "provider-1" },
  };
}

describe("WhatsApp fake provider delivery ambiguity", () => {
  it("keeps an accepted message pending when the sent update fails, and webhook redelivery does not send again", async () => {
    const adapter = new FakeWhatsAppProvider("accept");
    const confirms: Array<{ status: string; externalMessageId?: string | null }> = [];
    const env = createTestEnvironment({
      adapters: [adapter],
      companyChannel: { channelKey: "whatsapp", provider: "fake" },
      failSentDeliveryUpdate: true,
    });
    env.ports.conversation.confirmOutgoingDelivery = async (input) => {
      confirms.push({ status: input.status, externalMessageId: input.externalMessageId });
    };

    const first = await env.router.routeInbound(createContext(), inboundRequest("wamid.accept-then-save-fail"));
    const replay = await env.router.routeInbound(createContext(), inboundRequest("wamid.accept-then-save-fail"));
    const delivery = env.deliveryEvents[0];

    assert.equal(adapter.sendCalls, 1);
    assert.equal(first.duplicate, undefined);
    assert.equal(replay.duplicate, true);
    assert.equal(env.runtimeCalls, 1);
    assert.match(String(first.outboundError), /crash_before_sent_delivery_save/);
    assert.equal(delivery?.delivery_status, "pending");
    assert.equal(delivery?.external_message_id, "wamid.fake-accepted");
    assert.equal(confirms.some((row) => row.status === "failed"), false);

    let recoverySends = 0;
    const recovered = await recoverGeneratedReply(
      {
        replyText: "Echo: hello",
        outboundPhase: "preparing",
        deliveryStatus: delivery?.delivery_status,
        hasNewerInbound: false,
        messageId: "msg-out-accepted",
        externalMessageId: delivery?.external_message_id,
      },
      async () => {
        recoverySends += 0;
      },
    );
    assert.equal(recovered.action, "confirm_only");
    assert.equal(recoverySends, 0);
    assert.equal(adapter.sendCalls, 1);

    const planned = await planStuckWhatsAppReplyRecovery(
      [
        {
          messageId: "msg-out-accepted",
          replyText: "Echo: hello",
          outboundPhase: "preparing",
          deliveryStatus: delivery?.delivery_status,
          hasNewerInbound: false,
          externalMessageId: delivery?.external_message_id,
          recoveryAttempts: 0,
          recoveryDisposition: null,
          ageMs: 130_000,
        },
      ],
      async () => undefined,
    );
    assert.equal(planned[0]?.outcome.action, "confirm_only");
    assert.equal(adapter.sendCalls, 1);
  });

  it("marks failed only when the fake provider rejects before acceptance, and redelivery does not send again", async () => {
    const adapter = new FakeWhatsAppProvider("reject");
    const env = createTestEnvironment({
      adapters: [adapter],
      companyChannel: { channelKey: "whatsapp", provider: "fake" },
    });

    const first = await env.router.routeInbound(createContext(), inboundRequest("wamid.reject-before-accept"));
    const replay = await env.router.routeInbound(createContext(), inboundRequest("wamid.reject-before-accept"));

    assert.equal(adapter.sendCalls, 1);
    assert.equal(replay.duplicate, true);
    assert.equal(env.runtimeCalls, 1);
    assert.match(String(first.outboundError), /rejected before accept/);
    assert.equal(env.deliveryEvents[0]?.delivery_status, "failed");
    assert.equal(env.deliveryEvents[0]?.external_message_id ?? null, null);

    const recovered = await recoverGeneratedReply({
      replyText: "Echo: hello",
      outboundPhase: "preparing",
      deliveryStatus: "failed",
      hasNewerInbound: false,
      messageId: "msg-out-rejected",
      externalMessageId: null,
    });
    assert.deepEqual(recovered, { action: "skip", reason: "acceptance_unconfirmed" });
    assert.equal(adapter.sendCalls, 1);
  });

  it("leaves an unknown provider result pending and does not send it again from webhook or recovery", async () => {
    const adapter = new FakeWhatsAppProvider("unknown");
    const env = createTestEnvironment({
      adapters: [adapter],
      companyChannel: { channelKey: "whatsapp", provider: "fake" },
    });

    const first = await env.router.routeInbound(createContext(), inboundRequest("wamid.unknown-result"));
    await env.router.routeInbound(createContext(), inboundRequest("wamid.unknown-result"));

    assert.equal(adapter.sendCalls, 1);
    assert.ok(first.outboundError);
    assert.equal(env.deliveryEvents[0]?.delivery_status, "pending");
    assert.equal(env.deliveryEvents[0]?.external_message_id ?? null, null);
    assert.equal(env.deliveryEvents.filter((row) => row.delivery_status === "failed").length, 0);

    const recovered = await recoverGeneratedReply({
      replyText: "Echo: hello",
      outboundPhase: "preparing",
      deliveryStatus: "pending",
      hasNewerInbound: false,
      messageId: "msg-out-unknown",
      externalMessageId: null,
    });
    assert.deepEqual(recovered, { action: "skip", reason: "delivery_pending" });
    assert.equal(adapter.sendCalls, 1);
  });

  it("surfaces provider acceptance as a distinct pipeline error and does not mark the delivery failed", async () => {
    const adapter = new FakeWhatsAppProvider("accept");
    const confirms: string[] = [];
    const env = createTestEnvironment({
      adapters: [adapter],
      companyChannel: { channelKey: "whatsapp", provider: "fake" },
      failSentDeliveryUpdate: true,
    });
    env.ports.conversation.confirmOutgoingDelivery = async (input) => {
      confirms.push(input.status);
    };
    const session = await env.sessionRepository.createSession({
      companyId: "company-1",
      companyChannelId: "company-channel-1",
      channelKey: "whatsapp",
      externalThreadId: "201000000001",
      conversationId: "conv-direct",
    });

    await assert.rejects(
      () =>
        env.outboundPipeline.process(createContext(), {
          companyId: "company-1",
          companyChannelId: "company-channel-1",
          channelKey: "whatsapp",
          conversationId: "conv-direct",
          channelSessionId: session.id,
          externalThreadId: "201000000001",
          text: "hello",
          outboundMessageId: "msg-direct",
          persistConversationMessage: false,
        }),
      (error: unknown) => error instanceof ProviderAcceptanceUnconfirmedError,
    );
    assert.equal(adapter.sendCalls, 1);
    assert.equal(env.deliveryEvents[0]?.delivery_status, "pending");
    assert.equal(env.deliveryEvents[0]?.external_message_id, "wamid.fake-accepted");
    assert.deepEqual(confirms, []);
  });
});
