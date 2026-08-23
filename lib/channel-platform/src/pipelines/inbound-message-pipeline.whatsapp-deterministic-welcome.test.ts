import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ChannelAdapterContext,
  ChannelAdapterPort,
  ChannelAdapterSendResult,
} from "../ports/channel-adapter-port.js";
import type {
  NormalizedInboundMessageDto,
  OutboundChannelMessageDto,
  WebhookEnvelopeDto,
} from "../dto/channel-dto.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { WhatsAppMessagesCommercialPort } from "../ports/whatsapp-messages-commercial-port.js";
import { readAiEmployeeEngagement } from "../services/ai-employee-engagement-session.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

const DEFAULT_WELCOME = "أهلاً وسهلاً بك 👋\nكيف يمكنني مساعدتك اليوم؟";

function resolveTestWelcome(storedWelcome: string, trustedCustomerName?: string | null): string {
  const base = storedWelcome.trim() || DEFAULT_WELCOME;
  const name = typeof trustedCustomerName === "string" ? trustedCustomerName.trim() : "";
  if (!name) return base;
  const knownGreeting = `أهلاً يا ${name} 👋`;
  if (base === DEFAULT_WELCOME || /^أهلاً/.test(base.split("\n")[0] ?? "")) {
    const lines = base.split("\n");
    return lines.length > 1 ? [knownGreeting, ...lines.slice(1)].join("\n") : knownGreeting;
  }
  return `${knownGreeting}\n${base}`;
}

