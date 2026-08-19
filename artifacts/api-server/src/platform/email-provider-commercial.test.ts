import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmailsSentCommercialPort } from "@workspace/channel-platform";
import { EmailProvider } from "@login-app/lib/notifications/providers/email/services/email-provider";
import type { NotificationQueueItem } from "@login-app/lib/notifications/types";
import type {
  CompanyEmailSettings,
  EmailTransport,
  EmailTransportSendResult,
} from "@login-app/lib/notifications/providers/email/types/email-types";
import type { EmailRenderer } from "@login-app/lib/notifications/providers/email/renderer/email-renderer";
import type { EmailQueueConsumer } from "@login-app/lib/notifications/providers/email/services/email-queue-consumer";
import type { EmailSettingsRepository } from "@login-app/lib/notifications/providers/email/services/email-settings-repository";
import type { EmailDeliveryLogRepository } from "@login-app/lib/notifications/providers/email/services/email-delivery-log-repository";

type QueueUpdate = {
  companyId: string;
  queueId: string;
  status: string;
  retryCount?: number;
  rescheduleAt?: string;
};

class StubTransport implements EmailTransport {
  readonly provider = "smtp";
  sendCalls = 0;
  mode: "success" | "fail" = "success";

  async send(): Promise<EmailTransportSendResult> {
    this.sendCalls += 1;
    if (this.mode === "fail") throw new Error("SMTP send failed");
    return { messageId: "smtp-1", accepted: ["a@example.com"], rejected: [] };
  }

  async healthCheck() {
    return { ok: true, provider: this.provider, latencyMs: 1 };
  }
}

function enabledSettings(companyId: string): CompanyEmailSettings {
  return {
    companyId,
    enabled: true,
    conversationEnabled: false,
    inboundProvider: "imap",
    outboundProvider: "smtp",
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpUsername: "user",
    smtpPassword: "pass",
    smtpEncryption: "starttls",
    imapHost: "",
    imapPort: 993,
    imapUsername: "",
    imapPassword: "",
    imapEncryption: "ssl",
    fromEmail: "from@example.com",
    fromName: "From",
    replyToEmail: "",
    maxRetryCount: 3,
    maxAttachmentBytes: 1_000_000,
    imapMailbox: "INBOX",
    imapLastUid: 0,
    imapPollIntervalSeconds: 60,
    oauthProvider: null,
    oauthToken: "",
    hasSmtpPassword: true,
    hasImapPassword: false,
    hasOauthToken: false,
  };
}

