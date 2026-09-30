import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createContext, createTestEnvironment } from "../test-utils.js";

describe("InboundMessagePipeline automation routing", () => {
  it("starts bound workflow instead of AI runtime when workflow is resolved", async () => {
    const env = createTestEnvironment({
      runtimeResponse: "AI should not run",
      automationResponse: "Workflow reply",
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-1",
        automationFlowId: "flow-1",
      },
    });
    const ctx = createContext();

    const response = await env.router.routeInbound(ctx, {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "direct",
      externalThreadId: "thread-workflow",
      payload: { text: "Hello workflow" },
      executeAi: true,
      aiAssistantId: "assistant-1",
      runtimeConfig: { providerConnectionId: "provider-1" },
    });

    assert.equal(response.responseContent, "Workflow reply");
    assert.equal(response.automationRunId, "automation-run-1");
    assert.equal(response.runtimeExecutionId, undefined);
    assert.ok(response.outboundDeliveryId);
    assert.equal(env.runtimeCalls, 0);
    assert.equal(env.automationCalls, 1);
    assert.equal(env.incomingMessages.length, 1);
    assert.equal(env.outgoingMessages.length, 1);
    assert.equal(env.outgoingMessages[0]?.content, "Workflow reply");
    assert.equal(env.deliveryEvents[0]?.outbound_message_id, env.outgoingMessages[0]?.id);
  });

  it("falls back to AI runtime when no workflow binding exists", async () => {
    const env = createTestEnvironment({ runtimeResponse: "AI reply" });
    const ctx = createContext();

    const response = await env.router.routeInbound(ctx, {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "direct",
      externalThreadId: "thread-ai",
      payload: { text: "Hello AI" },
      executeAi: true,
      aiAssistantId: "assistant-1",
      runtimeConfig: { providerConnectionId: "provider-1" },
    });

    assert.equal(response.responseContent, "AI reply");
    assert.equal(response.runtimeExecutionId, "runtime-exec-1");
    assert.equal(response.automationRunId, undefined);
    assert.equal(env.runtimeCalls, 1);
    assert.equal(env.automationCalls, 0);
  });

  it("falls back to AI runtime when binding is disabled", async () => {
    const env = createTestEnvironment({
      runtimeResponse: "AI fallback",
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-1",
        automationFlowId: "flow-1",
        enabled: false,
      },
    });
    const ctx = createContext();

    const response = await env.router.routeInbound(ctx, {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "direct",
      externalThreadId: "thread-disabled-binding",
      payload: { text: "Hello fallback" },
      executeAi: true,
      aiAssistantId: "assistant-1",
      runtimeConfig: { providerConnectionId: "provider-1" },
    });

    assert.equal(response.responseContent, "AI fallback");
    assert.equal(response.runtimeExecutionId, "runtime-exec-1");
    assert.equal(env.runtimeCalls, 1);
    assert.equal(env.automationCalls, 0);
  });

  it("falls back to AI runtime when bound workflow is invalid", async () => {
    const env = createTestEnvironment({
      runtimeResponse: "AI invalid-flow fallback",
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-1",
        automationFlowId: "flow-invalid",
        executable: false,
      },
    });
    const ctx = createContext();

    const response = await env.router.routeInbound(ctx, {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "direct",
      externalThreadId: "thread-invalid-flow",
      payload: { text: "Hello invalid flow" },
      executeAi: true,
      aiAssistantId: "assistant-1",
      runtimeConfig: { providerConnectionId: "provider-1" },
    });

    assert.equal(response.responseContent, "AI invalid-flow fallback");
    assert.equal(response.runtimeExecutionId, "runtime-exec-1");
    assert.equal(env.automationCalls, 0);
  });

  it("starts workflow without webhook aiAssistantId when workflow binding exists", async () => {
    const env = createTestEnvironment({
      runtimeResponse: "AI should not run",
      automationResponse: "Workflow reply without runtime assistant",
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-1",
        automationFlowId: "flow-1",
      },
    });
    const ctx = createContext();

    const response = await env.router.routeInbound(ctx, {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "webhook",
      externalThreadId: "thread-workflow-no-assistant",
      payload: { text: "Hello workflow without assistant" },
      executeAi: true,
    });

    assert.equal(response.responseContent, "Workflow reply without runtime assistant");
    assert.equal(response.automationRunId, "automation-run-1");
    assert.equal(response.runtimeExecutionId, undefined);
    assert.equal(env.runtimeCalls, 0);
    assert.equal(env.automationCalls, 1);
  });

  it("requires aiAssistantId or AI Employee when executeAi is true and no workflow binding exists", async () => {
    const env = createTestEnvironment({ runtimeResponse: "AI reply" });
    env.ports.conversation.resolveCompanyAssistantId = undefined;
    const ctx = createContext();

    await assert.rejects(
      () =>
        env.router.routeInbound(ctx, {
          companyId: "company-1",
          companyChannelId: env.companyChannel.id,
          channelKey: "web_chat",
          source: "direct",
          externalThreadId: "thread-ai-missing-assistant",
          payload: { text: "Hello AI" },
          executeAi: true,
          runtimeConfig: { providerConnectionId: "provider-1" },
        }),
      /published AI Employee or legacy assistant is required when executeAi is true/,
    );
  });

  it("persists WhatsApp inbound when executeAi is true but no AI Employee or assistant exists", async () => {
    class StubWhatsAppAdapter {
      readonly channelKey = "whatsapp";
      parseWebhook(_ctx: unknown, rawPayload: Record<string, unknown>) {
        return {
          eventType: "message.received" as const,
          companyChannelId: "company-channel-wa",
          channelKey: "whatsapp" as const,
          idempotencyKey: String(rawPayload.externalMessageId ?? "wamid.no-ai-1"),
          externalThreadId: String(rawPayload.externalThreadId ?? "15559990099"),
          payload: rawPayload,
        };
      }
      normalizeInbound(_ctx: unknown, payload: Record<string, unknown>) {
        return {
          externalThreadId: String(payload.externalThreadId ?? "15559990099"),
          externalMessageId: String(payload.externalMessageId ?? "wamid.no-ai-1"),
          senderExternalId: String(payload.senderExternalId ?? "15559990099"),
          text: String(payload.text ?? ""),
          attachments: [] as never[],
          metadata: {},
        };
      }
      formatOutbound() {
        return {};
      }
      async sendOutbound() {
        return { externalMessageId: "wamid.out" };
      }
    }

    const env = createTestEnvironment({
      runtimeResponse: "unused",
      companyChannel: {
        id: "company-channel-wa",
        channelKey: "whatsapp",
        displayName: "WhatsApp",
        provider: "meta_cloud",
      },
      adapters: [new StubWhatsAppAdapter() as never],
      whatsappMessagesCommercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" as const };
        },
        async recordUsage() {
          return { recorded: false };
        },
      },
    });
    // Company assistant exists for conversation FK, but no employee / provider runtime.
    env.ports.conversation.resolveCompanyAssistantId = async () => "assistant-company-default";
    const ctx = createContext();

    const response = await env.router.routeInbound(ctx, {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "whatsapp",
      source: "webhook",
      externalThreadId: "15559990099",
      externalMessageId: "wamid.no-ai-1",
      payload: {
        text: "Hello without AI",
        externalMessageId: "wamid.no-ai-1",
        senderExternalId: "15559990099",
        externalThreadId: "15559990099",
      },
      executeAi: true,
      // No runtimeConfig.providerConnectionId — must still persist inbound.
    });

    assert.ok(response.conversationId);
    assert.ok(response.incomingMessageId);
    assert.equal(response.runtimeExecutionId, undefined);
    assert.equal(env.runtimeCalls, 0);
    assert.equal(env.incomingMessages.length, 1);
  });
});
