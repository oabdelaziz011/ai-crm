/**
 * Gmail regression suite — protects the working App Password IMAP/SMTP baseline.
 * Does not require a live Gmail account; uses presets + adapter contracts + SMTP mocks.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_PROVIDER_PRESETS,
  inferMailboxProvider,
  resolveEmailProviderCapabilities,
} from "./email-provider-contract.ts";
import {
  createEmailProviderAdapter,
  resolveEmailProviderAdapterFromConfig,
} from "./email-provider-adapter.ts";
import { EmailCloudAdapter } from "./email-cloud-adapter.ts";
import type { EmailChannelConfiguration } from "./email-config.ts";
import { buildEmailComposerOutbound } from "./email-composer-headers.ts";

function gmailRuntimeConfig(overrides?: Partial<EmailChannelConfiguration>): EmailChannelConfiguration {
  const preset = EMAIL_PROVIDER_PRESETS.gmail;
  return {
    fromEmail: "support@example.com",
    fromName: "Support",
    smtpHost: preset.smtpHost,
    smtpPort: preset.smtpPort,
    smtpUsername: "support@example.com",
    smtpPassword: "app-password",
    smtpEncryption: preset.smtpEncryption,
    imapHost: preset.imapHost,
    imapPort: preset.imapPort,
    imapUsername: "support@example.com",
    imapPassword: "app-password",
    imapEncryption: preset.imapEncryption,
    imapMailbox: "INBOX",
    inboundProvider: "imap",
    outboundProvider: "smtp",
    mailboxProvider: "gmail",
    conversationEnabled: true,
    enabled: true,
    ...overrides,
  };
}

describe("Gmail provider regression (IMAP/SMTP App Password baseline)", () => {
  it("keeps smtp.gmail.com:587 STARTTLS and imap.gmail.com:993 SSL presets", () => {
    const preset = EMAIL_PROVIDER_PRESETS.gmail;
    assert.equal(preset.smtpHost, "smtp.gmail.com");
    assert.equal(preset.smtpPort, 587);
    assert.equal(preset.smtpEncryption, "starttls");
    assert.equal(preset.imapHost, "imap.gmail.com");
    assert.equal(preset.imapPort, 993);
    assert.equal(preset.imapEncryption, "ssl");
    assert.equal(preset.authMode, "app_password");
  });

  it("infers gmail mailbox provider from existing hosts without forcing reconnect metadata", () => {
    assert.equal(
      inferMailboxProvider({ smtpHost: "smtp.gmail.com", imapHost: "imap.gmail.com" }),
      "gmail",
    );
  });

  it("exposes IMAP+SMTP capabilities (not Microsoft OAuth)", () => {
    const caps = resolveEmailProviderCapabilities("gmail");
    assert.equal(caps.supportsImap, true);
    assert.equal(caps.supportsSmtp, true);
    assert.equal(caps.supportsOAuth, false);
    assert.equal(caps.supportsAttachments, true);
    assert.equal(caps.supportsThreading, true);
    assert.equal(caps.supportsPolling, true);
  });

  it("resolves the gmail adapter from runtime config", () => {
    const adapter = resolveEmailProviderAdapterFromConfig(gmailRuntimeConfig());
    assert.equal(adapter.mailboxProvider, "gmail");
  });

  it("testConnection outgoing uses SMTP verify path for Gmail", async () => {
    const adapter = createEmailProviderAdapter("gmail", {
      smtpClient: {
        verify: async () => ({ ok: true, latencyMs: 1 }),
        send: async () => {
          throw new Error("send should not run during verify");
        },
      } as never,
    });
    const result = await adapter.testConnection(gmailRuntimeConfig(), "outgoing");
    assert.equal(result.ok, true);
    assert.equal(result.stage, "outgoing");
  });

  it("testConnection full requires both SMTP and IMAP credentials for Gmail", async () => {
    const adapter = createEmailProviderAdapter("gmail", {
      smtpClient: {
        verify: async () => ({ ok: true, latencyMs: 1 }),
        send: async () => ({ messageId: "x", accepted: [], rejected: [] }),
      } as never,
      imapProbe: async () => ({ ok: true }),
    });
    const result = await adapter.testConnection(gmailRuntimeConfig(), "full");
    assert.equal(result.ok, true);
    assert.equal(result.stage, "full");
  });

  it("EmailCloudAdapter sendOutbound stays on SMTP for Gmail (not Graph)", async () => {
    let usedSmtp = false;
    const adapter = new EmailCloudAdapter({
      credentialsLoader: {
        loadByCompanyId: async () => ({
          fromEmail: "support@example.com",
          fromName: "Support",
          smtpHost: "smtp.gmail.com",
          smtpPort: 587,
          smtpUsername: "support@example.com",
          smtpPassword: "app-password",
          smtpEncryption: "starttls",
          imapHost: "imap.gmail.com",
          imapPort: 993,
          imapUsername: "support@example.com",
          imapPassword: "app-password",
          imapEncryption: "ssl",
          inboundProvider: "imap",
          outboundProvider: "smtp",
          mailboxProvider: "gmail",
          conversationEnabled: true,
          enabled: true,
        }),
      },
      smtpClient: {
        send: async (_config, payload) => {
          usedSmtp = true;
          assert.equal(payload.subject, "Gmail regression");
          assert.deepEqual(payload.cc, ["cc@example.com"]);
          assert.deepEqual(payload.bcc, ["bcc@example.com"]);
          return {
            messageId: "<gmail-reg@valueor.local>",
            accepted: ["to@example.com", "cc@example.com", "bcc@example.com"],
            rejected: [],
          };
        },
        verify: async () => ({ ok: true, latencyMs: 1 }),
      } as never,
      microsoftGraphClient: {
        send: async () => {
          throw new Error("Graph must not be used for Gmail");
        },
      } as never,
    });

    const formatted = adapter.formatOutbound(
      {
        companyChannel: {
          id: "ch-1",
          companyId: "co-1",
          channelKey: "email",
          configuration: { fromEmail: "support@example.com", credentialsSource: "company_email_settings" },
        },
      } as never,
      {
        text: "hello",
        externalThreadId: "thread-1",
        metadata: {
          recipientEmail: "to@example.com",
          emailSubject: "Gmail regression",
          cc: ["cc@example.com"],
          bcc: ["bcc@example.com"],
        },
      } as never,
    );

    const result = await adapter.sendOutbound(
      {
        companyChannel: {
          id: "ch-1",
          companyId: "co-1",
          channelKey: "email",
          configuration: { fromEmail: "support@example.com", credentialsSource: "company_email_settings" },
        },
      } as never,
      formatted,
    );

    assert.equal(usedSmtp, true);
    assert.equal(result.externalMessageId, "<gmail-reg@valueor.local>");
  });

  it("composer outbound headers preserve Cc/Bcc and threading for Gmail SMTP path", () => {
    const built = buildEmailComposerOutbound({
      mode: "reply_all",
      snapshot: {
        from: { email: "customer@example.com", name: "Customer" },
        to: [{ email: "support@example.com" }],
        cc: [{ email: "cc1@example.com" }, { email: "cc2@example.com" }],
        lastInboundMessageId: "<prev@mail.gmail.com>",
        references: ["<root@mail.gmail.com>", "<prev@mail.gmail.com>"],
        threadRootMessageId: "<root@mail.gmail.com>",
        subject: "Hello",
        companyMailboxes: ["support@example.com"],
      },
      bcc: ["bcc@example.com"],
    });
    assert.equal(built.mode, "reply_all");
    assert.ok(built.cc.includes("cc1@example.com"));
    assert.ok(built.cc.includes("cc2@example.com"));
    assert.ok(built.bcc.includes("bcc@example.com"));
    assert.equal(built.inReplyTo, "prev@mail.gmail.com");
    assert.ok(built.emailReferences?.includes("root@mail.gmail.com"));
  });
});