function queueItem(companyId: string, id = "queue-1"): NotificationQueueItem {
  return {
    id,
    companyId,
    notificationId: "notif-1",
    channel: "email",
    status: "pending",
    retryCount: 0,
    scheduledAt: new Date().toISOString(),
    processedAt: null,
    lastError: null,
    payload: { event: "generic_system", params: { email: "a@example.com" } },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildProvider(input: {
  transport: StubTransport;
  commercial?: EmailsSentCommercialPort;
  pending?: NotificationQueueItem[];
  updates?: QueueUpdate[];
}) {
  const updates = input.updates ?? [];
  const pending = input.pending ?? [queueItem("company-1")];
  const queueConsumer = {
    async listPendingEmail() {
      return pending;
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
  } as unknown as EmailQueueConsumer;

  const settingsRepository = {
    async getSecure(companyId: string) {
      return enabledSettings(companyId);
    },
  } as unknown as EmailSettingsRepository;

  const deliveryLogRepository = {
    async append() {},
  } as unknown as EmailDeliveryLogRepository;

  const renderer = {
    renderEvent() {
      return {
        subject: "Hello",
        html: "<p>Hello</p>",
        text: "Hello",
        templateKey: "generic_system",
      };
    },
  } as unknown as EmailRenderer;

  const provider = new EmailProvider(
    {} as never,
    input.transport,
    renderer,
    queueConsumer,
    settingsRepository,
    deliveryLogRepository,
    input.commercial,
  );

  return { provider, updates };
}

describe("EmailProvider notification_queue commercial enforcement", () => {
  it("1. entitlement denied → SMTP not called, no retry reschedule", async () => {
    const transport = new StubTransport();
    const updates: QueueUpdate[] = [];
    const { provider } = buildProvider({
      transport,
      updates,
      commercial: {
        async checkAccess() {
          return { allowed: false, reason: "not_entitled" };
        },
        async recordUsage() {
          return { recorded: true };
        },
      },
    });
    const result = await provider.processPending("company-1");
    assert.equal(transport.sendCalls, 0);
    assert.equal(result.failed, 1);
    assert.equal(updates.some((u) => u.status === "failed" && !u.rescheduleAt), true);
  });

  it("2. quota exceeded → SMTP not called", async () => {
    const transport = new StubTransport();
    const { provider } = buildProvider({
      transport,
      commercial: {
        async checkAccess() {
          return { allowed: false, reason: "quota_exceeded" };
        },
        async recordUsage() {
          return { recorded: true };
        },
      },
    });
    await provider.processPending("company-1");
    assert.equal(transport.sendCalls, 0);
  });

  it("3/6. SMTP success → exactly one usage event quantity path", async () => {
    const transport = new StubTransport();
    const recorded: Array<{ companyId: string; queueId: string }> = [];
    const { provider } = buildProvider({
      transport,
      commercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage(input) {
          recorded.push(input);
          return { recorded: true };
        },
      },
    });
    const result = await provider.processPending("company-1");
    assert.equal(transport.sendCalls, 1);
    assert.equal(result.completed, 1);
    assert.equal(recorded.length, 1);
    assert.deepEqual(recorded[0], { companyId: "company-1", queueId: "queue-1" });
  });

  it("7. SMTP failure → zero usage", async () => {
    const transport = new StubTransport();
    transport.mode = "fail";
    let recordCalls = 0;
    const { provider } = buildProvider({
      transport,
      commercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          recordCalls += 1;
          return { recorded: true };
        },
      },
    });
    await provider.processPending("company-1");
    assert.equal(transport.sendCalls, 1);
    assert.equal(recordCalls, 0);
  });

  it("8. retry after SMTP failure then success → one usage event", async () => {
    const transport = new StubTransport();
    const recorded: string[] = [];
    const commercial: EmailsSentCommercialPort = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage(input) {
        recorded.push(input.queueId);
        return { recorded: true };
      },
    };
    transport.mode = "fail";
    const first = buildProvider({ transport, commercial, pending: [queueItem("company-1")] });
    await first.provider.processPending("company-1");
    assert.equal(recorded.length, 0);

    transport.mode = "success";
    const retryItem = { ...queueItem("company-1"), retryCount: 1 };
    const second = buildProvider({ transport, commercial, pending: [retryItem] });
    await second.provider.processPending("company-1");
    assert.deepEqual(recorded, ["queue-1"]);
  });

  it("10. metering failure after SMTP success does not resend", async () => {
    const transport = new StubTransport();
    const { provider } = buildProvider({
      transport,
      commercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          throw new Error("ingest failed");
        },
      },
    });
    const result = await provider.processPending("company-1");
    assert.equal(transport.sendCalls, 1);
    assert.equal(result.completed, 1);
  });

  it("11. company isolation on commercial check", async () => {
    const usage: Record<string, number> = { "company-1": 0, "company-b": 9 };
    const commercial: EmailsSentCommercialPort = {
      async checkAccess(input) {
        return usage[input.companyId] >= 5
          ? { allowed: false, reason: "quota_exceeded" }
          : { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        return { recorded: true };
      },
    };
    const transportA = new StubTransport();
    const transportB = new StubTransport();
    await buildProvider({
      transport: transportA,
      commercial,
      pending: [queueItem("company-1")],
    }).provider.processPending("company-1");
    await buildProvider({
      transport: transportB,
      commercial,
      pending: [queueItem("company-b")],
    }).provider.processPending("company-b");
    assert.equal(transportA.sendCalls, 1);
    assert.equal(transportB.sendCalls, 0);
  });

  it("14. sendDirect/test path does not record usage", async () => {
    const transport = new StubTransport();
    let recordCalls = 0;
    const { provider } = buildProvider({
      transport,
      commercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          recordCalls += 1;
          return { recorded: true };
        },
      },
    });
    await provider.sendDirect("company-1", {
      to: "a@example.com",
      subject: "t",
      html: "<p>t</p>",
      text: "t",
      queueId: "test",
    });
    assert.equal(transport.sendCalls, 1);
    assert.equal(recordCalls, 0);
  });

  it("17. commercial access failure fails closed", async () => {
    const transport = new StubTransport();
    const { provider } = buildProvider({
      transport,
      commercial: {
        async checkAccess() {
          return { allowed: false, reason: "entitlement_error" };
        },
        async recordUsage() {
          return { recorded: true };
        },
      },
    });
    await provider.processPending("company-1");
    assert.equal(transport.sendCalls, 0);
  });
});
