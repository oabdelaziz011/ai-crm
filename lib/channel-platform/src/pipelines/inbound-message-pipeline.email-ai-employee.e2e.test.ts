import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChannelAdapterPort } from "../ports/channel-adapter-port.js";
import type { AiEmployeeEmailCommercialPort } from "../ports/ai-employee-email-commercial-port.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

function emailAdapter(options?: {
  failOutbound?: boolean;
  outboundCalls?: Array<Record<string, unknown>>;
}): ChannelAdapterPort {
  const outboundCalls = options?.outboundCalls ?? [];
  return {
    channelKey: "email",
    normalizeInbound(_ctx, payload) {
      return {
        externalThreadId: String(payload.externalThreadId ?? "thread-1"),
        externalMessageId: String(payload.externalMessageId ?? payload.messageId ?? "msg-1"),
        senderExternalId: String(payload.fromEmail ?? "customer@example.com"),
        text: String(payload.textPlain ?? payload.text ?? ""),
        metadata: {
          subject: typeof payload.subject === "string" ? payload.subject : "Help",
          references: Array.isArray(payload.references) ? payload.references : [],
        },
        attachments: [],
      };
    },
    formatOutbound(_ctx, message) {
      return {
        text: message.text,
        metadata: message.metadata ?? {},
      };
    },
    async sendOutbound(_ctx, formatted) {
      if (options?.failOutbound) {
        throw new Error("SMTP send failed");
      }
      outboundCalls.push(formatted);
      return {
        externalMessageId: `out-${outboundCalls.length}`,
        providerResponse: { ok: true },
      };
    },
  };
}

function employeeRuntime(aiEmployeeId = "emp-1"): NonNullable<ChannelPlatformPorts["employeeRuntime"]> {
  return {
    async resolveForInboundChannel(input) {
      if (input.companyId !== "company-1") return null;
      return {
        aiEmployeeId,
        conversationMetadataSeed: { aiEmployeeId },
      };
    },
    async prepareForConversation(input) {
      if (input.companyId !== "company-1" || input.aiEmployeeId !== aiEmployeeId) return null;
      return {
        runtimeConfig: { providerConnectionId: "provider-1" },
        metadataPatch: { aiEmployeeId },
      };
    },
  };
}

function commercial(
  allowed: boolean,
  usage?: { recorded: string[] },
  reason: "entitled" | "not_entitled" | "quota_exceeded" = allowed ? "entitled" : "not_entitled",
): AiEmployeeEmailCommercialPort {
  return {
    async checkAccess() {
      return { allowed, reason };
    },
    async recordUsage(input) {
      usage?.recorded.push(input.inboundEventId);
      return { recorded: true };
    },
  };
}

async function routeEmail(
  env: ReturnType<typeof createTestEnvironment>,
  overrides?: { idempotencyKey?: string; executeAi?: boolean; text?: string },
) {
  return env.router.routeInbound(createContext(), {
    companyId: "company-1",
    companyChannelId: env.companyChannel.id,
    channelKey: "email",
    source: "webhook",
    externalThreadId: "thread-1",
    idempotencyKey: overrides?.idempotencyKey ?? "idem-1",
    payload: {
      kind: "email.inbound",
      messageId: "msg-1",
      fromEmail: "customer@example.com",
      subject: "Need help",
      textPlain: overrides?.text ?? "Please help with my order",
    },
    executeAi: overrides?.executeAi ?? true,
  });
}

