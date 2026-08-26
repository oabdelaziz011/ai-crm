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
import { createContext, createTestEnvironment } from "../test-utils.js";

const TRUSTED_ID = "11111111-1111-4111-8111-111111111111";
const STALE_ID = "6c1f2063-d89d-45a1-b7ec-87cbd476816d";
const WA_SENDER = "201011404109";

class StubWhatsAppAdapter implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";
  sendCalls = 0;
  sentTexts: string[] = [];

  parseWebhook(_ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    return {
      eventType: "message.received",
      companyChannelId: "company-channel-wa-1",
      channelKey: this.channelKey,
      idempotencyKey: String(rawPayload.externalMessageId ?? "wamid.in"),
      externalThreadId: String(rawPayload.externalThreadId ?? WA_SENDER),
      payload: rawPayload,
    };
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    return {
      externalThreadId: String(payload.externalThreadId ?? WA_SENDER),
      externalMessageId: String(payload.externalMessageId ?? "wamid.in"),
      senderExternalId: String(payload.senderExternalId ?? WA_SENDER),
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
    this.sentTexts.push(String(formattedPayload.text ?? ""));
    return { externalMessageId: `wamid.out-${this.sendCalls}`, providerResponse: {} };
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

function createEmployeeRuntime(options?: { captureTrusted?: { id?: string | null; name?: string | null } }) {
  return {
    async resolveForInboundChannel() {
      return {
        aiEmployeeId: "emp-1",
        conversationMetadataSeed: { aiEmployeeId: "emp-1" },
        sessionTimeoutMinutes: 30,
      };
    },
    async resolveSessionTimeoutMinutes() {
      return 30;
    },
    async prepareForConversation(input: {
      basePageContext?: Record<string, unknown>;
    }) {
      if (options?.captureTrusted) {
        options.captureTrusted.id =
          typeof input.basePageContext?.trustedCustomerId === "string"
            ? input.basePageContext.trustedCustomerId
            : null;
        options.captureTrusted.name =
          typeof input.basePageContext?.trustedCustomerName === "string"
            ? input.basePageContext.trustedCustomerName
            : null;
      }
      return {
        runtimeConfig: {
          providerConnectionId: "prov-1",
          pageContext: { ...(input.basePageContext ?? {}) },
          executionPolicy: { streaming: false },
        },
        metadataPatch: null,
      };
    },
    async resolveWhatsAppDeterministicWelcome(input: { trustedCustomerName?: string | null }) {
      const name = typeof input.trustedCustomerName === "string" ? input.trustedCustomerName.trim() : "";
      return {
        welcomeText: name ? `أهلاً يا ${name} 👋` : "أهلاً وسهلاً بك 👋",
      };
    },
  };
}

function whatsAppEnv(overrides?: {
  employeeRuntime?: ChannelPlatformPorts["employeeRuntime"];
  runtimeResponse?: string;
}) {
  const adapter = new StubWhatsAppAdapter();
  const env = createTestEnvironment({
    companyChannel: {
      id: "company-channel-wa-1",
      companyId: "company-1",
      channelKey: "whatsapp",
      displayName: "WhatsApp",
      isEnabled: true,
      provider: "meta",
      configuration: { phoneNumberId: "123" },
    },
    adapters: [adapter],
    employeeRuntime: overrides?.employeeRuntime ?? createEmployeeRuntime(),
    whatsappMessagesCommercial: whatsappCommercial(),
    runtimeResponse: overrides?.runtimeResponse ?? "تم.",
  });
  return { env, adapter };
}

async function routeWhatsApp(
  env: ReturnType<typeof createTestEnvironment>,
  overrides?: {
    text?: string;
    sender?: string;
    customerIdentity?: ChannelPlatformPorts["customerIdentity"];
  },
) {
  if (overrides?.customerIdentity) {
    env.ports.customerIdentity = overrides.customerIdentity;
  }
  const sender = overrides?.sender ?? WA_SENDER;
  return env.router.routeInbound(createContext(), {
    companyId: "company-1",
    companyChannelId: env.companyChannel.id,
    channelKey: "whatsapp",
    source: "webhook",
    executeAi: true,
    idempotencyKey: `wamid.${Date.now()}-${Math.random()}`,
    externalThreadId: sender,
    externalMessageId: `wamid.${Date.now()}-${Math.random()}`,
    payload: {
      text: overrides?.text ?? "عايز أحجز",
      externalThreadId: sender,
      senderExternalId: sender,
    },
  });
}

describe("WhatsApp identity continuity", () => {
  it("A. unique CRM match: binds customer, personalizes welcome, stamps trustedChannelCustomerId", async () => {
    const { env, adapter } = whatsAppEnv();
    await routeWhatsApp(env, {
      text: "مساء الخير",
      customerIdentity: {
        async resolveTrustedCustomer() {
          return {
            status: "known",
            customerId: TRUSTED_ID,
            trustedCustomerName: "عمر مجدي",
          };
        },
      },
    });

    assert.equal(env.conversationCustomerIdById.get(env.conversations[0]!.id), TRUSTED_ID);
    assert.equal(adapter.sentTexts[0], "أهلاً يا عمر مجدي 👋");
    const meta = env.conversationMetadataById.get(env.conversations[0]!.id) ?? {};
    assert.equal(meta.trustedChannelCustomerId, TRUSTED_ID);
    assert.equal(meta.channelIdentityStatus, "known");
    assert.equal(meta.trustedCustomerName, "عمر مجدي");
  });

  it("A2. customer-id scoped welcome display name عمر عبدالعزيز (not CRM legal name)", async () => {
    const OMAR_ID = "8b810114-c2fe-4a30-bc65-cf4bf084d1fb";
    const { env, adapter } = whatsAppEnv();
    await routeWhatsApp(env, {
      text: "مساء الخير",
      customerIdentity: {
        async resolveTrustedCustomer() {
          return {
            status: "known",
            customerId: OMAR_ID,
            trustedCustomerName: "عمر عبدالعزيز",
          };
        },
      },
    });

    assert.equal(env.conversationCustomerIdById.get(env.conversations[0]!.id), OMAR_ID);
    assert.equal(adapter.sentTexts[0], "أهلاً يا عمر عبدالعزيز 👋");
    const meta = env.conversationMetadataById.get(env.conversations[0]!.id) ?? {};
    assert.equal(meta.trustedChannelCustomerId, OMAR_ID);
    assert.equal(meta.trustedCustomerName, "عمر عبدالعزيز");
    assert.doesNotMatch(String(adapter.sentTexts[0]), /عمر مجدي/);
  });

  it("B. unknown CRM: stamps null trustedChannelCustomerId and leaves intake path open", async () => {
    const captureTrusted: { id?: string | null; name?: string | null } = {};
    const { env } = whatsAppEnv({
      employeeRuntime: createEmployeeRuntime({ captureTrusted }),
      runtimeResponse: "ممكن اسمك ورقم الموبايل؟",
    });
    await routeWhatsApp(env, {
      text: "عايز أحجز عيادة",
      customerIdentity: {
        async resolveTrustedCustomer() {
          return { status: "unknown", customerId: null, trustedCustomerName: null };
        },
      },
    });

    assert.equal(env.conversationCustomerIdById.get(env.conversations[0]!.id), undefined);
    assert.equal(captureTrusted.id, null);
    const meta = env.conversationMetadataById.get(env.conversations[0]!.id) ?? {};
    assert.equal(meta.trustedChannelCustomerId, null);
    assert.equal(meta.channelIdentityStatus, "unknown");
  });

  it("C. multiple CRM matches: fail closed — no bind, no trusted stamp id", async () => {
    const captureTrusted: { id?: string | null } = {};
    const { env } = whatsAppEnv({
      employeeRuntime: createEmployeeRuntime({ captureTrusted }),
    });
    await routeWhatsApp(env, {
      text: "عايز أحجز",
      customerIdentity: {
        async resolveTrustedCustomer() {
          return { status: "ambiguous", customerId: null, trustedCustomerName: null };
        },
      },
    });

    assert.equal(env.conversationCustomerIdById.get(env.conversations[0]!.id), undefined);
    assert.equal(captureTrusted.id, null);
    const meta = env.conversationMetadataById.get(env.conversations[0]!.id) ?? {};
    assert.equal(meta.trustedChannelCustomerId, null);
    assert.equal(meta.channelIdentityStatus, "ambiguous");
  });

  it("D. stale conversation.customer_id conflict: does not overwrite bind; stamps WA-resolved id", async () => {
    const captureTrusted: { id?: string | null; name?: string | null } = {};
    const { env } = whatsAppEnv({
      employeeRuntime: createEmployeeRuntime({ captureTrusted }),
    });

    // Seed stale bind before route creates the conversation — seed after first create via hook:
    // route creates conversation; we pre-set by wrapping link + get.
    let conversationId: string | null = null;
    const originalGet = env.ports.conversation.getConversationCustomerId!;
    env.ports.conversation.getConversationCustomerId = async (id) => {
      conversationId = id;
      if (!env.conversationCustomerIdById.has(id)) {
        env.conversationCustomerIdById.set(id, STALE_ID);
      }
      return originalGet(id);
    };

    await routeWhatsApp(env, {
      text: "عايز أحجز",
      customerIdentity: {
        async resolveTrustedCustomer() {
          return {
            status: "known",
            customerId: TRUSTED_ID,
            trustedCustomerName: "عمر مجدي",
          };
        },
        async customerMatchesWhatsAppSender() {
          return { matches: false, name: null };
        },
      },
    });

    assert.ok(conversationId);
    assert.equal(env.conversationCustomerIdById.get(conversationId!), STALE_ID, "must not overwrite stale bind");
    assert.equal(captureTrusted.id, TRUSTED_ID, "turn must use WA-resolved customer");
    assert.equal(captureTrusted.name, "عمر مجدي");
    const meta = env.conversationMetadataById.get(conversationId!) ?? {};
    assert.equal(meta.trustedChannelCustomerId, TRUSTED_ID);
    assert.equal(meta.channelIdentityStatus, "conflict_stale_bind");
  });

  it("E. consistent trusted customer with missing name: hydrate from CRM without changing id", async () => {
    const captureTrusted: { id?: string | null; name?: string | null } = {};
    const { env } = whatsAppEnv({
      employeeRuntime: createEmployeeRuntime({ captureTrusted }),
    });

    env.ports.conversation.getConversationCustomerId = async (id) => {
      if (!env.conversationCustomerIdById.has(id)) {
        env.conversationCustomerIdById.set(id, TRUSTED_ID);
      }
      return env.conversationCustomerIdById.get(id) ?? null;
    };

    await routeWhatsApp(env, {
      text: "عايز أحجز",
      customerIdentity: {
        async resolveTrustedCustomer() {
          return {
            status: "known",
            customerId: TRUSTED_ID,
            trustedCustomerName: null,
          };
        },
        async getCustomerById() {
          return { id: TRUSTED_ID, name: "عمر مجدي", phone: "01011404109" };
        },
      },
    });

    assert.equal(env.conversationCustomerIdById.get(env.conversations[0]!.id), TRUSTED_ID);
    assert.equal(captureTrusted.id, TRUSTED_ID);
    assert.equal(captureTrusted.name, "عمر مجدي");
    const meta = env.conversationMetadataById.get(env.conversations[0]!.id) ?? {};
    assert.equal(meta.trustedCustomerName, "عمر مجدي");
    assert.equal(meta.trustedChannelCustomerId, TRUSTED_ID);
  });
});
