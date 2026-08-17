/**
 * Sprint 8 — focused E2E matrix for AI Email Routing (production path).
 * Uses existing InboundMessagePipeline + EmailRoutingEngine + config resolver contract.
 * No parallel fake pipeline.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmailRoutingEngine,
  createLlmEmailRoutingClassifier,
  type EmailRoutingCategory,
  type EmailRoutingTargetResolver,
} from "../../../ai-intent-engine/src/email-routing/index.js";
import { createEmailCloudAdapter } from "../adapters/email/email-cloud-adapter.js";
import type { AiEmailRoutingCommercialPort } from "../ports/ai-email-routing-commercial-port.js";
import type { EmailRoutingTicketActionPort } from "../ports/email-routing-ticket-action-port.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

type ConfigRow = {
  category: EmailRoutingCategory;
  enabled: boolean;
  targetType: "department" | "employee" | "queue";
  targetId: string | null;
};

function configResolver(rows: ConfigRow[]): EmailRoutingTargetResolver {
  return {
    resolveTarget({ category }) {
      const row = rows.find((candidate) => candidate.category === category);
      if (!row || !row.enabled || !row.targetId?.trim()) return null;
      return { targetType: row.targetType, targetId: row.targetId.trim() };
    },
  };
}

function fixedClassifier(category: EmailRoutingCategory, confidence = 0.92) {
  return {
    async classify() {
      return {
        category,
        confidence,
        reason: `classified ${category}`,
        source: "llm" as const,
        classifiedTextPreview: "preview",
        subcategory: null,
      };
    },
  };
}

const CATEGORY_FIXTURES: Array<{
  category: EmailRoutingCategory;
  subject: string;
  body: string;
  targetType: "department" | "employee" | "queue";
  targetId: string;
}> = [
  {
    category: "sales",
    subject: "Enterprise demo",
    body: "Need pricing",
    targetType: "department",
    targetId: "dept-sales",
  },
  {
    category: "support",
    subject: "Cannot login",
    body: "Broken login",
    targetType: "employee",
    targetId: "emp-support",
  },
  {
    category: "billing",
    subject: "Invoice",
    body: "Double charged",
    targetType: "department",
    targetId: "dept-billing",
  },
  {
    category: "complaint",
    subject: "Complaint",
    body: "Unacceptable service",
    targetType: "queue",
    targetId: "queue-complaints",
  },
  {
    category: "hr",
    subject: "Resume",
    body: "Applying for role",
    targetType: "department",
    targetId: "dept-hr",
  },
  {
    category: "general_inquiry",
    subject: "Hello",
    body: "Just checking in",
    targetType: "department",
    targetId: "dept-general",
  },
];

describe("Sprint 8 AI Email Routing E2E matrix", () => {
  for (const fixture of CATEGORY_FIXTURES) {
    it(`${fixture.category}: classify → configured target → ticket action → usage`, async () => {
      const usageKeys: string[] = [];
      const ticketApplies: Array<{ targetType: string; targetId: string | null }> = [];

      const commercial: AiEmailRoutingCommercialPort = {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage(input) {
          usageKeys.push(`${input.companyId}:${input.inboundEventId}`);
          return { recorded: true };
        },
      };

      const tickets: EmailRoutingTicketActionPort = {
        async apply(input) {
          ticketApplies.push({
            targetType: input.decision.targetType,
            targetId: input.decision.targetId,
          });
          return {
            status: "created",
            reason: "ok",
            ticketId: `ticket-${fixture.category}`,
            ticketNumber: `T-${fixture.category}`,
            assignedUserId:
              input.decision.targetType === "employee" ? input.decision.targetId : null,
            targetType: input.decision.targetType,
            targetId: input.decision.targetId,
          };
        },
      };

      const env = createTestEnvironment({
        companyChannel: { channelKey: "email", provider: "email" },
        adapters: [createEmailCloudAdapter()],
        emailRoutingClassifier: fixedClassifier(fixture.category),
        emailRoutingEngine: createEmailRoutingEngine({
          targetResolver: configResolver([
            {
              category: fixture.category,
              enabled: true,
              targetType: fixture.targetType,
              targetId: fixture.targetId,
            },
          ]),
        }),
      });
      env.ports.aiEmailRoutingCommercial = commercial;
      env.ports.emailRoutingTickets = tickets;

      const response = await env.router.routeInbound(createContext(), {
        companyId: "company-1",
        companyChannelId: env.companyChannel.id,
        channelKey: "email",
        source: "webhook",
        externalThreadId: `thread-${fixture.category}`,
        payload: {
          kind: "email.inbound",
          messageId: `msg-${fixture.category}`,
          resolvedExternalThreadId: `thread-${fixture.category}`,
          senderExternalId: "user@example.com",
          subject: fixture.subject,
          textPlain: fixture.body,
        },
        executeAi: false,
        aiAssistantId: "assistant-1",
      });

      assert.equal(response.emailRoutingClassification?.category, fixture.category);
      assert.equal(response.emailRoutingDecision?.targetType, fixture.targetType);
      assert.equal(response.emailRoutingDecision?.targetId, fixture.targetId);
      assert.equal(response.emailRoutingDecision?.configurationRequired, false);
      assert.equal(response.emailRoutingTicket?.status, "created");
      assert.equal(ticketApplies.length, 1);
      assert.equal(ticketApplies[0]?.targetType, fixture.targetType);
      assert.equal(ticketApplies[0]?.targetId, fixture.targetId);
      assert.equal(usageKeys.length, 1);
      assert.equal(usageKeys[0], `company-1:${response.inboundEventId}`);
      assert.equal(env.inboundEvents[0]?.processing_status, "processed");
      assert.equal(env.incomingMessages.length, 1);
    });
  }

  it("disabled category remains unresolved and skips ticket", async () => {
    let ticketCalls = 0;
    let lastStatus: string | null = null;
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: fixedClassifier("sales"),
      emailRoutingEngine: createEmailRoutingEngine({
        targetResolver: configResolver([
          {
            category: "sales",
            enabled: false,
            targetType: "department",
            targetId: "dept-sales",
          },
        ]),
      }),
    });
    env.ports.aiEmailRoutingCommercial = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        return { recorded: true };
      },
    };
    env.ports.emailRoutingTickets = {
      async apply(input) {
        ticketCalls += 1;
        // Real applyEmailRoutingTicketAction skips unresolved decisions.
        if (input.decision.configurationRequired || input.decision.targetType === "unresolved") {
          lastStatus = "skipped";
          return {
            status: "skipped",
            reason: "routing_unresolved",
            ticketId: null,
            assignedUserId: null,
          };
        }
        lastStatus = "created";
        return {
          status: "created",
          reason: "unexpected",
          ticketId: "should-not-create",
          assignedUserId: null,
          targetType: input.decision.targetType,
          targetId: input.decision.targetId,
        };
      },
    };

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-disabled",
      payload: {
        kind: "email.inbound",
        messageId: "msg-disabled",
        resolvedExternalThreadId: "thread-disabled",
        senderExternalId: "a@example.com",
        subject: "Sales",
        textPlain: "Pricing",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(response.emailRoutingDecision?.targetType, "unresolved");
    assert.equal(response.emailRoutingDecision?.configurationRequired, true);
    assert.equal(ticketCalls, 1);
    assert.equal(lastStatus, "skipped");
    assert.equal(response.emailRoutingTicket?.status, "skipped");
    assert.equal(response.emailRoutingTicket?.ticketId, null);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("empty/cleared target remains unresolved", async () => {
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: fixedClassifier("support"),
      emailRoutingEngine: createEmailRoutingEngine({
        targetResolver: configResolver([
          {
            category: "support",
            enabled: true,
            targetType: "employee",
            targetId: null,
          },
        ]),
      }),
    });
    env.ports.aiEmailRoutingCommercial = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        return { recorded: true };
      },
    };

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "imap",
      externalThreadId: "thread-empty-target",
      payload: {
        kind: "email.inbound",
        messageId: "msg-empty-target",
        resolvedExternalThreadId: "thread-empty-target",
        senderExternalId: "a@example.com",
        subject: "Help",
        textPlain: "Need help",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(response.emailRoutingDecision?.targetType, "unresolved");
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("unconfigured category remains unresolved", async () => {
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: fixedClassifier("billing"),
      emailRoutingEngine: createEmailRoutingEngine({
        targetResolver: configResolver([]),
      }),
    });
    env.ports.aiEmailRoutingCommercial = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        return { recorded: true };
      },
    };

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-unconfigured",
      payload: {
        kind: "email.inbound",
        messageId: "msg-unconfigured",
        resolvedExternalThreadId: "thread-unconfigured",
        senderExternalId: "a@example.com",
        subject: "Invoice",
        textPlain: "Question",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(response.emailRoutingDecision?.configurationRequired, true);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("entitlement denied skips AI routing but persists email", async () => {
    let classifyCalls = 0;
    let usageCalls = 0;
    let ticketCalls = 0;
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: {
        async classify() {
          classifyCalls += 1;
          return {
            category: "sales",
            confidence: 0.9,
            reason: "should not run",
            source: "llm",
            classifiedTextPreview: "x",
            subcategory: null,
          };
        },
      },
      emailRoutingEngine: createEmailRoutingEngine(),
    });
    env.ports.aiEmailRoutingCommercial = {
      async checkAccess() {
        return { allowed: false, reason: "not_entitled" };
      },
      async recordUsage() {
        usageCalls += 1;
        return { recorded: true };
      },
    };
    env.ports.emailRoutingTickets = {
      async apply() {
        ticketCalls += 1;
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

    assert.equal(classifyCalls, 0);
    assert.equal(usageCalls, 0);
    assert.equal(ticketCalls, 0);
    assert.equal(response.emailRoutingClassification, undefined);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    assert.equal(env.incomingMessages.length, 1);
  });

  it("quota exceeded skips AI routing only", async () => {
    let classifyCalls = 0;
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: {
        async classify() {
          classifyCalls += 1;
          return {
            category: "sales",
            confidence: 0.9,
            reason: "x",
            source: "llm",
            classifiedTextPreview: "x",
            subcategory: null,
          };
        },
      },
      emailRoutingEngine: createEmailRoutingEngine(),
    });
    env.ports.aiEmailRoutingCommercial = {
      async checkAccess() {
        return { allowed: false, reason: "quota_exceeded" };
      },
      async recordUsage() {
        return { recorded: false, reason: "skipped" };
      },
    };

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "imap",
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

    assert.equal(classifyCalls, 0);
    assert.equal(response.emailRoutingClassification, undefined);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("usage idempotency: duplicate inbound id does not double-count", async () => {
    const usageKeys: string[] = [];
    const seen = new Set<string>();
    const commercial: AiEmailRoutingCommercialPort = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage(input) {
        const key = `${input.companyId}:${input.inboundEventId}`;
        if (seen.has(key)) return { recorded: false, reason: "duplicate" };
        seen.add(key);
        usageKeys.push(key);
        return { recorded: true };
      },
    };

    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: fixedClassifier("sales"),
      emailRoutingEngine: createEmailRoutingEngine({
        targetResolver: configResolver([
          {
            category: "sales",
            enabled: true,
            targetType: "department",
            targetId: "dept-1",
          },
        ]),
      }),
    });
    env.ports.aiEmailRoutingCommercial = commercial;

    const request = {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email" as const,
      source: "webhook" as const,
      externalThreadId: "thread-idem",
      externalMessageId: "msg-idem-1",
      idempotencyKey: "email:msg-idem-1",
      payload: {
        kind: "email.inbound",
        messageId: "msg-idem-1",
        resolvedExternalThreadId: "thread-idem",
        senderExternalId: "a@example.com",
        subject: "Demo",
        textPlain: "Pricing",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    };

    const first = await env.router.routeInbound(createContext(), request);
    const second = await env.router.routeInbound(createContext(), request);

    assert.equal(first.inboundEventId, second.inboundEventId);
    assert.equal(usageKeys.length, 1);
    assert.equal(env.incomingMessages.length, 1);
  });

  it("duplicate conversation ticket is reused (no second ticket)", async () => {
    let createCalls = 0;
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: fixedClassifier("support"),
      emailRoutingEngine: createEmailRoutingEngine({
        targetResolver: configResolver([
          {
            category: "support",
            enabled: true,
            targetType: "employee",
            targetId: "emp-1",
          },
        ]),
      }),
    });
    env.ports.aiEmailRoutingCommercial = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        return { recorded: true };
      },
    };
    env.ports.emailRoutingTickets = {
      async apply() {
        createCalls += 1;
        if (createCalls === 1) {
          return {
            status: "created",
            reason: "created",
            ticketId: "ticket-shared",
            assignedUserId: "emp-1",
            targetType: "employee",
            targetId: "emp-1",
          };
        }
        return {
          status: "reused",
          reason: "Existing conversation ticket reused (idempotent)",
          ticketId: "ticket-shared",
          assignedUserId: "emp-1",
          targetType: "employee",
          targetId: "emp-1",
        };
      },
    };

    const base = {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email" as const,
      source: "webhook" as const,
      externalThreadId: "thread-ticket-reuse",
      executeAi: false,
      aiAssistantId: "assistant-1",
    };

    const first = await env.router.routeInbound(createContext(), {
      ...base,
      payload: {
        kind: "email.inbound",
        messageId: "msg-ticket-1",
        resolvedExternalThreadId: "thread-ticket-reuse",
        senderExternalId: "a@example.com",
        subject: "Help",
        textPlain: "Issue 1",
      },
    });
    const second = await env.router.routeInbound(createContext(), {
      ...base,
      payload: {
        kind: "email.inbound",
        messageId: "msg-ticket-2",
        resolvedExternalThreadId: "thread-ticket-reuse",
        senderExternalId: "a@example.com",
        subject: "Help again",
        textPlain: "Issue 2",
      },
    });

    assert.equal(first.emailRoutingTicket?.ticketId, "ticket-shared");
    assert.equal(second.emailRoutingTicket?.status, "reused");
    assert.equal(second.emailRoutingTicket?.ticketId, "ticket-shared");
    assert.equal(createCalls, 2);
  });

  it("employee assignment path vs department/queue metadata path", async () => {
    const outcomes: Array<{ assignedUserId: string | null; targetType: string }> = [];

    async function run(targetType: "employee" | "department" | "queue", targetId: string) {
      const env = createTestEnvironment({
        companyChannel: { channelKey: "email", provider: "email" },
        adapters: [createEmailCloudAdapter()],
        emailRoutingClassifier: fixedClassifier("sales"),
        emailRoutingEngine: createEmailRoutingEngine({
          targetResolver: configResolver([
            {
              category: "sales",
              enabled: true,
              targetType,
              targetId,
            },
          ]),
        }),
      });
      env.ports.aiEmailRoutingCommercial = {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          return { recorded: true };
        },
      };
      env.ports.emailRoutingTickets = {
        async apply(input) {
          const assignedUserId =
            input.decision.targetType === "employee" ? input.decision.targetId : null;
          outcomes.push({
            assignedUserId,
            targetType: input.decision.targetType,
          });
          return {
            status: "created",
            reason: "ok",
            ticketId: `t-${targetType}`,
            assignedUserId,
            targetType: input.decision.targetType,
            targetId: input.decision.targetId,
          };
        },
      };

      await env.router.routeInbound(createContext(), {
        companyId: "company-1",
        companyChannelId: env.companyChannel.id,
        channelKey: "email",
        source: "webhook",
        externalThreadId: `thread-${targetType}`,
        payload: {
          kind: "email.inbound",
          messageId: `msg-${targetType}`,
          resolvedExternalThreadId: `thread-${targetType}`,
          senderExternalId: "a@example.com",
          subject: "Sales",
          textPlain: "Pricing",
        },
        executeAi: false,
        aiAssistantId: "assistant-1",
      });
    }

    await run("employee", "emp-9");
    await run("department", "dept-9");
    await run("queue", "queue-9");

    assert.deepEqual(outcomes, [
      { assignedUserId: "emp-9", targetType: "employee" },
      { assignedUserId: null, targetType: "department" },
      { assignedUserId: null, targetType: "queue" },
    ]);
  });

  it("resolver failure does not break email ingestion", async () => {
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: fixedClassifier("sales"),
      emailRoutingEngine: {
        async route() {
          throw new Error("resolver boom");
        },
      },
    });
    env.ports.aiEmailRoutingCommercial = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        return { recorded: true };
      },
    };

    const response = await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-resolver-fail",
      payload: {
        kind: "email.inbound",
        messageId: "msg-resolver-fail",
        resolvedExternalThreadId: "thread-resolver-fail",
        senderExternalId: "a@example.com",
        subject: "Demo",
        textPlain: "Pricing",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    assert.equal(env.incomingMessages.length, 1);
    assert.ok(response.conversationId);
  });

  it("ticket action failure does not break email ingestion", async () => {
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: fixedClassifier("sales"),
      emailRoutingEngine: createEmailRoutingEngine({
        targetResolver: configResolver([
          {
            category: "sales",
            enabled: true,
            targetType: "department",
            targetId: "dept-1",
          },
        ]),
      }),
    });
    env.ports.aiEmailRoutingCommercial = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        return { recorded: true };
      },
    };
    env.ports.emailRoutingTickets = {
      async apply() {
        throw new Error("ticket boom");
      },
    };

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-ticket-fail",
      payload: {
        kind: "email.inbound",
        messageId: "msg-ticket-fail",
        resolvedExternalThreadId: "thread-ticket-fail",
        senderExternalId: "a@example.com",
        subject: "Demo",
        textPlain: "Pricing",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    assert.equal(env.incomingMessages.length, 1);
  });

  it("usage metering failure does not break email ingestion", async () => {
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [createEmailCloudAdapter()],
      emailRoutingClassifier: fixedClassifier("sales"),
      emailRoutingEngine: createEmailRoutingEngine({
        targetResolver: configResolver([
          {
            category: "sales",
            enabled: true,
            targetType: "department",
            targetId: "dept-1",
          },
        ]),
      }),
    });
    env.ports.aiEmailRoutingCommercial = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        throw new Error("usage boom");
      },
    };

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "email",
      source: "webhook",
      externalThreadId: "thread-usage-fail",
      payload: {
        kind: "email.inbound",
        messageId: "msg-usage-fail",
        resolvedExternalThreadId: "thread-usage-fail",
        senderExternalId: "a@example.com",
        subject: "Demo",
        textPlain: "Pricing",
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    assert.equal(env.incomingMessages.length, 1);
  });

  it("LLM malformed/provider failure stays safe (general_inquiry) without unsafe routing", async () => {
    const malformed = createLlmEmailRoutingClassifier({
      async chatCompletion() {
        return { text: "not-json" };
      },
    });
    const failed = createLlmEmailRoutingClassifier({
      async chatCompletion() {
        throw new Error("provider down");
      },
    });

    for (const classifier of [malformed, failed]) {
      const env = createTestEnvironment({
        companyChannel: { channelKey: "email", provider: "email" },
        adapters: [createEmailCloudAdapter()],
        emailRoutingClassifier: {
          async classify(input) {
            return classifier.classify(input);
          },
        },
        emailRoutingEngine: createEmailRoutingEngine({
          targetResolver: configResolver([
            {
              category: "general_inquiry",
              enabled: true,
              targetType: "department",
              targetId: "dept-general",
            },
          ]),
        }),
      });
      env.ports.aiEmailRoutingCommercial = {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          return { recorded: true };
        },
      };

      const response = await env.router.routeInbound(createContext(), {
        companyId: "company-1",
        companyChannelId: env.companyChannel.id,
        channelKey: "email",
        source: "webhook",
        externalThreadId: `thread-llm-${Math.random()}`,
        payload: {
          kind: "email.inbound",
          messageId: `msg-llm-${Math.random()}`,
          resolvedExternalThreadId: "thread-llm",
          senderExternalId: "a@example.com",
          subject: "Hi",
          textPlain: "Hello",
        },
        executeAi: false,
        aiAssistantId: "assistant-1",
      });

      assert.equal(response.emailRoutingClassification?.category, "general_inquiry");
      assert.equal(response.emailRoutingClassification?.source, "llm");
      assert.equal(env.inboundEvents.at(-1)?.processing_status, "processed");
    }
  });

  it("WhatsApp inbound regression: email routing ports are not invoked", async () => {
    let classifyCalls = 0;
    let commercialCalls = 0;
    const { createWhatsAppCloudAdapter } = await import(
      "../adapters/whatsapp/whatsapp-cloud-adapter.js"
    );
    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-wa-sprint8",
        companyId: "company-1",
        channelKey: "whatsapp",
        displayName: "WhatsApp",
        isEnabled: true,
        provider: "meta",
        configuration: {
          phoneNumberId: "123456789",
          accessToken: "test-token",
          verifyToken: "vault-verify-token",
        },
      },
      adapters: [createWhatsAppCloudAdapter()],
      emailRoutingClassifier: {
        async classify() {
          classifyCalls += 1;
          return {
            category: "sales",
            confidence: 0.9,
            reason: "x",
            source: "llm",
            classifiedTextPreview: "x",
            subcategory: null,
          };
        },
      },
      emailRoutingEngine: createEmailRoutingEngine(),
    });
    env.ports.aiEmailRoutingCommercial = {
      async checkAccess() {
        commercialCalls += 1;
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        return { recorded: true };
      },
    };

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-wa-sprint8",
      channelKey: "whatsapp",
      source: "webhook",
      externalThreadId: "201011404109",
      externalMessageId: "wamid.sprint8",
      senderExternalId: "201011404109",
      payload: {
        message: {
          from: "201011404109",
          id: "wamid.sprint8",
          timestamp: "1710000000",
          type: "text",
          text: { body: "Hello WhatsApp" },
        },
      },
      executeAi: false,
      aiAssistantId: "assistant-1",
    });

    assert.equal(classifyCalls, 0);
    assert.equal(commercialCalls, 0);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

});