class StubWhatsAppAdapter implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";
  sendCalls = 0;
  sentTexts: string[] = [];

  constructor(private readonly mode: "success" | "fail-welcome" | "fail-ai" = "success") {}

  parseWebhook(_ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    return {
      eventType: "message.received",
      companyChannelId: "company-channel-wa-1",
      channelKey: this.channelKey,
      idempotencyKey: String(rawPayload.externalMessageId ?? "wamid.in"),
      externalThreadId: String(rawPayload.externalThreadId ?? "201011404300"),
      payload: rawPayload,
    };
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    return {
      externalThreadId: String(payload.externalThreadId ?? "201011404300"),
      externalMessageId: String(payload.externalMessageId ?? "wamid.in"),
      senderExternalId: String(payload.senderExternalId ?? "201011404300"),
      text: String(payload.text ?? ""),
      attachments: [],
      metadata: {},
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    return { to: message.externalThreadId, text: message.text };
  }

  async sendOutbound(
    _ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult> {
    this.sendCalls += 1;
    const text = String(formattedPayload.text ?? "");
    this.sentTexts.push(text);
    if (this.mode === "fail-welcome" && this.sendCalls === 1) {
      throw new Error("Meta welcome send failed");
    }
    if (this.mode === "fail-ai" && this.sendCalls === 2) {
      throw new Error("Meta AI reply send failed");
    }
    return {
      externalMessageId: `wamid.out-${this.sendCalls}`,
      providerResponse: { messages: [{ id: `wamid.out-${this.sendCalls}` }] },
    };
  }
}

function whatsappCommercial(): WhatsAppMessagesCommercialPort {
  return {
    async checkAccess() {
      return { allowed: true, reason: "entitled" };
    },
    async recordUsage() {
      return { recorded: true, reason: "recorded" };
    },
  };
}

function createWhatsAppEmployeeRuntime(options: {
  storedWelcome?: string;
  trustedCustomerName?: string | null;
  capturePrepare?: { suppressWelcomePrompt?: boolean | null };
  sessionTimeoutMinutes?: number;
}) {
  const storedWelcome = options.storedWelcome ?? "";
  const sessionTimeoutMinutes = options.sessionTimeoutMinutes ?? 1440;
  return {
    async resolveForInboundChannel(input: { companyId: string }) {
      if (input.companyId !== "company-1") return null;
      return {
        aiEmployeeId: "emp-wa-1",
        conversationMetadataSeed: { aiEmployeeId: "emp-wa-1" },
        sessionTimeoutMinutes,
      };
    },
    async resolveSessionTimeoutMinutes() {
      return sessionTimeoutMinutes;
    },
    async resolveWhatsAppDeterministicWelcome(input: {
      trustedCustomerName?: string | null;
    }) {
      return {
        welcomeText: resolveTestWelcome(storedWelcome, input.trustedCustomerName),
      };
    },
    async prepareForConversation(input: {
      suppressWelcomePrompt?: boolean;
      basePageContext?: Record<string, unknown>;
    }) {
      if (options.capturePrepare) {
        options.capturePrepare.suppressWelcomePrompt = input.suppressWelcomePrompt ?? null;
      }
      return {
        runtimeConfig: {
          providerConnectionId: "provider-1",
          pageContext: {
            systemPrompt: input.suppressWelcomePrompt
              ? "You are helpful.\n\nCRITICAL TRUSTED CHANNEL IDENTITY:\n- trusted"
              : "You are helpful.\n\nCRITICAL FIRST-CONTACT WELCOME RULES:\nConfigured welcome message:\nمرحبًا",
            ...(input.basePageContext ?? {}),
          },
        },
        metadataPatch: { aiEmployeeId: "emp-wa-1" },
      };
    },
  } satisfies NonNullable<ChannelPlatformPorts["employeeRuntime"]>;
}

function whatsAppChannelEnv(overrides?: {
  adapter?: StubWhatsAppAdapter;
  employeeRuntime?: NonNullable<ChannelPlatformPorts["employeeRuntime"]>;
  runtimeResponse?: string;
  runtimeError?: Error;
}) {
  const adapter = overrides?.adapter ?? new StubWhatsAppAdapter();
  return createTestEnvironment({
    companyChannel: {
      id: "company-channel-wa-1",
      companyId: "company-1",
      channelKey: "whatsapp",
      displayName: "WhatsApp",
      provider: "meta",
      configuration: { phoneNumberId: "123456789" },
    },
    adapters: [adapter],
    employeeRuntime: overrides?.employeeRuntime,
    whatsappMessagesCommercial: whatsappCommercial(),
    runtimeResponse: overrides?.runtimeResponse ?? "مساء النور! كيف يمكنني مساعدتك؟",
    runtimeError: overrides?.runtimeError,
  });
}

async function routeWhatsApp(
  env: ReturnType<typeof createTestEnvironment>,
  overrides?: {
    text?: string;
    idempotencyKey?: string;
    externalThreadId?: string;
    customerIdentity?: ChannelPlatformPorts["customerIdentity"];
  },
) {
  if (overrides?.customerIdentity) {
    env.ports.customerIdentity = overrides.customerIdentity;
  }

  return env.router.routeInbound(createContext(), {
    companyId: "company-1",
    companyChannelId: env.companyChannel.id,
    channelKey: "whatsapp",
    source: "webhook",
    executeAi: true,
    idempotencyKey: overrides?.idempotencyKey ?? `wamid.${Date.now()}-${Math.random()}`,
    externalThreadId: overrides?.externalThreadId ?? "201011404300",
    externalMessageId: overrides?.idempotencyKey ?? `wamid.${Date.now()}-${Math.random()}`,
    payload: {
      text: overrides?.text ?? "مساء الخير",
      externalThreadId: overrides?.externalThreadId ?? "201011404300",
      senderExternalId: overrides?.externalThreadId ?? "201011404300",
    },
  });
}

describe("InboundMessagePipeline WhatsApp deterministic welcome", () => {
  it("A. known customer sends exact personalized welcome then AI reply", async () => {
    const customWelcome = "أهلاً وسهلاً بك 👋\nكيف يمكنني مساعدتك اليوم؟";
    const adapter = new StubWhatsAppAdapter();
    const env = whatsAppChannelEnv({
      adapter,
      employeeRuntime: createWhatsAppEmployeeRuntime({
        storedWelcome: customWelcome,
      }),
    });

    env.ports.customerIdentity = {
      async resolveTrustedCustomer() {
        return {
          status: "known",
          customerId: "cust-1",
          trustedCustomerName: "عمر مجدي",
        };
      },
    };

    const response = await routeWhatsApp(env, { externalThreadId: "wa-known-1" });
    const expectedWelcome = resolveTestWelcome(customWelcome, "عمر مجدي");

    assert.equal(adapter.sentTexts.length, 2);
    assert.equal(adapter.sentTexts[0], expectedWelcome);
    assert.equal(adapter.sentTexts[1], "مساء النور! كيف يمكنني مساعدتك؟");
    assert.equal(env.outgoingMessages.length, 1);
    assert.equal(env.outgoingMessages[0]?.content, expectedWelcome);
    assert.equal(response.responseContent, "مساء النور! كيف يمكنني مساعدتك؟");
    assert.ok(readAiEmployeeEngagement(env.sessions[0]?.metadata)?.welcomeDeliveredAt);
  });

  it("B. unknown customer sends configured welcome without CRM name", async () => {
    const customWelcome = "أهلاً وسهلاً بك 👋\nكيف يمكنني مساعدتك اليوم؟";
    const adapter = new StubWhatsAppAdapter();
    const env = whatsAppChannelEnv({
      adapter,
      employeeRuntime: createWhatsAppEmployeeRuntime({ storedWelcome: customWelcome }),
    });

    env.ports.customerIdentity = {
      async resolveTrustedCustomer() {
        return { status: "unknown", customerId: null, trustedCustomerName: null };
      },
    };

    await routeWhatsApp(env, { externalThreadId: "wa-unknown-1" });
    const expectedWelcome = resolveTestWelcome(customWelcome, null);

    assert.equal(adapter.sentTexts[0], expectedWelcome);
    assert.doesNotMatch(adapter.sentTexts[0] ?? "", /أهلاً يا /);
  });

  it("C. welcome is sent only once per engagement", async () => {
    const adapter = new StubWhatsAppAdapter();
    const env = whatsAppChannelEnv({
      adapter,
      employeeRuntime: createWhatsAppEmployeeRuntime({ storedWelcome: "مرحبًا" }),
    });

    const thread = "wa-once-1";
    await routeWhatsApp(env, { externalThreadId: thread, idempotencyKey: "wamid.once-1" });
    await routeWhatsApp(env, {
      externalThreadId: thread,
      idempotencyKey: "wamid.once-2",
      text: "سؤال ثاني",
    });

    assert.equal(adapter.sendCalls, 3);
    assert.equal(
      adapter.sentTexts.filter((text) => text.startsWith("أهلاً") || text.startsWith("مرحب")).length,
      1,
    );
    assert.equal(env.runtimeCalls, 2);
  });

  it("D. webhook retry does not duplicate welcome", async () => {
    const adapter = new StubWhatsAppAdapter();
    const env = whatsAppChannelEnv({
      adapter,
      employeeRuntime: createWhatsAppEmployeeRuntime({ storedWelcome: "مرحبًا" }),
    });

    const request = {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "whatsapp" as const,
      source: "webhook" as const,
      executeAi: true,
      idempotencyKey: "wamid.retry-welcome",
      externalThreadId: "wa-retry-1",
      externalMessageId: "wamid.retry-welcome",
      payload: {
        text: "مساء الخير",
        externalThreadId: "wa-retry-1",
        senderExternalId: "wa-retry-1",
      },
    };

    const first = await env.router.routeInbound(createContext(), request);
    const failedEvent = env.inboundEvents[0]!;
    failedEvent.processing_status = "failed";
    failedEvent.runtime_execution_id = null;
    failedEvent.error_message = "simulated webhook timeout before processed marker";

    const second = await env.router.routeInbound(createContext(), request);

    assert.equal(first.conversationId, second.conversationId);
    assert.equal(adapter.sentTexts.filter((text) => text === "مرحبًا").length, 1);
    assert.equal(env.runtimeCalls, 2);
  });

  it("E. suppresses LLM welcome prompt after deterministic welcome", async () => {
    const capturePrepare: { suppressWelcomePrompt?: boolean | null } = {};
    const env = whatsAppChannelEnv({
      employeeRuntime: createWhatsAppEmployeeRuntime({
        storedWelcome: "مرحبًا",
        capturePrepare,
      }),
    });

    await routeWhatsApp(env, { externalThreadId: "wa-suppress-1" });
    assert.equal(capturePrepare.suppressWelcomePrompt, true);
  });

  it("F. empty welcome setting uses platform default", async () => {
    const adapter = new StubWhatsAppAdapter();
    const env = whatsAppChannelEnv({
      adapter,
      employeeRuntime: createWhatsAppEmployeeRuntime({ storedWelcome: "" }),
    });

    await routeWhatsApp(env, { externalThreadId: "wa-default-1" });
    assert.equal(adapter.sentTexts[0], DEFAULT_WELCOME);
  });

  it("G. custom welcome is resolved from employee runtime port", async () => {
    const custom = "مرحبا بك في عيادة النور\nكيف نقدر نساعدك؟";
    const adapter = new StubWhatsAppAdapter();
    const env = whatsAppChannelEnv({
      adapter,
      employeeRuntime: createWhatsAppEmployeeRuntime({ storedWelcome: custom }),
    });

    env.ports.customerIdentity = {
      async resolveTrustedCustomer() {
        return { status: "known", customerId: "cust-2", trustedCustomerName: "سارة" };
      },
    };

    await routeWhatsApp(env, { externalThreadId: "wa-custom-1" });
    assert.match(adapter.sentTexts[0] ?? "", /عيادة النور/);
    assert.match(adapter.sentTexts[0] ?? "", /أهلاً يا سارة 👋/);
  });

  it("welcome dispatch failure does not block AI runtime", async () => {
    const adapter = new StubWhatsAppAdapter("fail-welcome");
    const capturePrepare: { suppressWelcomePrompt?: boolean | null } = {};
    const env = whatsAppChannelEnv({
      adapter,
      employeeRuntime: createWhatsAppEmployeeRuntime({
        storedWelcome: "مرحبًا",
        capturePrepare,
      }),
    });

    const response = await routeWhatsApp(env, { externalThreadId: "wa-welcome-fail-1" });
    assert.equal(env.runtimeCalls, 1);
    assert.equal(response.responseContent, "مساء النور! كيف يمكنني مساعدتك؟");
    assert.equal(capturePrepare.suppressWelcomePrompt, false);
    assert.equal(
      env.conversationMetadataById.get(response.conversationId ?? "")?.welcomeDeliveredAt,
      undefined,
    );
  });

  it("welcome success with AI outbound failure keeps welcome persisted and skips resend on retry", async () => {
    const adapter = new StubWhatsAppAdapter("fail-ai");
    const env = whatsAppChannelEnv({
      adapter,
      employeeRuntime: createWhatsAppEmployeeRuntime({ storedWelcome: "مرحبًا" }),
    });

    const request = {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "whatsapp" as const,
      source: "webhook" as const,
      executeAi: true,
      idempotencyKey: "wamid.ai-fail-retry",
      externalThreadId: "wa-ai-fail-1",
      externalMessageId: "wamid.ai-fail-retry",
      payload: {
        text: "مساء الخير",
        externalThreadId: "wa-ai-fail-1",
        senderExternalId: "wa-ai-fail-1",
      },
    };

    const first = await routeWhatsApp(env, {
      externalThreadId: "wa-ai-fail-1",
      idempotencyKey: "wamid.ai-fail-retry",
    });
    assert.ok(first.outboundError);
    assert.equal(env.outgoingMessages.filter((message) => message.content === "مرحبًا").length, 1);

    env.inboundEvents[0]!.processing_status = "failed";
    env.inboundEvents[0]!.runtime_execution_id = null;
    env.inboundEvents[0]!.error_message = "simulated retry after AI outbound failure";
    await env.router.routeInbound(createContext(), request);

    assert.equal(env.outgoingMessages.filter((message) => message.content === "مرحبًا").length, 1);
    assert.equal(adapter.sentTexts.filter((text) => text === "مرحبًا").length, 1);
    assert.equal(env.runtimeCalls, 2);
  });

  it("does not send deterministic welcome for web_chat", async () => {
    const adapter = new StubWhatsAppAdapter();
    const env = createTestEnvironment({
      employeeRuntime: createWhatsAppEmployeeRuntime({ storedWelcome: "مرحبًا" }),
      runtimeResponse: "Web reply",
    });

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "webhook",
      executeAi: true,
      externalThreadId: "web-user-1",
      payload: { text: "Hello" },
      runtimeConfig: { providerConnectionId: "provider-1" },
    });

    assert.equal(adapter.sendCalls, 0);
    assert.equal(env.outgoingMessages.length, 0);
  });
});
