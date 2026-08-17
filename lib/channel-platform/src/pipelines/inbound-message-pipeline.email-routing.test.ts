import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmailCloudAdapter } from "../adapters/email/email-cloud-adapter.js";
import type {
  EmailRoutingClassificationInput,
  EmailRoutingClassifierPort,
} from "../ports/email-routing-classifier-port.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

function mockClassifier(
  handler: (
    input: EmailRoutingClassificationInput,
  ) => Promise<Awaited<ReturnType<EmailRoutingClassifierPort["classify"]>>> | Awaited<
    ReturnType<EmailRoutingClassifierPort["classify"]>
  >,
): { classifier: EmailRoutingClassifierPort; calls: EmailRoutingClassificationInput[] } {
  const calls: EmailRoutingClassificationInput[] = [];
  return {
    calls,
    classifier: {
      async classify(input) {
        calls.push(input);
        return handler(input);
      },
    },
  };
}

describe("InboundMessagePipeline email routing classification (Sprint 3)", () => {
  it("invokes Email Routing classifier for inbound email with subject, body, and companyId", async () => {
    const { classifier, calls } = mockClassifier(() => ({
      category: "sales",
      confidence: 0.9,
      reason: "demo request",
      source: "llm",
      classifiedTextPreview: "preview",
    }));

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
    });

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-email-1",
      externalMessageId: "msg-1",
      senderExternalId: "buyer@example.com",
      payload: {
        kind: "email.inbound",
        messageId: "msg-1",
        resolvedExternalThreadId: "thread-email-1",
        senderExternalId: "buyer@example.com",
        subject: "Enterprise demo request",
        textPlain: "We want pricing for your platform.",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.subject, "Enterprise demo request");
    assert.equal(calls[0]?.body, "We want pricing for your platform.");
    assert.equal(calls[0]?.companyId, "company-1");
    assert.equal(response.emailRoutingClassification?.category, "sales");
    assert.equal(response.emailRoutingClassification?.source, "llm");
    assert.equal(
      env.conversationMetadataById.get(response.conversationId)?.emailRoutingClassification,
      response.emailRoutingClassification,
    );
  });

  it("retains classification on incoming message metadata when message is persisted", async () => {
    const { classifier } = mockClassifier(() => ({
      category: "support",
      confidence: 0.85,
      reason: "login help",
      source: "llm",
      classifiedTextPreview: "preview",
    }));

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
    });

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-email-2",
      payload: {
        kind: "email.inbound",
        messageId: "msg-2",
        resolvedExternalThreadId: "thread-email-2",
        senderExternalId: "user@example.com",
        subject: "Cannot login",
        textPlain: "Need technical help with an error.",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    const meta = env.incomingMessageMetadata[0];
    assert.ok(meta);
    assert.equal((meta.emailRoutingClassification as { category: string }).category, "support");
  });

  it("does not invoke classifier for non-email channels", async () => {
    const { classifier, calls } = mockClassifier(() => ({
      category: "general_inquiry",
      confidence: 0.1,
      reason: "should not run",
      source: "llm",
      classifiedTextPreview: "",
    }));

    const env = createTestEnvironment({
      emailRoutingClassifier: classifier,
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

  it("does not invoke classifier for outbound email dispatch", async () => {
    const { classifier, calls } = mockClassifier(() => ({
      category: "billing",
      confidence: 0.9,
      reason: "should not run",
      source: "llm",
      classifiedTextPreview: "",
    }));

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
    });

    // Establish a session via inbound without classifier coupling to outbound.
    const inbound = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-out",
      payload: {
        kind: "email.inbound",
        messageId: "msg-in",
        resolvedExternalThreadId: "thread-out",
        senderExternalId: "user@example.com",
        subject: "Hi",
        textPlain: "Hello",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });
    const inboundCalls = calls.length;
    assert.ok(inboundCalls >= 1);

    try {
      await env.dispatcher.dispatch(createContext(), {
        companyId: "company-1",
        companyChannelId: env.companyChannel.id,
        channelKey: "email",
        conversationId: inbound.conversationId,
        channelSessionId: inbound.channelSessionId,
        externalThreadId: "thread-out",
        text: "Reply body",
        metadata: {
          recipientEmail: "user@example.com",
          emailSubject: "Re: Hi",
        },
      });
    } catch {
      // Outbound may fail without SMTP credentials; that is fine for this assertion.
    }

    assert.equal(calls.length, inboundCalls);
  });

  it("does not break inbound processing when classifier throws", async () => {
    const { classifier } = mockClassifier(async () => {
      throw new Error("provider down");
    });

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: classifier,
    });

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-fail",
      payload: {
        kind: "email.inbound",
        messageId: "msg-fail",
        resolvedExternalThreadId: "thread-fail",
        senderExternalId: "user@example.com",
        subject: "Help",
        textPlain: "Something broke",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.ok(response.inboundEventId);
    assert.equal(response.emailRoutingClassification?.category, "general_inquiry");
    assert.equal(response.emailRoutingClassification?.source, "llm");
    assert.match(response.emailRoutingClassification?.reason ?? "", /failed/i);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("leaves generic IntentClassifier / AI runtime path unchanged for non-email", async () => {
    const { classifier, calls } = mockClassifier(() => ({
      category: "sales",
      confidence: 1,
      reason: "unused",
      source: "llm",
      classifiedTextPreview: "",
    }));

    const env = createTestEnvironment({
      runtimeResponse: "AI reply",
      emailRoutingClassifier: classifier,
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
    assert.equal(response.runtimeExecutionId, "runtime-exec-1");
    assert.equal(response.emailRoutingClassification, undefined);
    assert.equal(env.runtimeCalls, 1);
  });
});
