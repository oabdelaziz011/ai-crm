import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStubWebChatAdapter } from "../adapters/stub-web-chat-adapter.js";
import { PermissionDeniedError } from "../errors.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

describe("ChannelRouter", () => {
  it("routes inbound direct events through session, runtime, and outbound delivery", async () => {
    const env = createTestEnvironment({ runtimeResponse: "Assistant reply" });
    const ctx = createContext();

    const response = await env.router.routeInbound(ctx, {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "direct",
      externalThreadId: "thread-1",
      payload: { text: "Hello channel platform" },
      executeAi: true,
      aiAssistantId: "assistant-1",
      runtimeConfig: { providerConnectionId: "provider-1" },
    });

    assert.equal(response.responseContent, "Assistant reply");
    assert.ok(response.inboundEventId);
    assert.ok(response.conversationId);
    assert.ok(response.channelSessionId);
    assert.equal(response.runtimeExecutionId, "runtime-exec-1");
    assert.ok(response.outboundDeliveryId);

    assert.equal(env.inboundEvents.length, 1);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    assert.equal(env.deliveryEvents.length, 1);
    assert.equal(env.deliveryEvents[0]?.delivery_status, "sent");
    assert.equal(env.incomingMessages.length, 0);
    assert.equal(env.outgoingMessages.length, 0);
    assert.equal(env.telemetryEvents.length, 2);
  });

  it("returns duplicate response for idempotent inbound events", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const first = await env.router.routeInbound(ctx, {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "direct",
      idempotencyKey: "idem-1",
      externalThreadId: "thread-dup",
      payload: { text: "Once" },
      aiAssistantId: "assistant-1",
    });

    const second = await env.router.routeInbound(ctx, {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "direct",
      idempotencyKey: "idem-1",
      externalThreadId: "thread-dup",
      payload: { text: "Once again" },
      aiAssistantId: "assistant-1",
    });

    assert.equal(second.duplicate, true);
    assert.equal(second.inboundEventId, first.inboundEventId);
    assert.equal(env.inboundEvents.length, 1);
  });

  it("requires route permission", async () => {
    const env = createTestEnvironment();
    const ctx = createContext({ hasPermission: () => false });

    await assert.rejects(
      () =>
        env.router.routeInbound(ctx, {
          companyId: "company-1",
          companyChannelId: env.companyChannel.id,
          channelKey: "web_chat",
          source: "direct",
          externalThreadId: "thread-perm",
          payload: { text: "Denied" },
          aiAssistantId: "assistant-1",
        }),
      PermissionDeniedError,
    );
  });
});

describe("StubWebChatAdapter", () => {
  it("normalizes and formats web chat payloads", () => {
    const adapter = createStubWebChatAdapter();
    const ctx = {
      companyChannel: {
        id: "cc-1",
        companyId: "company-1",
        channelKey: "web_chat",
        displayName: "Web Chat",
        isEnabled: true,
        provider: "stub",
        configuration: {},
      },
    };

    const normalized = adapter.normalizeInbound(ctx, {
      text: "Hi",
      externalThreadId: "thread-1",
    });

    assert.equal(normalized.text, "Hi");
    assert.equal(normalized.externalThreadId, "thread-1");

    const formatted = adapter.formatOutbound(ctx, {
      conversationId: "conv-1",
      companyChannelId: "cc-1",
      channelKey: "web_chat",
      externalThreadId: "thread-1",
      text: "Reply",
    });

    assert.equal(formatted.text, "Reply");
  });
});
