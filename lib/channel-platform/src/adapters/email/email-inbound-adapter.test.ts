import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EmailInboundAdapter } from "./email-inbound-adapter.js";

describe("EmailInboundAdapter", () => {
  it("builds webhook payload with html variants and attachments", async () => {
    const adapter = new EmailInboundAdapter();
    const parsed = await adapter.parseStructuredInbound({
      messageId: "<msg-1@example.com>",
      from: { email: "customer@example.com", name: "Customer" },
      to: [{ email: "support@company.com" }],
      subject: "Help",
      htmlOriginal: "<p>Need help</p>",
      attachments: [
        {
          filename: "invoice.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          url: "https://files.example/invoice.pdf",
        },
      ],
    });

    const payload = adapter.buildWebhookPayload(parsed, "thread-root@example.com");
    assert.equal(payload.resolvedExternalThreadId, "thread-root@example.com");
    assert.equal(payload.senderExternalId, "customer@example.com");
    assert.equal(payload.textPlain, "Need help");
    assert.equal(Array.isArray(payload.attachments), true);
    assert.equal((payload.attachments as unknown[]).length, 1);
  });
});
