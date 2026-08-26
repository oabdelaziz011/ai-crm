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

  it("does not reprocess an in-flight inbound webhook retry", async () => {
    const env = createTestEnvironment({
      automationResponse: "Workflow reply",
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-1",
        automationFlowId: "flow-1",
      },
    });

    env.inboundEvents.push({
      id: "inbound-inflight",
      company_id: "company-1",
      company_channel_id: env.companyChannel.id,
      channel_key: "web_chat",
      idempotency_key: "wamid.inflight",
      external_thread_id: "thread-inflight",
      external_message_id: "wamid.inflight",
      sender_external_id: null,
      processing_status: "processing",
      conversation_id: "conv-inflight",
      channel_session_id: "session-inflight",
      incoming_message_id: null,
      runtime_execution_id: null,
      payload: { text: "Hello" },
      error_message: null,
      received_at: new Date().toISOString(),
      processed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "webhook",
      idempotencyKey: "wamid.inflight",
      externalThreadId: "thread-inflight",
      externalMessageId: "wamid.inflight",
      payload: { text: "Hello" },
    });

    assert.equal(response.duplicate, true);
    assert.equal(env.automationCalls, 0);
    assert.equal(env.outgoingMessages.length, 0);
  });
});

describe("InboundMessagePipeline inbound idempotency", () => {
  const workflowBinding = {
    companyId: "company-1",
    companyChannelId: "company-channel-1",
    automationFlowId: "flow-1",
  };

  function buildWorkflowRequest(
    env: ReturnType<typeof createTestEnvironment>,
    overrides: Record<string, unknown> = {},
  ) {
    return {
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
      ...overrides,
    };
  }

  it("creates exactly one incoming message and executes automation once for a new inbound", async () => {
    const env = createTestEnvironment({
      automationResponse: "Workflow reply",
      workflowBinding,
    });
    const ctx = createContext();
    const response = await env.router.routeInbound(ctx, buildWorkflowRequest(env));
    assert.equal(response.duplicate, undefined);
    assert.equal(env.incomingMessages.length, 1);
    assert.equal(env.automationCalls, 1);
    assert.equal(env.inboundEvents[0]?.incoming_message_id, env.incomingMessages[0]?.id);
    assert.equal(env.incomingMessageMetadata[0]?.correlationId, env.inboundEvents[0]?.id);
  });

  it("reuses the correlation-linked message on stale webhook retry without inserting a duplicate", async () => {
    const env = createTestEnvironment({
      automationResponse: "Workflow reply",
      workflowBinding,
    });
    const ctx = createContext();
    const request = buildWorkflowRequest(env, { payload: { text: "هاي" } });

    await env.router.routeInbound(ctx, request);
    assert.equal(env.incomingMessages.length, 1);

    const staleEvent = env.inboundEvents[0]!;
    staleEvent.processing_status = "processing";
    staleEvent.incoming_message_id = null;
    staleEvent.runtime_execution_id = null;
    staleEvent.processed_at = null;
    staleEvent.received_at = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    staleEvent.updated_at = staleEvent.received_at;

    await env.router.routeInbound(ctx, request);
    assert.equal(env.incomingMessages.length, 1);
    assert.equal(env.automationCalls, 2);
    assert.equal(env.inboundEvents[0]?.incoming_message_id, env.incomingMessages[0]?.id);
  });

  it("reuses the wamid-linked message on stale webhook retry without inserting a duplicate", async () => {
    const env = createTestEnvironment({
      automationResponse: "Workflow reply",
      workflowBinding,
    });
    const ctx = createContext();
    const request = buildWorkflowRequest(env, {
      idempotencyKey: "wamid.same-text-a",
      externalMessageId: "wamid.same-text-a",
      payload: { text: "هاي" },
    });

    await env.router.routeInbound(ctx, request);
    const staleEvent = env.inboundEvents[0]!;
    staleEvent.processing_status = "processing";
    staleEvent.incoming_message_id = null;
    staleEvent.runtime_execution_id = null;
    staleEvent.processed_at = null;
    staleEvent.received_at = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    staleEvent.updated_at = staleEvent.received_at;

    await env.router.routeInbound(ctx, request);
    assert.equal(env.incomingMessages.length, 1);
    assert.equal(env.automationCalls, 2);
  });

  it("processes two different wamids with identical text independently", async () => {
    const env = createTestEnvironment({
      automationResponse: "Workflow reply",
      workflowBinding,
    });
    const ctx = createContext();

    await env.router.routeInbound(
      ctx,
      buildWorkflowRequest(env, {
        idempotencyKey: "wamid.same-text-a",
        externalMessageId: "wamid.same-text-a",
        externalThreadId: "thread-a",
        payload: { text: "هاي" },
      }),
    );
    await env.router.routeInbound(
      ctx,
      buildWorkflowRequest(env, {
        idempotencyKey: "wamid.same-text-b",
        externalMessageId: "wamid.same-text-b",
        externalThreadId: "thread-b",
        payload: { text: "هاي" },
      }),
    );

    assert.equal(env.incomingMessages.length, 2);
    assert.equal(env.inboundEvents.length, 2);
    assert.equal(env.automationCalls, 2);
  });

  it("does not execute automation again when the inbound already has a runtime execution id", async () => {
    const env = createTestEnvironment({
      automationResponse: "Workflow reply",
      workflowBinding,
    });
    const ctx = createContext();
    const request = buildWorkflowRequest(env);

    await env.router.routeInbound(ctx, request);
    assert.equal(env.automationCalls, 1);

    const staleEvent = env.inboundEvents[0]!;
    staleEvent.processing_status = "processing";
    staleEvent.incoming_message_id = null;
    staleEvent.runtime_execution_id = "runtime-exec-existing";
    staleEvent.processed_at = null;
    staleEvent.received_at = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    staleEvent.updated_at = staleEvent.received_at;

    const retry = await env.router.routeInbound(ctx, request);
    assert.equal(retry.duplicate, true);
    assert.equal(env.incomingMessages.length, 1);
    assert.equal(env.automationCalls, 1);
  });

  it("retries automation when the incoming message persisted but runtime had not completed", async () => {
    const env = createTestEnvironment({
      automationResponse: "Workflow reply",
      workflowBinding,
    });
    const ctx = createContext();
    const request = buildWorkflowRequest(env);

    await env.router.routeInbound(ctx, request);
    const failedEvent = env.inboundEvents[0]!;
    failedEvent.processing_status = "failed";
    failedEvent.error_message = "simulated timeout before processed marker";
    failedEvent.processed_at = new Date().toISOString();
    failedEvent.runtime_execution_id = null;

    await env.router.routeInbound(ctx, request);
    assert.equal(env.incomingMessages.length, 1);
    assert.equal(env.automationCalls, 2);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("returns duplicate without re-executing automation when the inbound is already processed", async () => {
    const env = createTestEnvironment({
      automationResponse: "Workflow reply",
      workflowBinding,
    });
    const ctx = createContext();
    const request = buildWorkflowRequest(env);

    await env.router.routeInbound(ctx, request);
    const retry = await env.router.routeInbound(ctx, request);
    assert.equal(retry.duplicate, true);
    assert.equal(env.incomingMessages.length, 1);
    assert.equal(env.automationCalls, 1);
  });
});
