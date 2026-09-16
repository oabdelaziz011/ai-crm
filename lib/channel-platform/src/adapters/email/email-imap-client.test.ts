import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmailImapClient } from "./email-imap-client.js";
import { validateEmailMimeType } from "./email-security.js";

describe("email IMAP fetch poison resilience", () => {
  it("allows DSN/rfc822 MIME types used by bounce reports", () => {
    assert.equal(validateEmailMimeType("text/rfc822-headers"), true);
    assert.equal(validateEmailMimeType("message/rfc822"), true);
    assert.equal(validateEmailMimeType("message/delivery-status"), true);
    assert.equal(validateEmailMimeType("application/x-msdownload"), false);
  });

  it("advances lastUid past unparseable poison and still returns later valid mail", async () => {
    const client = createEmailImapClient({
      fetchImpl: async () => [
        {
          uid: 100,
          messageId: "<dsn@bounce.example>",
          from: { email: "mailer-daemon@googlemail.com" },
          to: [{ email: "support@example.com" }],
          subject: "Delivery Status Notification (Failure)",
          text: "Delivery failed",
          attachments: [
            {
              filename: "headers.txt",
              mimeType: "application/x-msdownload",
              sizeBytes: 120,
            },
          ],
        },
        {
          uid: 101,
          messageId: "<good@customer.example>",
          from: { email: "customer@example.com", name: "Customer" },
          to: [{ email: "support@example.com" }],
          subject: "Help please",
          text: "I need help with my booking",
          attachments: [],
        },
      ],
    });

    const result = await client.fetchNewMessages({
      config: { imapHost: "imap.example.com" } as never,
      lastUid: 99,
    });

    assert.equal(result.lastUid, 101);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0]?.messageId.includes("good@customer.example"), true);
  });

  it("keeps attachment bytes on parsed IMAP messages", async () => {
    const content = Buffer.from("plain-file");
    const client = createEmailImapClient({
      fetchImpl: async () => [
        {
          uid: 7,
          messageId: "<file@customer.example>",
          from: { email: "customer@example.com" },
          to: [{ email: "support@example.com" }],
          subject: "Attachment",
          text: "See file",
          attachments: [
            {
              filename: "notes.txt",
              mimeType: "text/plain",
              sizeBytes: content.length,
              content,
            },
          ],
        },
      ],
    });

    const result = await client.fetchNewMessages({
      config: { imapHost: "imap.example.com" } as never,
      lastUid: 6,
    });
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0]?.attachments[0]?.filename, "notes.txt");
    assert.equal(result.messages[0]?.attachments[0]?.content?.toString(), "plain-file");
  });
});
