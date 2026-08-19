import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WhatsAppMessagesCommercialPort } from "@workspace/channel-platform";
import { WhatsAppProvider } from "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-provider";
import type { NotificationQueueItem } from "@login-app/lib/notifications/types";
import type {
  CompanyWhatsAppSettings,
  WhatsAppTransport,
  WhatsAppTransportSendResult,
} from "@login-app/lib/notifications/providers/whatsapp/types/whatsapp-types";
import type { WhatsAppRenderer } from "@login-app/lib/notifications/providers/whatsapp/renderer/whatsapp-renderer";
import type { WhatsAppQueueConsumer } from "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-queue-consumer";
import type { WhatsAppSettingsRepository } from "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-settings-repository";
import type { WhatsAppDeliveryLogRepository } from "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-delivery-log-repository";

type QueueUpdate = {
  companyId: string;
  queueId: string;
  status: string;
  retryCount?: number;
  rescheduleAt?: string;
};

class StubTransport implements WhatsAppTransport {
  readonly provider = "meta_cloud" as const;
  sendCalls = 0;
  mode: "success" | "fail" | "null_id" = "success";

  async send(): Promise<WhatsAppTransportSendResult> {
    this.sendCalls += 1;
    if (this.mode === "fail") throw new Error("Meta send failed");
    if (this.mode === "null_id") return { messageId: null, provider: this.provider };
    return { messageId: "wamid.queue-1", provider: this.provider };
  }

  async healthCheck() {
    return { ok: true, provider: this.provider, latencyMs: 1 };
  }
}

function enabledSettings(companyId: string): CompanyWhatsAppSettings {
  return {
    companyId,
    enabled: true,
    provider: "meta_cloud",
    accessToken: "token",
    phoneNumberId: "123",
    businessAccountId: "waba",
    webhookVerifyToken: "verify",
    apiVersion: "v21.0",
    appSecret: "",
    defaultLanguage: "en",
    maxRetryCount: 3,
    hasAccessToken: true,
    hasWebhookVerifyToken: true,
    hasAppSecret: false,
    tokenStatus: "valid",
    tokenExpiresAt: null,
    tokenCheckedAt: null,
    lastSuccessfulSendAt: null,
    lastAuthError: null,
    lastAuthErrorAt: null,
    lastAuthErrorCode: null,
  };
}

function queueItem(companyId: string, id = "queue-1"): NotificationQueueItem {
  return {
    id,
    companyId,
    notificationId: "notif-1",
    channel: "whatsapp",
    status: "pending",
    retryCount: 0,
    scheduledAt: new Date().toISOString(),
    processedAt: null,
    lastError: null,
    payload: { event: "generic_system", params: { phone: "+15551234567" } },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function commercial(
  allowed: boolean,
  usage?: { recordCalls: number; keys: string[] },
  reason: "entitled" | "not_entitled" | "quota_exceeded" = allowed ? "entitled" : "not_entitled",
): WhatsAppMessagesCommercialPort {
  return {
    async checkAccess() {
      return { allowed, reason };
    },
    async recordUsage(input) {
      if (usage) {
        usage.recordCalls += 1;
        usage.keys.push(`${input.companyId}:${input.externalMessageId}`);
      }
      return { recorded: true, reason: "recorded" };
    },
  };
}

function buildProvider(input: {
  transport: StubTransport;
  commercial?: WhatsAppMessagesCommercialPort;
  updates?: QueueUpdate[];
}) {
  const updates = input.updates ?? [];
  const queueConsumer = {
    async listPendingWhatsApp() {
      return [];
    },
    async markProcessing(companyId: string, queueId: string) {
      updates.push({ companyId, queueId, status: "processing" });
    },
    async markCompleted(companyId: string, queueId: string) {
      updates.push({ companyId, queueId, status: "completed" });
    },
    async markFailed(
      companyId: string,
      queueId: string,
      _error: string,
      retryCount: number,
      rescheduleAt?: string,
    ) {
      updates.push({
        companyId,
        queueId,
        status: rescheduleAt ? "pending" : "failed",
        retryCount,
        rescheduleAt,
      });
    },
  } as unknown as WhatsAppQueueConsumer;

  const settingsRepository = {
    async getSecure(companyId: string) {
      return enabledSettings(companyId);
    },
  } as unknown as WhatsAppSettingsRepository;

  const deliveryLogRepository = {
    async append() {},
  } as unknown as WhatsAppDeliveryLogRepository;

  const renderer = {
    renderEvent() {
      return {
        templateKey: "generic_system",
        templateId: "generic_system",
        languageCode: "en",
        bodyParameters: [],
        fallbackText: "hello",
      };
    },
  } as unknown as WhatsAppRenderer;

  const client = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: null, error: null }),
      };
    },
  } as never;

  const provider = new WhatsAppProvider(
    client,
    input.transport,
    renderer,
    queueConsumer,
    settingsRepository,
    deliveryLogRepository,
    input.commercial,
  );

  return { provider, updates };
}

