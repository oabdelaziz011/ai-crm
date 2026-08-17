import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmailCloudAdapter } from "../adapters/email/email-cloud-adapter.js";
import type {
  EmailRoutingClassificationInput,
  EmailRoutingClassifierPort,
  EmailRoutingDecisionRuntime,
  EmailRoutingEnginePort,
} from "../ports/email-routing-classifier-port.js";
import type { EmailRoutingTicketActionPort } from "../ports/email-routing-ticket-action-port.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

function mockClassifier(category = "sales"): EmailRoutingClassifierPort {
  return {
    async classify(_input: EmailRoutingClassificationInput) {
      return {
        category: category as EmailRoutingDecisionRuntime["category"],
        confidence: 0.92,
        reason: `classified ${category}`,
        source: "llm",
        classifiedTextPreview: "preview",
      };
    },
  };
}

function mockEngine(decision: EmailRoutingDecisionRuntime): EmailRoutingEnginePort {
  return {
    async route() {
      return decision;
    },
  };
}

describe("InboundMessagePipeline email routing tickets (Sprint 5)", () => {
  it("creates a ticket for resolvable team routing via the ticket action port", async () => {
    const applies: unknown[] = [];
    const tickets: EmailRoutingTicketActionPort = {
      async apply(input) {
        applies.push(input);
        assert.equal(input.companyId, "company-1");
        assert.equal(input.decision.targetType, "team");
        assert.equal(input.decision.targetId, "team-sales");
        assert.equal(input.classification.category, "sales");
        return {
          status: "created",
          reason: "created",
          ticketId: "ticket-1",
          ticketNumber: "T-1",
          assignedUserId: null,
          targetType: "team",
          targetId: "team-sales",
        };
      },
    };

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: mockClassifier("sales"),
      emailRoutingEngine: mockEngine({
        targetType: "team",
        targetId: "team-sales",
        category: "sales",
        confidence: 0.92,
        reason: "mapped",
        source: "classification",
        configurationRequired: false,
      }),
    });
    env.ports.emailRoutingTickets = tickets;

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-ticket-1",
      payload: {
        kind: "email.inbound",
        messageId: "msg-ticket-1",
        resolvedExternalThreadId: "thread-ticket-1",
        senderExternalId: "buyer@example.com",
        subject: "Enterprise demo",
        textPlain: "Need pricing",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(applies.length, 1);
    assert.equal(response.emailRoutingTicket?.status, "created");
    assert.equal(response.emailRoutingTicket?.ticketId, "ticket-1");
    assert.equal(
      env.conversationMetadataById.get(response.conversationId)?.emailRoutingTicket,
      response.emailRoutingTicket,
    );
  });

  it("assigns employee when decision targetType is employee", async () => {
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: mockClassifier("support"),
      emailRoutingEngine: mockEngine({
        targetType: "employee",
        targetId: "user-9",
        category: "support",
        confidence: 0.9,
        reason: "mapped",
        source: "classification",
        configurationRequired: false,
      }),
    });
    env.ports.emailRoutingTickets = {
      async apply(input) {
        assert.equal(input.decision.targetType, "employee");
        assert.equal(input.decision.targetId, "user-9");
        return {
          status: "created",
          reason: "assigned",
          ticketId: "ticket-2",
          ticketNumber: "T-2",
          assignedUserId: "user-9",
          targetType: "employee",
          targetId: "user-9",
        };
      },
    };

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-emp",
      payload: {
        kind: "email.inbound",
        messageId: "msg-emp",
        resolvedExternalThreadId: "thread-emp",
        senderExternalId: "user@example.com",
        subject: "Help",
        textPlain: "Broken login",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(response.emailRoutingTicket?.assignedUserId, "user-9");
  });

  it("does not create a falsely assigned ticket when routing is unresolved", async () => {
    let applyCalls = 0;
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: mockClassifier("billing"),
      emailRoutingEngine: mockEngine({
        targetType: "unresolved",
        targetId: null,
        category: "billing",
        confidence: 0.9,
        reason: "awaiting configuration",
        source: "classification",
        configurationRequired: true,
      }),
    });
    env.ports.emailRoutingTickets = {
      async apply(input) {
        applyCalls += 1;
        assert.equal(input.decision.configurationRequired, true);
        return {
          status: "skipped",
          reason: "routing_unresolved",
          ticketId: null,
          assignedUserId: null,
        };
      },
    };

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-unresolved",
      payload: {
        kind: "email.inbound",
        messageId: "msg-unresolved",
        resolvedExternalThreadId: "thread-unresolved",
        senderExternalId: "user@example.com",
        subject: "Invoice",
        textPlain: "Question about charge",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(applyCalls, 1);
    assert.equal(response.emailRoutingClassification?.category, "billing");
    assert.equal(response.emailRoutingDecision?.configurationRequired, true);
    assert.equal(response.emailRoutingTicket?.status, "skipped");
    assert.equal(response.emailRoutingTicket?.ticketId, null);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("does not lose inbound email when ticket apply throws", async () => {
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: mockClassifier("hr"),
      emailRoutingEngine: mockEngine({
        targetType: "team",
        targetId: "team-hr",
        category: "hr",
        confidence: 0.9,
        reason: "mapped",
        source: "classification",
        configurationRequired: false,
      }),
    });
    env.ports.emailRoutingTickets = {
      async apply() {
        throw new Error("ticket service down");
      },
    };

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-fail-ticket",
      payload: {
        kind: "email.inbound",
        messageId: "msg-fail-ticket",
        resolvedExternalThreadId: "thread-fail-ticket",
        senderExternalId: "hr@example.com",
        subject: "Resume",
        textPlain: "Applying",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.ok(response.inboundEventId);
    assert.equal(response.emailRoutingTicket?.status, "failed");
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("does not invoke ticket action for non-email channels", async () => {
    let applyCalls = 0;
    const env = createTestEnvironment({
      emailRoutingClassifier: mockClassifier(),
      emailRoutingEngine: mockEngine({
        targetType: "team",
        targetId: "team-1",
        category: "sales",
        confidence: 0.9,
        reason: "mapped",
        source: "classification",
        configurationRequired: false,
      }),
    });
    env.ports.emailRoutingTickets = {
      async apply() {
        applyCalls += 1;
        return {
          status: "created",
          reason: "should not run",
          ticketId: "x",
          assignedUserId: null,
        };
      },
    };

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

    assert.equal(applyCalls, 0);
  });
});
