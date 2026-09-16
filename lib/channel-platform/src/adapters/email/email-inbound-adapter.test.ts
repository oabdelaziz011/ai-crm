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

  it("preserves binary content through parse and webhook payload contentRef", async () => {
    const adapter = new EmailInboundAdapter();
    const parsed = await adapter.parseStructuredInbound({
      messageId: "<att@example.com>",
      from: { email: "customer@example.com" },
      to: [{ email: "support@company.com" }],
      subject: "Invoice",
      textPlain: "Please see attached",
      attachments: [
        {
          filename: "invoice.pdf",
          mimeType: "application/pdf",
          content: Buffer.from("%PDF-1.4 test"),
        },
      ],
    });
    assert.equal(parsed.attachments.length, 1);
    assert.equal(parsed.attachments[0]?.filename, "invoice.pdf");
    assert.ok(parsed.attachments[0]?.content?.toString("utf8").includes("%PDF"));

    const payload = adapter.buildWebhookPayload(parsed, "thread-root@example.com");
    const attachments = payload.attachments as Array<{ metadata?: { contentRef?: string; fileSize?: number } }>;
    assert.equal(attachments.length, 1);
    assert.equal(typeof attachments[0]?.metadata?.contentRef, "string");
    assert.ok((attachments[0]?.metadata?.contentRef ?? "").length > 0);
    assert.equal(attachments[0]?.metadata?.fileSize, Buffer.from("%PDF-1.4 test").length);

    const roundTrip = await adapter.parseStructuredInbound(payload);
    const again = adapter.buildWebhookPayload(roundTrip, "thread-root@example.com");
    const againAttachments = again.attachments as Array<{ metadata?: { contentRef?: string } }>;
    assert.equal(againAttachments[0]?.metadata?.contentRef, attachments[0]?.metadata?.contentRef);
  });

  it("derives plain text from HTML when textPlain is an empty string", async () => {
    const adapter = new EmailInboundAdapter();
    const parsed = await adapter.parseStructuredInbound({
      messageId: "<html-only@example.com>",
      from: { email: "customer@example.com" },
      to: [{ email: "support@company.com" }],
      subject: "مرحبا",
      textPlain: "",
      htmlOriginal: "<p>نص عربي فقط في HTML</p>",
    });
    assert.match(parsed.textPlain, /نص عربي/);
    assert.equal(parsed.subject, "مرحبا");
    assert.ok(parsed.messageId.includes("html-only@example.com"));
  });

  it("preserves Message-ID / In-Reply-To / References for threading", async () => {
    const adapter = new EmailInboundAdapter();
    const parsed = await adapter.parseStructuredInbound({
      messageId: "<child@example.com>",
      inReplyTo: "<parent@example.com>",
      references: ["<root@example.com>", "<parent@example.com>"],
      from: { email: "customer@example.com" },
      to: [{ email: "support@company.com" }],
      subject: "Re: Help",
      textPlain: "Follow up",
    });
    assert.equal(parsed.inReplyTo, "parent@example.com");
    assert.deepEqual(parsed.references, ["root@example.com", "parent@example.com"]);
    const payload = adapter.buildWebhookPayload(parsed, "root@example.com");
    assert.equal(payload.messageId, "child@example.com");
    assert.equal(payload.inReplyTo, "parent@example.com");
  });
});