describe("WhatsAppProvider notification_queue commercial enforcement", () => {
  it("1. entitlement denied → no Meta call, terminal failed (no retry reschedule)", async () => {
    const transport = new StubTransport();
    const updates: QueueUpdate[] = [];
    const { provider } = buildProvider({
      transport,
      commercial: commercial(false, undefined, "not_entitled"),
      updates,
    });

    const result = await (provider as unknown as {
      processQueueItem: (
        item: NotificationQueueItem,
        settings: CompanyWhatsAppSettings,
        retryPolicy: { evaluate: (n: number) => { shouldRetry: boolean; nextAttempt: number; delayMs: number } },
      ) => Promise<{ status: string; messageId: string | null }>;
    }).processQueueItem(queueItem("co-a"), enabledSettings("co-a"), {
      evaluate: () => ({ shouldRetry: true, nextAttempt: 1, delayMs: 1000 }),
    });

    assert.equal(transport.sendCalls, 0);
    assert.equal(result.status, "failed");
    assert.equal(result.messageId, null);
    const terminal = updates.find((u) => u.queueId === "queue-1" && u.status === "failed");
    assert.ok(terminal);
    assert.equal(terminal?.rescheduleAt, undefined);
  });

  it("2. quota exceeded → no Meta call", async () => {
    const transport = new StubTransport();
    const { provider } = buildProvider({
      transport,
      commercial: commercial(false, undefined, "quota_exceeded"),
    });

    const result = await (provider as unknown as {
      processQueueItem: (
        item: NotificationQueueItem,
        settings: CompanyWhatsAppSettings,
        retryPolicy: { evaluate: (n: number) => { shouldRetry: boolean; nextAttempt: number; delayMs: number } },
      ) => Promise<{ status: string }>;
    }).processQueueItem(queueItem("co-a"), enabledSettings("co-a"), {
      evaluate: () => ({ shouldRetry: true, nextAttempt: 1, delayMs: 1000 }),
    });

    assert.equal(transport.sendCalls, 0);
    assert.equal(result.status, "failed");
  });

  it("3. successful Meta send with wamid → exactly one usage record", async () => {
    const transport = new StubTransport();
    const usage = { recordCalls: 0, keys: [] as string[] };
    const { provider } = buildProvider({
      transport,
      commercial: commercial(true, usage),
    });

    const result = await (provider as unknown as {
      processQueueItem: (
        item: NotificationQueueItem,
        settings: CompanyWhatsAppSettings,
        retryPolicy: { evaluate: (n: number) => { shouldRetry: boolean; nextAttempt: number; delayMs: number } },
      ) => Promise<{ status: string; messageId: string | null }>;
    }).processQueueItem(queueItem("co-a"), enabledSettings("co-a"), {
      evaluate: () => ({ shouldRetry: false, nextAttempt: 1, delayMs: 0 }),
    });

    assert.equal(transport.sendCalls, 1);
    assert.equal(result.status, "completed");
    assert.equal(result.messageId, "wamid.queue-1");
    assert.equal(usage.recordCalls, 1);
    assert.deepEqual(usage.keys, ["co-a:wamid.queue-1"]);
  });

  it("4. Meta failure → zero usage events", async () => {
    const transport = new StubTransport();
    transport.mode = "fail";
    const usage = { recordCalls: 0, keys: [] as string[] };
    const { provider } = buildProvider({
      transport,
      commercial: commercial(true, usage),
    });

    const result = await (provider as unknown as {
      processQueueItem: (
        item: NotificationQueueItem,
        settings: CompanyWhatsAppSettings,
        retryPolicy: { evaluate: (n: number) => { shouldRetry: boolean; nextAttempt: number; delayMs: number } },
      ) => Promise<{ status: string }>;
    }).processQueueItem(queueItem("co-a"), enabledSettings("co-a"), {
      evaluate: () => ({ shouldRetry: true, nextAttempt: 1, delayMs: 1000 }),
    });

    assert.equal(usage.recordCalls, 0);
    assert.equal(result.status, "failed");
  });

  it("5. null wamid → zero usage events and failed queue item", async () => {
    const transport = new StubTransport();
    transport.mode = "null_id";
    const usage = { recordCalls: 0, keys: [] as string[] };
    const { provider } = buildProvider({
      transport,
      commercial: commercial(true, usage),
    });

    const result = await (provider as unknown as {
      processQueueItem: (
        item: NotificationQueueItem,
        settings: CompanyWhatsAppSettings,
        retryPolicy: { evaluate: (n: number) => { shouldRetry: boolean; nextAttempt: number; delayMs: number } },
      ) => Promise<{ status: string; messageId: string | null }>;
    }).processQueueItem(queueItem("co-a"), enabledSettings("co-a"), {
      evaluate: () => ({ shouldRetry: true, nextAttempt: 1, delayMs: 1000 }),
    });

    assert.equal(usage.recordCalls, 0);
    assert.equal(result.status, "failed");
    assert.equal(result.messageId, null);
  });

  it("6. retry after failed send → meters once on eventual wamid success", async () => {
    const transport = new StubTransport();
    transport.mode = "fail";
    const usage = { recordCalls: 0, keys: [] as string[] };
    const { provider } = buildProvider({
      transport,
      commercial: commercial(true, usage),
    });

    const failedItem = { ...queueItem("co-a"), retryCount: 0 };
    await (provider as unknown as {
      processQueueItem: (
        item: NotificationQueueItem,
        settings: CompanyWhatsAppSettings,
        retryPolicy: { evaluate: (n: number) => { shouldRetry: boolean; nextAttempt: number; delayMs: number } },
      ) => Promise<unknown>;
    }).processQueueItem(failedItem, enabledSettings("co-a"), {
      evaluate: () => ({ shouldRetry: true, nextAttempt: 1, delayMs: 1000 }),
    });

    transport.mode = "success";
    transport.sendCalls = 0;
    const retryItem = { ...queueItem("co-a"), retryCount: 1 };
    await (provider as unknown as {
      processQueueItem: (
        item: NotificationQueueItem,
        settings: CompanyWhatsAppSettings,
        retryPolicy: { evaluate: (n: number) => { shouldRetry: boolean; nextAttempt: number; delayMs: number } },
      ) => Promise<{ status: string }>;
    }).processQueueItem(retryItem, enabledSettings("co-a"), {
      evaluate: () => ({ shouldRetry: false, nextAttempt: 2, delayMs: 0 }),
    });

    assert.equal(usage.recordCalls, 1);
  });

  it("9. metering failure after send → no second Meta call", async () => {
    const transport = new StubTransport();
    let recordAttempts = 0;
    const failingCommercial: WhatsAppMessagesCommercialPort = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        recordAttempts += 1;
        return { recorded: false, reason: "ingest_failed" };
      },
    };
    const { provider } = buildProvider({
      transport,
      commercial: failingCommercial,
    });

    const result = await (provider as unknown as {
      processQueueItem: (
        item: NotificationQueueItem,
        settings: CompanyWhatsAppSettings,
        retryPolicy: { evaluate: (n: number) => { shouldRetry: boolean; nextAttempt: number; delayMs: number } },
      ) => Promise<{ status: string }>;
    }).processQueueItem(queueItem("co-a"), enabledSettings("co-a"), {
      evaluate: () => ({ shouldRetry: false, nextAttempt: 1, delayMs: 0 }),
    });

    assert.equal(transport.sendCalls, 1);
    assert.equal(recordAttempts, 1);
    assert.equal(result.status, "completed");
  });

  it("8. company isolation on commercial check", async () => {
    const usageByCompany: Record<string, number> = { "co-a": 0, "co-b": 5 };
    const port: WhatsAppMessagesCommercialPort = {
      async checkAccess(input) {
        const usage = usageByCompany[input.companyId] ?? 0;
        return usage >= 3
          ? { allowed: false, reason: "quota_exceeded" }
          : { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        return { recorded: true };
      },
    };

    const transportA = new StubTransport();
    const transportB = new StubTransport();
    const providerA = buildProvider({ transport: transportA, commercial: port }).provider;
    const providerB = buildProvider({ transport: transportB, commercial: port }).provider;

    const ok = await (providerA as unknown as {
      processQueueItem: (
        item: NotificationQueueItem,
        settings: CompanyWhatsAppSettings,
        retryPolicy: { evaluate: (n: number) => { shouldRetry: boolean; nextAttempt: number; delayMs: number } },
      ) => Promise<{ status: string }>;
    }).processQueueItem(queueItem("co-a"), enabledSettings("co-a"), {
      evaluate: () => ({ shouldRetry: false, nextAttempt: 1, delayMs: 0 }),
    });

    const blocked = await (providerB as unknown as {
      processQueueItem: (
        item: NotificationQueueItem,
        settings: CompanyWhatsAppSettings,
        retryPolicy: { evaluate: (n: number) => { shouldRetry: boolean; nextAttempt: number; delayMs: number } },
      ) => Promise<{ status: string }>;
    }).processQueueItem(queueItem("co-b", "queue-b"), enabledSettings("co-b"), {
      evaluate: () => ({ shouldRetry: true, nextAttempt: 1, delayMs: 1000 }),
    });

    assert.equal(ok.status, "completed");
    assert.equal(transportA.sendCalls, 1);
    assert.equal(blocked.status, "failed");
    assert.equal(transportB.sendCalls, 0);
  });
});

describe("WhatsAppProvider commercial adapter source metadata", () => {
  it("10. queue path uses notification_queue ingest source via adapter options", async () => {
    const { createWhatsAppMessagesCommercialPort } = await import(
      "./whatsapp-messages-commercial-adapter.js"
    );
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        if (fn === "ingest_usage_event") calls.push(args);
        return { data: "usage-1", error: null };
      },
      from: () => ({}) as never,
    } as never;

    const port = createWhatsAppMessagesCommercialPort(client);
    await port.recordUsage({
      companyId: "co-a",
      externalMessageId: "wamid.q",
      usageSource: "notification_queue",
      referenceType: "notification_queue",
      referenceId: "queue-1",
    });

    assert.equal(calls[0]?.p_source, "notification_queue");
    assert.equal(calls[0]?.p_metric_code, "whatsapp_messages");
    assert.equal(calls[0]?.p_reference_type, "notification_queue");
    assert.equal(calls[0]?.p_idempotency_key, "whatsapp_messages:co-a:wamid.q");
  });
});