describe("Email AI Employee E2E (Sprint 3)", () => {
  it("eligible employee generates reply and sends via Email outbound boundary", async () => {
    const outboundCalls: Array<Record<string, unknown>> = [];
    const usage = { recorded: [] as string[] };
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [emailAdapter({ outboundCalls })],
      employeeRuntime: employeeRuntime(),
      aiEmployeeEmailCommercial: commercial(true, usage),
      runtimeResponse: "Thanks — we received your email.",
    });

    const response = await routeEmail(env);
    assert.equal(response.duplicate, undefined);
    assert.equal(response.responseContent, "Thanks — we received your email.");
    assert.ok(response.outboundDeliveryId);
    assert.equal(env.runtimeCalls, 1);
    assert.equal(outboundCalls.length, 1);
    assert.equal(usage.recorded.length, 1);
    assert.ok(response.runtimeExecutionId);
  });

  it("no Email AI Employee → no AI reply / no outbound", async () => {
    const outboundCalls: Array<Record<string, unknown>> = [];
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [emailAdapter({ outboundCalls })],
      employeeRuntime: {
        async resolveForInboundChannel() {
          return null;
        },
        async prepareForConversation() {
          return null;
        },
      },
      aiEmployeeEmailCommercial: commercial(true),
      runtimeResponse: "should-not-send",
    });

    const response = await routeEmail(env);
    assert.equal(response.responseContent, undefined);
    assert.equal(response.outboundDeliveryId, undefined);
    assert.equal(env.runtimeCalls, 0);
    assert.equal(outboundCalls.length, 0);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("commercial entitlement denied → no AI execution", async () => {
    const outboundCalls: Array<Record<string, unknown>> = [];
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [emailAdapter({ outboundCalls })],
      employeeRuntime: employeeRuntime(),
      aiEmployeeEmailCommercial: commercial(false),
      runtimeResponse: "should-not-send",
    });

    const response = await routeEmail(env);
    assert.equal(response.responseContent, undefined);
    assert.equal(env.runtimeCalls, 0);
    assert.equal(outboundCalls.length, 0);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("9. quota exceeded → AI Employee email is NOT executed", async () => {
    const outboundCalls: Array<Record<string, unknown>> = [];
    const usage = { recorded: [] as string[] };
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [emailAdapter({ outboundCalls })],
      employeeRuntime: employeeRuntime(),
      aiEmployeeEmailCommercial: commercial(false, usage, "quota_exceeded"),
      runtimeResponse: "should-not-send",
    });

    const response = await routeEmail(env);
    assert.equal(response.responseContent, undefined);
    assert.equal(env.runtimeCalls, 0);
    assert.equal(outboundCalls.length, 0);
    assert.equal(usage.recorded.length, 0);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
  });

  it("executeAi disabled → no AI reply", async () => {
    const outboundCalls: Array<Record<string, unknown>> = [];
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [emailAdapter({ outboundCalls })],
      employeeRuntime: employeeRuntime(),
      aiEmployeeEmailCommercial: commercial(true),
    });

    const response = await routeEmail(env, { executeAi: false });
    assert.equal(response.responseContent, undefined);
    assert.equal(env.runtimeCalls, 0);
    assert.equal(outboundCalls.length, 0);
  });

  it("LLM failure → inbound processed, no outbound reply", async () => {
    const outboundCalls: Array<Record<string, unknown>> = [];
    const usage = { recorded: [] as string[] };
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [emailAdapter({ outboundCalls })],
      employeeRuntime: employeeRuntime(),
      aiEmployeeEmailCommercial: commercial(true, usage),
      runtimeError: new Error("provider timeout"),
    });

    const response = await routeEmail(env);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    assert.equal(outboundCalls.length, 0);
    assert.equal(usage.recorded.length, 0);
    assert.ok(response.outboundError);
    assert.match(String(response.outboundError), /provider timeout/);
  });

  it("SMTP/provider failure → inbound processed", async () => {
    const usage = { recorded: [] as string[] };
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [emailAdapter({ failOutbound: true })],
      employeeRuntime: employeeRuntime(),
      aiEmployeeEmailCommercial: commercial(true, usage),
      runtimeResponse: "Reply body",
    });

    const response = await routeEmail(env);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    assert.equal(response.responseContent, "Reply body");
    assert.equal(usage.recorded.length, 0);
    assert.ok(response.outboundError);
    assert.match(String(response.outboundError), /SMTP/);
  });

  it("duplicate inbound event → no duplicate AI reply", async () => {
    const outboundCalls: Array<Record<string, unknown>> = [];
    const usage = { recorded: [] as string[] };
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [emailAdapter({ outboundCalls })],
      employeeRuntime: employeeRuntime(),
      aiEmployeeEmailCommercial: commercial(true, usage),
      runtimeResponse: "First reply",
    });

    const first = await routeEmail(env, { idempotencyKey: "dup-key" });
    const second = await routeEmail(env, { idempotencyKey: "dup-key" });

    assert.equal(first.duplicate, undefined);
    assert.equal(second.duplicate, true);
    assert.equal(env.runtimeCalls, 1);
    assert.equal(outboundCalls.length, 1);
    assert.equal(usage.recorded.length, 1);
  });

  it("cross-company isolation: employee resolve for other company is ignored", async () => {
    const outboundCalls: Array<Record<string, unknown>> = [];
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email", companyId: "company-1" },
      adapters: [emailAdapter({ outboundCalls })],
      employeeRuntime: {
        async resolveForInboundChannel(input) {
          // Only resolve for a different tenant — must not be used for company-1.
          if (input.companyId === "company-b") {
            return { aiEmployeeId: "emp-b", conversationMetadataSeed: {} };
          }
          return null;
        },
        async prepareForConversation() {
          return { runtimeConfig: { providerConnectionId: "provider-b" }, metadataPatch: null };
        },
      },
      aiEmployeeEmailCommercial: commercial(true),
    });

    const response = await routeEmail(env);
    assert.equal(env.runtimeCalls, 0);
    assert.equal(outboundCalls.length, 0);
    assert.equal(response.responseContent, undefined);
  });

  it("Email Routing commercial remains independent (routing still callable)", async () => {
    const routingChecks: string[] = [];
    const env = createTestEnvironment({
      companyChannel: { channelKey: "email", provider: "email" },
      adapters: [emailAdapter()],
      employeeRuntime: employeeRuntime(),
      aiEmployeeEmailCommercial: commercial(true),
      emailRoutingClassifier: {
        async classify() {
          return {
            category: "support",
            confidence: 0.8,
            reason: "help",
            source: "rules",
            classifiedTextPreview: "help",
          };
        },
      },
      aiEmailRoutingCommercial: {
        async checkAccess(input) {
          routingChecks.push(input.companyId);
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          return { recorded: true };
        },
      },
      runtimeResponse: "AI reply",
    });

    const response = await routeEmail(env);
    assert.equal(routingChecks[0], "company-1");
    assert.equal(response.emailRoutingClassification?.category, "support");
    assert.equal(response.responseContent, "AI reply");
  });
});
