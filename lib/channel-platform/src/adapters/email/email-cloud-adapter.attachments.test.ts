import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmailCloudAdapter } from "./email-cloud-adapter.ts";
import type { EmailSmtpClient } from "./email-smtp-client.ts";
import type { EmailSmtpSendPayload, EmailSmtpSendResult } from "./email-types.ts";
import type { EmailCanonicalCredentials } from "./email-canonical-credentials.ts";

function credentials(): EmailCanonicalCredentials {
  return {
    fromEmail: "support@company.test",
    fromName: "Support",
    smtpHost: "127.0.0.1",
    smtpPort: 1025,
    smtpUsername: "",
    smtpPassword: "",
    smtpEncryption: "none",
    outboundProvider: "smtp",
    enabled: true,
    conversationEnabled: true,
  };
}

describe("EmailCloudAdapter outbound attachments", () => {
  it("formatOutbound maps attachment filename, mime, and reminted URL (not body text)", () => {
    const adapter = new EmailCloudAdapter();
    const formatted = adapter.formatOutbound(
      {
        companyChannel: {
          id: "ch-1",
          companyId: "co-1",
          channelKey: "email",
          configuration: { fromEmail: "support@company.test" },
        } as never,
      },
      {
        conversationId: "cv-1",
        companyChannelId: "ch-1",
        channelKey: "email",
        externalThreadId: "root@example.com",
        text: "Email attachment E2E test.",
        attachments: [
          {
            attachmentId: "att-1",
            type: "document",
            filename: "test-attachment.txt",
            mimeType: "text/plain",
            url: "https://storage.example/signed/test-attachment.txt",
          },
        ],
        metadata: {
          recipientEmail: "customer@example.test",
          emailSubject: "Re: help",
          inReplyTo: "inbound-1@example.com",
          emailReferences: ["root@example.com", "inbound-1@example.com"],
        },
      },
    );

    const payload = formatted.payload as EmailSmtpSendPayload;
    assert.equal(payload.to, "customer@example.test");
    assert.equal(payload.subject, "Re: help");
    assert.equal(payload.text, "Email attachment E2E test.");
    assert.doesNotMatch(payload.text, /https:\/\/storage\.example/);
    assert.equal(payload.inReplyTo, "inbound-1@example.com");
    assert.ok(payload.references?.includes("inbound-1@example.com"));
    assert.equal(payload.attachments?.length, 1);
    assert.equal(payload.attachments?.[0]?.filename, "test-attachment.txt");
    assert.equal(payload.attachments?.[0]?.mimeType, "text/plain");
    assert.equal(payload.attachments?.[0]?.url, "https://storage.example/signed/test-attachment.txt");
  });

  it("sendOutbound fetches attachment bytes and passes content (not URL) to SMTP", async () => {
    const originalFetch = globalThis.fetch;
    const captured: EmailSmtpSendPayload[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      assert.match(url, /signed\/test-attachment\.txt/);
      return new Response("hello-attachment", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }) as typeof fetch;

    const smtpClient = {
      async send(_config: unknown, payload: EmailSmtpSendPayload): Promise<EmailSmtpSendResult> {
        captured.push(payload);
        return { messageId: "<out-1@company.test>", accepted: [payload.to], rejected: [] };
      },
    } as unknown as EmailSmtpClient;

    const adapter = new EmailCloudAdapter({
      smtpClient,
      credentialsLoader: {
        async loadByCompanyId() {
          return credentials();
        },
      },
    });

    try {
      const formatted = adapter.formatOutbound(
        {
          companyChannel: {
            id: "ch-1",
            companyId: "co-1",
            channelKey: "email",
            configuration: { fromEmail: "support@company.test" },
          } as never,
        },
        {
          conversationId: "cv-1",
          companyChannelId: "ch-1",
          channelKey: "email",
          externalThreadId: "root@example.com",
          text: "Body only.",
          attachments: [
            {
              attachmentId: "att-1",
              type: "document",
              filename: "test-attachment.txt",
              mimeType: "text/plain",
              url: "https://storage.example/signed/test-attachment.txt",
            },
          ],
          metadata: {
            recipientEmail: "customer@example.test",
            emailSubject: "Attachment send",
          },
        },
      );

      const result = await adapter.sendOutbound(
        {
          companyChannel: {
            id: "ch-1",
            companyId: "co-1",
            channelKey: "email",
            configuration: { fromEmail: "support@company.test" },
          } as never,
        },
        formatted,
      );

      assert.equal(result.externalMessageId, "<out-1@company.test>");
      assert.equal(captured.length, 1);
      assert.equal(captured[0]?.attachments?.length, 1);
      assert.equal(captured[0]?.attachments?.[0]?.filename, "test-attachment.txt");
      assert.equal(captured[0]?.attachments?.[0]?.url, undefined);
      assert.equal(String(captured[0]?.attachments?.[0]?.content), "hello-attachment");
      assert.doesNotMatch(captured[0]?.text ?? "", /storage\.example/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
