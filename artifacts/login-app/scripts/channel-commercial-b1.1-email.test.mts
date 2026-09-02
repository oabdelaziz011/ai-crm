/**
 * B1.1 — email direct send + local queue commercial enforcement.
 * Run: npx tsx --test scripts/channel-commercial-b1.1-email.test.mts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EmailProvider,
  createEmailProvider,
} from "../src/lib/notifications/providers/email/services/email-provider.ts";
import type { EmailTransport } from "../src/lib/notifications/providers/email/types/email-types.ts";
import type { EmailsSentCommercialPort } from "@workspace/channel-platform";

class StubEmailTransport implements EmailTransport {
  readonly provider = "stub-smtp";
  sendCalls = 0;

  async send(): Promise<void> {
    this.sendCalls += 1;
  }

  async healthCheck() {
    return { ok: true, provider: this.provider, latencyMs: 1 };
  }
}

function emailCommercial(allowed: boolean): EmailsSentCommercialPort {
  return {
    async checkAccess() {
      return { allowed, reason: allowed ? "entitled" : "not_entitled" };
    },
    async recordUsage() {
      return { recorded: false, reason: "test" };
    },
  };
}

const settingsRepo = {
  getSecure: async () => ({
    enabled: true,
    smtpHost: "smtp.test",
    smtpPort: 587,
    smtpUsername: "u",
    smtpPassword: "p",
    smtpEncryption: "starttls" as const,
    fromEmail: "from@test.com",
    fromName: "Test",
    maxRetryCount: 3,
  }),
};

describe("B1.1 email direct send", () => {
  it("sendDirect + email entitlement → ALLOW", async () => {
    const transport = new StubEmailTransport();
    const provider = new EmailProvider(
      {} as never,
      transport,
      { renderEvent: () => ({ subject: "s", html: "h", text: "t" }) } as never,
      { listPendingEmail: async () => [], markProcessing: async () => {}, markCompleted: async () => {}, markFailed: async () => {} } as never,
      settingsRepo as never,
      { append: async () => {} } as never,
      emailCommercial(true),
    );
    await provider.sendDirect("company-1", {
      to: "to@test.com",
      subject: "s",
      html: "h",
      text: "t",
    });
    assert.equal(transport.sendCalls, 1);
  });

  it("sendDirect without email entitlement → DENY", async () => {
    const transport = new StubEmailTransport();
    const provider = new EmailProvider(
      {} as never,
      transport,
      { renderEvent: () => ({ subject: "s", html: "h", text: "t" }) } as never,
      { listPendingEmail: async () => [], markProcessing: async () => {}, markCompleted: async () => {}, markFailed: async () => {} } as never,
      settingsRepo as never,
      { append: async () => {} } as never,
      emailCommercial(false),
    );
    await assert.rejects(
      () =>
        provider.sendDirect("company-1", {
          to: "to@test.com",
          subject: "s",
          html: "h",
          text: "t",
        }),
      /not entitled/,
    );
    assert.equal(transport.sendCalls, 0);
  });

  it("createEmailProvider without commercial port → throws", () => {
    assert.throws(
      () =>
        createEmailProvider(
          {} as never,
          new StubEmailTransport(),
          { renderEvent: () => ({ subject: "s", html: "h", text: "t" }) } as never,
          {} as never,
        ),
      /requires emailsSentCommercial/,
    );
  });
});

describe("B1.1 local email queue", () => {
  it("processQueueItem without entitlement → DENY before SMTP", async () => {
    const transport = new StubEmailTransport();
    const provider = new EmailProvider(
      {} as never,
      transport,
      { renderEvent: () => ({ subject: "s", html: "h", text: "t" }) } as never,
      {
        listPendingEmail: async () => [
          {
            id: "q1",
            companyId: "company-1",
            notificationId: "n1",
            channel: "email",
            payload: { event: "generic_system", params: { to: "to@test.com" } },
            retryCount: 0,
          },
        ],
        markProcessing: async () => {},
        markCompleted: async () => {},
        markFailed: async () => {},
      } as never,
      settingsRepo as never,
      { append: async () => {} } as never,
      emailCommercial(false),
    );
    const result = await provider.processPending("company-1", 1);
    assert.equal(result.failed, 1);
    assert.equal(transport.sendCalls, 0);
  });
});
