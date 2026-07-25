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

  it("requires aiAssistantId when executeAi is true and no workflow binding exists", async () => {
    const env = createTestEnvironment({ runtimeResponse: "AI reply" });
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
      /aiAssistantId is required when executeAi is true/,
    );
  });
});
