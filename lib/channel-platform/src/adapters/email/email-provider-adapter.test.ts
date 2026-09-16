import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmailProviderAdapter,
  resolveEmailProviderAdapterFromConfig,
} from "./email-provider-adapter.ts";
import { EMAIL_PROVIDER_ERROR_CODES } from "./email-provider-contract.ts";
import type { EmailChannelConfiguration } from "./email-config.ts";

function smtpConfig(overrides?: Partial<EmailChannelConfiguration>): EmailChannelConfiguration {
  return {
    fromEmail: "a@example.com",
    fromName: "A",
    smtpHost: "mail.example.com",
    smtpPort: 587,
    smtpUsername: "a@example.com",
    smtpPassword: "secret",
    smtpEncryption: "starttls",
    imapHost: "mail.example.com",
    imapPort: 993,
    imapUsername: "a@example.com",
    imapPassword: "secret",
    imapEncryption: "ssl",
    inboundProvider: "imap",
    outboundProvider: "smtp",
    mailboxProvider: "imap_smtp",
    ...overrides,
  };
}

describe("EmailProviderAdapter", () => {
  it("routes generic IMAP/SMTP send through SMTP client", async () => {
    let sent = false;
    const adapter = createEmailProviderAdapter("imap_smtp", {
      smtpClient: {
        send: async () => {
          sent = true;
          return { messageId: "<x@local>", accepted: ["b@example.com"], rejected: [] };
        },
        verify: async () => ({ ok: true, latencyMs: 1 }),
      } as never,
    });
    const result = await adapter.sendMessage(smtpConfig(), {
      to: ["b@example.com"],
      subject: "Hi",
      text: "body",
    });
    assert.equal(sent, true);
    assert.equal(result.messageId, "<x@local>");
  });

  it("microsoft adapter rejects send without oauth token", async () => {
    const adapter = createEmailProviderAdapter("microsoft_365");
    await assert.rejects(
      () =>
        adapter.sendMessage(smtpConfig({ mailboxProvider: "microsoft_365", oauthAccessToken: "" }), {
          to: ["b@example.com"],
          subject: "Hi",
          text: "body",
        }),
      (error: unknown) =>
        error instanceof Error && error.message === EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED,
    );
  });

  it("microsoft oauth stage fails without token", async () => {
    const adapter = createEmailProviderAdapter("microsoft_365");
    const result = await adapter.testConnection(
      smtpConfig({ mailboxProvider: "microsoft_365", oauthAccessToken: "" }),
      "oauth",
    );
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
  });

  it("resolveEmailProviderAdapterFromConfig prefers microsoft_graph outbound", () => {
    const adapter = resolveEmailProviderAdapterFromConfig(
      smtpConfig({ outboundProvider: "microsoft_graph", mailboxProvider: undefined }),
    );
    assert.equal(adapter.mailboxProvider, "microsoft_365");
  });
});
