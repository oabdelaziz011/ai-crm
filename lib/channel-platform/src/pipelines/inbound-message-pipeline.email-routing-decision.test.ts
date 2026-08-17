import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmailCloudAdapter } from "../adapters/email/email-cloud-adapter.js";
import type {
  EmailRoutingClassificationInput,
  EmailRoutingClassifierPort,
  EmailRoutingDecisionRuntime,
  EmailRoutingEnginePort,
} from "../ports/email-routing-classifier-port.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

function mockClassifier(
  category: EmailRoutingClassificationInput extends never ? never : string,
  confidence = 0.9,
): {
  classifier: EmailRoutingClassifierPort;
  calls: EmailRoutingClassificationInput[];
} {
  const calls: EmailRoutingClassificationInput[] = [];
  return {
    calls,
    classifier: {
      async classify(input) {
        calls.push(input);
        return {
          category: category as EmailRoutingDecisionRuntime["category"],
          confidence,
          reason: `classified ${category}`,
          source: "llm",
          classifiedTextPreview: "preview",
        };
      },
    },
  };
}

function mockEngine(
  handler?: EmailRoutingEnginePort["route"],
): {
  engine: EmailRoutingEnginePort;
  calls: Array<Parameters<EmailRoutingEnginePort["route"]>[0]>;
} {
  const calls: Array<Parameters<EmailRoutingEnginePort["route"]>[0]> = [];
  return {
    calls,
    engine: {
      async route(input) {
        calls.push(input);
        if (handler) return handler(input);
        return {
          targetType: "unresolved",
          targetId: null,
          category: input.classification.category,
          confidence: input.classification.confidence,
          reason: `Mapped to ${input.classification.category}`,
          source: "classification",
          configurationRequired: true,
        };
      },
    },
  };
}

describe("InboundMessagePipeline email routing decision (Sprint 4)", () => {
  it("produces Sales routing decision from sales classification", async () => {
    const { classifier } = mockClassifier("sales");
    const { engine, calls } = mockEngine();
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
      emailRoutingEngine: engine,
    });

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-sales",
      payload: {
        kind: "email.inbound",
        messageId: "msg-sales",
        resolvedExternalThreadId: "thread-sales",
        senderExternalId: "buyer@example.com",
        subject: "Demo",
        textPlain: "Need pricing",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.classification.category, "sales");
    assert.equal(response.emailRoutingDecision?.category, "sales");
    assert.equal(response.emailRoutingDecision?.source, "classification");
    assert.equal(response.emailRoutingDecision?.targetType, "unresolved");
    assert.equal(
      env.conversationMetadataById.get(response.conversationId)?.emailRoutingDecision,
      response.emailRoutingDecision,
    );
  });

  it("produces Support / Billing / Complaint / HR / General routing decisions", async () => {
    for (const category of ["support", "billing", "complaint", "hr", "general_inquiry"] as const) {
      const { classifier } = mockClassifier(category);
      const { engine } = mockEngine();
      const env = createTestEnvironment({
        companyChannel: { channelKey: "email", provider: "email" },
        adapters: [createEmailCloudAdapter()],
        emailRoutingClassifier: classifier,
        emailRoutingEngine: engine,
      });

      const response = await env.router.routeInbound(createContext(), {
        companyId: "company-1",
        companyChannelId: env.companyChannel.id,
        channelKey: "email",
        source: "webhook",
        externalThreadId: `thread-${category}`,
        payload: {
          kind: "email.inbound",
          messageId: `msg-${category}`,
          resolvedExternalThreadId: `thread-${category}`,
          senderExternalId: "user@example.com",
          subject: category,
          textPlain: `Body for ${category}`,
        },
        executeAi: false,
        aiAssistantId: "assistant-1",
      });

      assert.equal(response.emailRoutingDecision?.category, category);
      assert.equal(response.emailRoutingDecision?.targetId, null);
    }
  });

  it("consumes classification and does not invoke an LLM in the engine", async () => {
    let llmCalls = 0;
    const { classifier } = mockClassifier("billing");
    const { engine, calls } = mockEngine(async (input) => {
      // Engine path must stay deterministic — no provider/LLM hook here.
      assert.equal(llmCalls, 0);
      return {
        targetType: "unresolved",
        targetId: null,
        category: input.classification.category,
        confidence: input.classification.confidence,
        reason: "ok",
        source: "classification",
        configurationRequired: true,
      };
    });

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
      emailRoutingEngine: engine,
    });

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-no-llm",
      payload: {
        kind: "email.inbound",
        messageId: "msg-no-llm",
        resolvedExternalThreadId: "thread-no-llm",
        senderExternalId: "user@example.com",
        subject: "Invoice",
        textPlain: "Double charged",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.classification.category, "billing");
    assert.equal(llmCalls, 0);
  });

  it("does not invoke Email Routing Engine for non-email channels", async () => {
    const { classifier } = mockClassifier("sales");
    const { engine, calls } = mockEngine();
    const env = createTestEnvironment({
      emailRoutingClassifier: classifier,
      emailRoutingEngine: engine,
    });

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

    assert.equal(calls.length, 0);
  });

  it("does not break inbound processing when routing engine throws", async () => {
    const { classifier } = mockClassifier("support");
    const { engine } = mockEngine(async () => {
      throw new Error("routing exploded");
    });
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
      emailRoutingEngine: engine,
    });

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-route-fail",
      payload: {
        kind: "email.inbound",
        messageId: "msg-route-fail",
        resolvedExternalThreadId: "thread-route-fail",
        senderExternalId: "user@example.com",
        subject: "Help",
        textPlain: "Need support",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.ok(response.inboundEventId);
    assert.equal(response.emailRoutingClassification?.category, "support");
    assert.equal(response.emailRoutingDecision?.category, "general_inquiry");
    assert.equal(response.emailRoutingDecision?.targetType, "unresolved");
    assert.match(response.emailRoutingDecision?.reason ?? "", /failed/i);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("retains routing decision on incoming message metadata", async () => {
    const { classifier } = mockClassifier("hr");
    const { engine } = mockEngine();
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
      emailRoutingEngine: engine,
    });

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-hr-meta",
      payload: {
        kind: "email.inbound",
        messageId: "msg-hr-meta",
        resolvedExternalThreadId: "thread-hr-meta",
        senderExternalId: "applicant@example.com",
        subject: "Resume",
        textPlain: "Applying for a role",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    const meta = env.incomingMessageMetadata[0];
    assert.ok(meta);
    assert.equal((meta.emailRoutingDecision as { category: string }).category, "hr");
  });

  it("leaves generic AI intent behavior unchanged for non-email", async () => {
    const { classifier } = mockClassifier("sales");
    const { engine, calls } = mockEngine();
    const env = createTestEnvironment({
      runtimeResponse: "AI reply",
      emailRoutingClassifier: classifier,
      emailRoutingEngine: engine,
    });

    const response = await env.router.routeInbound(createContext(), {
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

    assert.equal(calls.length, 0);
    assert.equal(response.responseContent, "AI reply");
    assert.equal(response.emailRoutingDecision, undefined);
    assert.equal(env.runtimeCalls, 1);
  });
});
