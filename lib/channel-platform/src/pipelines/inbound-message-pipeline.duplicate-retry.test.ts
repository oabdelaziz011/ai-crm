import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createContext, createTestEnvironment } from "../test-utils.js";

describe("InboundMessagePipeline duplicate webhook retry", () => {
  it("retries failed inbound events using stored incoming_message_id", async () => {
    const env = createTestEnvironment({
      runtimeResponse: "AI should not run",
      automationResponse: "Workflow list reply",
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-1",
        automationFlowId: "flow-1",
      },
    });

    const ctx = createContext();
    const request = {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "webhook" as const,
      idempotencyKey: "wamid.retry-1",
      externalThreadId: "thread-retry",
      externalMessageId: "wamid.retry-1",
      payload: { text: "Hello workflow" },
      executeAi: true,
      aiAssistantId: "assistant-1",
      runtimeConfig: { providerConnectionId: "provider-1" },
    };

    const first = await env.router.routeInbound(ctx, request);
    assert.equal(first.automationRunId, "automation-run-1");
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    assert.ok(env.inboundEvents[0]?.incoming_message_id);

    const failedEvent = env.inboundEvents[0]!;
    failedEvent.processing_status = "failed";
    failedEvent.error_message = "simulated webhook timeout before processed marker";
    failedEvent.processed_at = new Date().toISOString();

    const second = await env.router.routeInbound(ctx, request);
    assert.equal(second.automationRunId, "automation-run-1");
    assert.equal(env.automationCalls, 2);
    assert.equal(env.incomingMessages.length, 1);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("reuses inbound_event.incoming_message_id without inserting a duplicate row", async () => {
    const env = createTestEnvironment({
      automationResponse: "Workflow reply",
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-1",
        automationFlowId: "flow-1",
      },
    });

    env.inboundEvents.push({
      id: "inbound-existing",
      company_id: "company-1",
      company_channel_id: env.companyChannel.id,
      channel_key: "web_chat",
      idempotency_key: "wamid.existing",
      external_thread_id: "thread-existing",
      external_message_id: "wamid.existing",
      sender_external_id: null,
      processing_status: "failed",
      conversation_id: null,
      channel_session_id: null,
      incoming_message_id: "msg-existing",
      runtime_execution_id: null,
      payload: { text: "Hello" },
      error_message: "previous attempt failed after message persist",
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "webhook",
      idempotencyKey: "wamid.existing",
      externalThreadId: "thread-existing",
      externalMessageId: "wamid.existing",
      payload: { text: "Hello" },
    });

    assert.equal(response.incomingMessageId, "msg-existing");
    assert.equal(response.automationRunId, "automation-run-1");
    assert.equal(env.incomingMessages.length, 0);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("accepts idempotent addIncomingMessage responses marked as reused", async () => {
    const env = createTestEnvironment({
      automationResponse: "Workflow reply",
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-1",
        automationFlowId: "flow-1",
      },
    });

    const originalAddIncoming = env.ports.conversation.addIncomingMessage.bind(env.ports.conversation);
    env.ports.conversation.addIncomingMessage = async (input) => {
      const created = await originalAddIncoming(input);
      return {
        ...created,
        reused: input.externalMessageId === "wamid.reused",
      };
    };

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "webhook",
      idempotencyKey: "wamid.reused",
      externalThreadId: "thread-reused",
      externalMessageId: "wamid.reused",
      payload: { text: "Hello" },
    });

    assert.equal(response.automationRunId, "automation-run-1");
    assert.equal(env.incomingMessages.length, 1);
  });
});
