import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmailCloudAdapter } from "../adapters/email/email-cloud-adapter.js";
import type { AiEmailRoutingCommercialPort } from "../ports/ai-email-routing-commercial-port.js";
import type {
  EmailRoutingClassifierPort,
  EmailRoutingDecisionRuntime,
  EmailRoutingEnginePort,
} from "../ports/email-routing-classifier-port.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

function mockClassifier(): EmailRoutingClassifierPort & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async classify() {
      state.calls += 1;
      return {
        category: "sales",
        confidence: 0.9,
        reason: "ok",
        source: "llm",
        classifiedTextPreview: "preview",
      };
    },
  };
}

function mockEngine(): EmailRoutingEnginePort {
  return {
    async route(input) {
      return {
        targetType: "unresolved",
        targetId: null,
        category: input.classification.category,
        confidence: input.classification.confidence,
        reason: "awaiting configuration",
        source: "classification",
        configurationRequired: true,
      } satisfies EmailRoutingDecisionRuntime;
    },
  };
}

describe("InboundMessagePipeline AI Email Routing commercial gate (Sprint 6)", () => {
  it("executes AI Email Routing when entitled and meters usage once", async () => {
    const classifier = mockClassifier();
    const usageKeys: string[] = [];
    const commercial: AiEmailRoutingCommercialPort = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage(input) {
        usageKeys.push(`${input.companyId}:${input.inboundEventId}`);
        return { recorded: true };
      },
    };

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
      emailRoutingEngine: mockEngine(),
    });
    env.ports.aiEmailRoutingCommercial = commercial;

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-entitled",
      payload: {
        kind: "email.inbound",
        messageId: "msg-entitled",
        resolvedExternalThreadId: "thread-entitled",
        senderExternalId: "a@example.com",
        subject: "Demo",
        textPlain: "Pricing",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(classifier.calls, 1);
    assert.equal(response.emailRoutingClassification?.category, "sales");
    assert.equal(usageKeys.length, 1);
    assert.equal(usageKeys[0], `company-1:${response.inboundEventId}`);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("skips AI Email Routing when not entitled without blocking email ingestion", async () => {
    const classifier = mockClassifier();
    let usageCalls = 0;
    const commercial: AiEmailRoutingCommercialPort = {
      async checkAccess() {
        return { allowed: false, reason: "not_entitled" };
      },
      async recordUsage() {
        usageCalls += 1;
        return { recorded: true };
      },
    };

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
      emailRoutingEngine: mockEngine(),
    });
    env.ports.aiEmailRoutingCommercial = commercial;

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-denied",
      payload: {
        kind: "email.inbound",
        messageId: "msg-denied",
        resolvedExternalThreadId: "thread-denied",
        senderExternalId: "a@example.com",
        subject: "Demo",
        textPlain: "Pricing",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(classifier.calls, 0);
    assert.equal(usageCalls, 0);
    assert.equal(response.emailRoutingClassification, undefined);
    assert.equal(response.emailRoutingDecision, undefined);
    assert.ok(response.inboundEventId);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    assert.ok(response.conversationId);
  });

  it("fails closed on entitlement errors and does not meter", async () => {
    const classifier = mockClassifier();
    let usageCalls = 0;
    const commercial: AiEmailRoutingCommercialPort = {
      async checkAccess() {
        return { allowed: false, reason: "entitlement_error" };
      },
      async recordUsage() {
        usageCalls += 1;
        return { recorded: true };
      },
    };

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
      emailRoutingEngine: mockEngine(),
    });
    env.ports.aiEmailRoutingCommercial = commercial;

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-error",
      payload: {
        kind: "email.inbound",
        messageId: "msg-error",
        resolvedExternalThreadId: "thread-error",
        senderExternalId: "a@example.com",
        subject: "Hi",
        textPlain: "Hello",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(classifier.calls, 0);
    assert.equal(usageCalls, 0);
  });

  it("fails closed on quota exceeded without breaking email ingestion", async () => {
    const classifier = mockClassifier();
    const commercial: AiEmailRoutingCommercialPort = {
      async checkAccess() {
        return { allowed: false, reason: "quota_exceeded" };
      },
      async recordUsage() {
        return { recorded: true };
      },
    };

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
      emailRoutingEngine: mockEngine(),
    });
    env.ports.aiEmailRoutingCommercial = commercial;

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-quota",
      payload: {
        kind: "email.inbound",
        messageId: "msg-quota",
        resolvedExternalThreadId: "thread-quota",
        senderExternalId: "a@example.com",
        subject: "Hi",
        textPlain: "Hello",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(classifier.calls, 0);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    assert.ok(response.conversationId);
  });

  it("does not meter non-email channels", async () => {
    let usageCalls = 0;
    let accessCalls = 0;
    const commercial: AiEmailRoutingCommercialPort = {
      async checkAccess() {
        accessCalls += 1;
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        usageCalls += 1;
        return { recorded: true };
      },
    };

    const env = createTestEnvironment({
      emailRoutingClassifier: mockClassifier(),
      emailRoutingEngine: mockEngine(),
    });
    env.ports.aiEmailRoutingCommercial = commercial;

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "direct",
      externalThreadId: "thread-web",
      payload: { text: "Hello" },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(accessCalls, 0);
    assert.equal(usageCalls, 0);
  });

  it("attributes usage only to the request companyId", async () => {
    const seen: string[] = [];
    const commercial: AiEmailRoutingCommercialPort = {
      async checkAccess(input) {
        seen.push(`access:${input.companyId}`);
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage(input) {
        seen.push(`usage:${input.companyId}`);
        return { recorded: true };
      },
    };

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: mockClassifier(),
      emailRoutingEngine: mockEngine(),
    });
    env.ports.aiEmailRoutingCommercial = commercial;

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-tenant",
      payload: {
        kind: "email.inbound",
        messageId: "msg-tenant",
        resolvedExternalThreadId: "thread-tenant",
        senderExternalId: "a@example.com",
        subject: "Hi",
        textPlain: "Hello",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.deepEqual(seen, ["access:company-1", "usage:company-1"]);
  });

  it("does not double-count when usage port is idempotent across duplicate inbound ids", async () => {
    const keys = new Set<string>();
    let recordAttempts = 0;
    const commercial: AiEmailRoutingCommercialPort = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage(input) {
        recordAttempts += 1;
        const key = `${input.companyId}:${input.inboundEventId}`;
        if (keys.has(key)) return { recorded: false, reason: "duplicate" };
        keys.add(key);
        return { recorded: true };
      },
    };

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: mockClassifier(),
      emailRoutingEngine: mockEngine(),
    });
    env.ports.aiEmailRoutingCommercial = commercial;

    const first = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      idempotencyKey: "idem-1",
      externalThreadId: "thread-idem",
      payload: {
        kind: "email.inbound",
        messageId: "msg-idem",
        resolvedExternalThreadId: "thread-idem",
        senderExternalId: "a@example.com",
        subject: "Hi",
        textPlain: "Hello",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    const second = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      idempotencyKey: "idem-1",
      externalThreadId: "thread-idem",
      payload: {
        kind: "email.inbound",
        messageId: "msg-idem",
        resolvedExternalThreadId: "thread-idem",
        senderExternalId: "a@example.com",
        subject: "Hi",
        textPlain: "Hello",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(second.duplicate, true);
    assert.equal(keys.size, 1);
    assert.equal(recordAttempts, 1);
    assert.equal(first.inboundEventId, second.inboundEventId);
  });
});
