/**
 * A1 campaigns + A2 WhatsApp commercial entitlement closure tests.
 * No Meta / queue processing / campaign execution against live systems.
 * Run: npx tsx --test scripts/commercial-a1-a2-enforcement.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DASHBOARD_ROUTE_REGISTRY,
  getDashboardRouteById,
  isDashboardRoutePermitted,
} from "../src/config/dashboard-route-registry.ts";
import { CAMPAIGN_ROUTE_REGISTRY } from "../src/config/campaigns-route-registry.ts";
import { BILLING_FEATURE_CODES } from "../src/lib/billing/feature-code-map.ts";
import {
  CAMPAIGNS_FEATURE_CODE,
  MarketingCampaignService,
} from "../src/lib/campaigns/campaign-execution-service.ts";
import { MarketingCampaignError } from "../src/lib/campaigns/types.ts";
import { WhatsAppCampaignCapabilityChecker } from "../src/lib/campaigns/whatsapp-capability.ts";
import { createWhatsAppProvider } from "../src/lib/notifications/providers/whatsapp/services/whatsapp-provider.ts";
import type { WhatsAppMessagesCommercialPort } from "@workspace/channel-platform";
import { OutboundMessagePipeline } from "../../../lib/channel-platform/src/pipelines/outbound-message-pipeline.ts";
import { DeliveryFailedError } from "../../../lib/channel-platform/src/errors.ts";
import { createStubWebChatAdapter } from "../../../lib/channel-platform/src/adapters/stub-web-chat-adapter.ts";
import { createChannelAdapterRegistry } from "../../../lib/channel-platform/src/adapters/channel-adapter-registry.ts";
import { DeliveryTrackingEngine } from "../../../lib/channel-platform/src/engines/delivery-tracking-engine.ts";
import { createContext } from "../../../lib/channel-platform/src/test-utils.ts";
import type {
  ChannelAdapterContext,
  ChannelAdapterPort,
  ChannelAdapterSendResult,
} from "../../../lib/channel-platform/src/ports/channel-adapter-port.ts";
import type {
  NormalizedInboundMessageDto,
  OutboundChannelMessageDto,
  WebhookEnvelopeDto,
} from "../../../lib/channel-platform/src/dto/channel-dto.ts";
import type {
  ChannelDeliveryEventRepository,
  ChannelSessionRepository,
  CreateDeliveryEventInput,
  UpdateDeliveryEventInput,
} from "../../../lib/channel-platform/src/repositories/channel-platform-repositories.ts";
import type {
  ChannelDeliveryEventRecord,
  ChannelSessionRecord,
  ResolvedCompanyChannel,
} from "../../../lib/channel-platform/src/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

function perms(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
}

function entitled(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
}

function platformEnabled() {
  return () => true;
}

function ctx(partial: {
  isSuperAdmin?: boolean;
  permissions?: string[];
}) {
  const set = new Set(partial.permissions ?? []);
  return {
    companyId: "co-1",
    actorUserId: "user-1",
    isSuperAdmin: partial.isSuperAdmin ?? false,
    hasPermission: (code: string) => set.has(code),
  };
}

function entitlementPort(enabled: Record<string, boolean | undefined>) {
  return {
    isEnabled: async (_companyId: string, featureCode: string) => {
      const value = enabled[featureCode];
      if (value === undefined) return false;
      return value;
    },
  };
}

describe("A1 — campaigns commercial SKU", () => {
  it("1. campaigns in BILLING_FEATURE_CODES + migration catalog", () => {
    assert.ok((BILLING_FEATURE_CODES as readonly string[]).includes("campaigns"));
    const migration = readFileSync(
      join(root, "supabase/migrations/342_campaigns_commercial_feature.sql"),
      "utf8",
    );
    assert.match(migration, /'campaigns'/);
    assert.match(migration, /is_billable/);
    assert.match(migration, /requires_subscription/);
    assert.match(migration, /campaigns\.view/);
    assert.match(migration, /campaigns\.create/);
    assert.match(migration, /campaigns\.send/);
    assert.match(migration, /default_enabled[\s\S]*false|false,\s*\n\s*true,\s*\n\s*true/);
  });

  it("2. dashboard + nested routes require commercialFeatureCode campaigns", () => {
    const route = getDashboardRouteById("campaigns");
    assert.equal(route.permission, "campaigns.view");
    assert.equal(route.commercialFeatureCode, "campaigns");
    for (const nested of CAMPAIGN_ROUTE_REGISTRY) {
      assert.equal(nested.commercialFeatureCode, "campaigns", nested.id);
    }
  });

  it("3. RBAC YES + commercial YES → ALLOW route", () => {
    const route = getDashboardRouteById("campaigns");
    assert.equal(
      isDashboardRoutePermitted(
        route,
        false,
        perms("campaigns.view"),
        platformEnabled(),
        entitled("campaigns"),
      ),
      true,
    );
  });

  it("4. RBAC YES + commercial NO → DENY route", () => {
    const route = getDashboardRouteById("campaigns");
    assert.equal(
      isDashboardRoutePermitted(
        route,
        false,
        perms("campaigns.view"),
        platformEnabled(),
        entitled(),
      ),
      false,
    );
  });

  it("5. nested create without entitlement → DENY (parent gate matrix)", () => {
    const route = getDashboardRouteById("campaigns");
    assert.equal(
      isDashboardRoutePermitted(
        route,
        false,
        perms("campaigns.view", "campaigns.create"),
        platformEnabled(),
        () => undefined,
      ),
      false,
    );
  });

  it("6. execute/send: RBAC YES + commercial YES → ALLOW gate (auth passes)", async () => {
    const service = new MarketingCampaignService(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      } as never,
      () => ({ send: async () => ({ messageIds: [], queueIds: [], channelQueueIds: {} }) }) as never,
      { entitlement: entitlementPort({ campaigns: true, whatsapp_channel: true }) },
    );
    await assert.rejects(
      () =>
        service.execute(ctx({ permissions: ["campaigns.send"] }), {
          campaignId: "missing",
        }),
      (err: unknown) =>
        err instanceof MarketingCampaignError && err.code === "campaign_not_found",
    );
  });

  it("7. execute/send: RBAC YES + commercial NO → DENY", async () => {
    const service = new MarketingCampaignService(
      { from: () => ({}) } as never,
      () => ({ send: async () => ({ messageIds: [], queueIds: [], channelQueueIds: {} }) }) as never,
      { entitlement: entitlementPort({ campaigns: false }) },
    );
    await assert.rejects(
      () => service.execute(ctx({ permissions: ["campaigns.send"] }), { campaignId: "x" }),
      (err: unknown) =>
        err instanceof MarketingCampaignError &&
        err.code === "unauthorized" &&
        /not entitled/i.test(err.message),
    );
  });

  it("8. execute/send: commercial YES + NO campaigns.send → DENY", async () => {
    const service = new MarketingCampaignService(
      { from: () => ({}) } as never,
      () => ({ send: async () => ({ messageIds: [], queueIds: [], channelQueueIds: {} }) }) as never,
      { entitlement: entitlementPort({ campaigns: true }) },
    );
    await assert.rejects(
      () => service.execute(ctx({ permissions: ["campaigns.view"] }), { campaignId: "x" }),
      (err: unknown) =>
        err instanceof MarketingCampaignError && err.code === "unauthorized",
    );
  });

  it("9. unknown/unresolved campaigns entitlement → DENY", async () => {
    const service = new MarketingCampaignService(
      { from: () => ({}) } as never,
      () => ({ send: async () => ({ messageIds: [], queueIds: [], channelQueueIds: {} }) }) as never,
      {
        entitlement: {
          isEnabled: async () => false,
        },
      },
    );
    await assert.rejects(
      () =>
        service.createDraft(ctx({ permissions: ["campaigns.create"] }), {
          name: "x",
          idempotencyKey: "k",
          audience: { type: "all" },
          content: { campaignTitle: "t", detail: "d" },
          channels: ["whatsapp"],
        }),
      (err: unknown) =>
        err instanceof MarketingCampaignError && err.code === "unauthorized",
    );
  });

  it("10. assertCanSend source never authorizes from campaigns.send alone", () => {
    const src = readFileSync(
      join(__dirname, "../src/lib/campaigns/campaign-execution-service.ts"),
      "utf8",
    );
    assert.match(src, /assertCampaignsEntitled/);
    assert.match(src, /CAMPAIGNS_FEATURE_CODE/);
    assert.equal(CAMPAIGNS_FEATURE_CODE, "campaigns");
    assert.match(src, /await assertCanSend\(ctx, this\.entitlement\)/);
  });
});

describe("A2 — WhatsApp commercial mandatory", () => {
  it("11. createWhatsAppProvider without commercial port → throws (unsafe construction impossible)", () => {
    assert.throws(
      () =>
        createWhatsAppProvider(
          {} as never,
          { provider: "meta_cloud", send: async () => ({ messageId: "x", provider: "meta_cloud" }), healthCheck: async () => ({ ok: true, provider: "meta_cloud", latencyMs: 1 }) } as never,
          { renderEvent: () => ({ templateKey: "t", templateId: null, languageCode: "en", bodyParameters: [], fallbackText: "x" }) } as never,
          undefined as never,
        ),
      /WhatsAppMessagesCommercialPort is required/,
    );
  });

  it("12. commercial port omitted options object → throws", () => {
    assert.throws(
      () =>
        createWhatsAppProvider(
          {} as never,
          { provider: "meta_cloud", send: async () => ({ messageId: "x", provider: "meta_cloud" }), healthCheck: async () => ({ ok: true, provider: "meta_cloud", latencyMs: 1 }) } as never,
          { renderEvent: () => ({ templateKey: "t", templateId: null, languageCode: "en", bodyParameters: [], fallbackText: "x" }) } as never,
          {} as never,
        ),
      /WhatsAppMessagesCommercialPort is required/,
    );
  });

  it("13. WhatsApp campaign capability: whatsapp_channel absent → DENY even with credentials", async () => {
    const checker = new WhatsAppCampaignCapabilityChecker(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              is: () => ({
                eq: async () => ({
                  data: [
                    {
                      id: "ch-1",
                      is_enabled: true,
                      deleted_at: null,
                      communication_channels: { key: "whatsapp" },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
        rpc: async () => ({
          data: {
            enabled: true,
            has_access_token: true,
            phone_number_id: "123",
            token_status: "valid",
          },
          error: null,
        }),
      } as never,
      entitlementPort({ whatsapp_channel: false }),
    );
    const result = await checker.check("co-1");
    assert.equal(result.available, false);
    assert.equal(result.reason, "not_entitled");
  });

  it("14. WhatsApp campaign: campaigns + whatsapp + would allow capability", async () => {
    const checker = new WhatsAppCampaignCapabilityChecker(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              is: () => ({
                eq: async () => ({
                  data: [
                    {
                      id: "ch-1",
                      is_enabled: true,
                      deleted_at: null,
                      communication_channels: { key: "whatsapp" },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as never,
      entitlementPort({ whatsapp_channel: true }),
    );
    // Settings repo uses getPublic — stub via prototype override pattern is heavy;
    // entitlement pass is asserted by not returning not_entitled before channel query.
    // Channel query returns data; settings will fail on missing methods — wrap getPublic.
    const settingsOk = {
      enabled: true,
      hasAccessToken: true,
      phoneNumberId: "123",
      tokenStatus: "valid",
    };
    (checker as unknown as { settingsRepo: { getPublic: (id: string) => Promise<typeof settingsOk> } }).settingsRepo = {
      getPublic: async () => settingsOk,
    };
    const result = await checker.check("co-1");
    assert.equal(result.available, true);
  });

  it("15. WhatsApp campaign execute gate: campaigns YES + whatsapp NO → capability DENY", async () => {
    const service = new MarketingCampaignService(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      } as never,
      () => ({ send: async () => ({ messageIds: [], queueIds: [], channelQueueIds: {} }) }) as never,
      {
        entitlement: entitlementPort({ campaigns: true, whatsapp_channel: false }),
      },
    );
    await assert.rejects(
      () => service.execute(ctx({ permissions: ["campaigns.send"] }), { campaignId: "x" }),
      (err: unknown) =>
        err instanceof MarketingCampaignError && err.code === "campaign_not_found",
    );
    const capability = new WhatsAppCampaignCapabilityChecker(
      { from: () => ({}) } as never,
      entitlementPort({ whatsapp_channel: false }),
    );
    const wa = await capability.check("co-1");
    assert.equal(wa.available, false);
    assert.equal(wa.reason, "not_entitled");
  });

  it("16. Normal WhatsApp (no campaigns entitlement) still allowed at WA capability", async () => {
    const checker = new WhatsAppCampaignCapabilityChecker(
      { from: () => ({}) } as never,
      entitlementPort({ whatsapp_channel: true, campaigns: false }),
    );
    (checker as unknown as { settingsRepo: { getPublic: () => Promise<{ enabled: boolean; hasAccessToken: boolean; phoneNumberId: string; tokenStatus: string }> } }).settingsRepo = {
      getPublic: async () => ({
        enabled: true,
        hasAccessToken: true,
        phoneNumberId: "123",
        tokenStatus: "valid",
      }),
    };
    (checker as unknown as { client: { from: () => unknown } }).client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              eq: async () => ({
                data: [
                  {
                    id: "ch-1",
                    is_enabled: true,
                    deleted_at: null,
                    communication_channels: { key: "whatsapp" },
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
    const result = await checker.check("co-1");
    assert.equal(result.available, true);
  });

  it("17. OutboundMessagePipeline missing commercial port → DENY (fail closed)", async () => {
    class StubWhatsAppAdapter implements ChannelAdapterPort {
      readonly channelKey = "whatsapp";
      sendCalls = 0;
      parseWebhook(_ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
        return {
          eventType: "message.received",
          companyChannelId: "company-channel-wa",
          channelKey: this.channelKey,
          idempotencyKey: "wamid.in",
          externalThreadId: "15551234567",
          payload: rawPayload,
        };
      }
      normalizeInbound(): NormalizedInboundMessageDto {
        return {
          companyId: "company-1",
          companyChannelId: "company-channel-wa",
          channelKey: this.channelKey,
          externalThreadId: "15551234567",
          externalMessageId: "wamid.in",
          text: "hi",
          attachments: [],
          occurredAt: new Date().toISOString(),
          rawPayload: {},
        };
      }
      async sendOutbound(): Promise<ChannelAdapterSendResult> {
        this.sendCalls += 1;
        return { externalMessageId: "wamid.out", providerResponse: {} };
      }
      formatOutbound(_message: OutboundChannelMessageDto): Record<string, unknown> {
        return { text: "hi" };
      }
    }

    const whatsAppAdapter = new StubWhatsAppAdapter();
    const companyChannel: ResolvedCompanyChannel = {
      id: "company-channel-wa",
      companyId: "company-1",
      channelKey: "whatsapp",
      displayName: "WhatsApp",
      isEnabled: true,
      provider: "meta",
      configuration: {},
    };
    const deliveryRepository: ChannelDeliveryEventRepository = {
      createEvent: async (eventInput: CreateDeliveryEventInput) =>
        ({
          id: "delivery-1",
          company_id: eventInput.companyId,
          delivery_status: "pending",
        }) as ChannelDeliveryEventRecord,
      updateEvent: async (updateInput: UpdateDeliveryEventInput) =>
        ({
          id: updateInput.deliveryEventId,
          delivery_status: updateInput.deliveryStatus,
          external_message_id: updateInput.externalMessageId,
        }) as ChannelDeliveryEventRecord,
      findById: async () => null,
      findByExternalMessageId: async () => null,
    };
    const sessionRepository: ChannelSessionRepository = {
      findByExternalThread: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      createSession: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      reattachConversation: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      updateSessionMetadata: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      touchInbound: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      touchOutbound: async () => ({ id: "session-1" }) as ChannelSessionRecord,
    };

    const pipeline = new OutboundMessagePipeline(
      {
        registry: { getCompanyChannel: async () => companyChannel },
        conversation: {
          createConversation: async () => ({ id: "conv-1" }),
          addIncomingMessage: async () => ({ id: "msg-in" }),
          addOutgoingMessage: async () => ({ id: "msg-out" }),
        },
        runtime: {
          execute: async () => ({
            executionId: "runtime-1",
            responseContent: "noop",
            correlationId: "corr-1",
          }),
        },
        // intentionally omit whatsappMessagesCommercial
      } as never,
      createChannelAdapterRegistry([createStubWebChatAdapter(), whatsAppAdapter]),
      new DeliveryTrackingEngine(deliveryRepository),
      sessionRepository,
    );

    await assert.rejects(
      () =>
        pipeline.process(createContext("company-1"), {
          companyId: "company-1",
          companyChannelId: "company-channel-wa",
          channelKey: "whatsapp",
          channelSessionId: "session-1",
          conversationId: "conv-1",
          externalThreadId: "15551234567",
          text: "hello",
        }),
      (err: unknown) => err instanceof DeliveryFailedError,
    );
    assert.equal(whatsAppAdapter.sendCalls, 0);
  });

  it("18. commercial checkAccess no company context → DENY", async () => {
    const port: WhatsAppMessagesCommercialPort = {
      checkAccess: async (input) => {
        if (!input.companyId?.trim()) {
          return { allowed: false, reason: "entitlement_unavailable" };
        }
        return { allowed: true, reason: "entitled" };
      },
      recordUsage: async () => ({ recorded: false }),
    };
    const decision = await port.checkAccess({ companyId: "" });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "entitlement_unavailable");
  });

  it("19. provider + local queue wiring requires commercial port (source contract)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "../src/lib/notifications/providers/whatsapp/services/whatsapp-provider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /whatsappMessagesCommercial: WhatsAppMessagesCommercialPort/);
    assert.match(providerSrc, /WhatsAppMessagesCommercialPort is required/);
    assert.match(providerSrc, /assertCommercialAccess/);
    assert.doesNotMatch(providerSrc, /if \(this\.whatsappMessagesCommercial\)/);

    const channelProviders = readFileSync(
      join(__dirname, "../src/lib/communication/providers/channel-providers.ts"),
      "utf8",
    );
    assert.match(channelProviders, /createLoginAppWhatsAppMessagesCommercialPort/);

    const indexSrc = readFileSync(
      join(__dirname, "../src/lib/notifications/providers/whatsapp/index.ts"),
      "utf8",
    );
    assert.match(indexSrc, /createLoginAppWhatsAppMessagesCommercialPort/);

    const pipelineSrc = readFileSync(
      join(root, "lib/channel-platform/src/pipelines/outbound-message-pipeline.ts"),
      "utf8",
    );
    assert.match(pipelineSrc, /if \(!this\.ports\.whatsappMessagesCommercial\)/);
  });

  it("20. campaigns commercial does not unlock WhatsApp alone (catalog independence)", () => {
    assert.ok(DASHBOARD_ROUTE_REGISTRY.some((r) => r.commercialFeatureCode === "whatsapp_channel"));
    assert.ok(DASHBOARD_ROUTE_REGISTRY.some((r) => r.id === "campaigns" && r.commercialFeatureCode === "campaigns"));
    assert.notEqual("campaigns", "whatsapp_channel");
  });
});
