import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmailSmtpClient } from "./email-smtp-client.ts";
import type { EmailChannelConfiguration } from "./email-config.ts";

describe("EmailSmtpClient attachments", () => {
  it("sends filename, contentType, and binary content without putting URLs in the body", async () => {
    let captured: Record<string, unknown> | null = null;
    const client = new EmailSmtpClient({
      loadNodemailer: async () =>
        ({
          createTransport() {
            return {
              async sendMail(mail: Record<string, unknown>) {
                captured = mail;
                return {
                  messageId: "<smtp-1@valueor.test>",
                  accepted: [mail.to],
                  rejected: [],
                  response: "250 OK",
                  envelope: {},
                };
              },
            };
          },
        }) as unknown as typeof import("nodemailer"),
    });

    const config: EmailChannelConfiguration = {
      fromEmail: "support@company.test",
      fromName: "Support",
      smtpHost: "127.0.0.1",
      smtpPort: 1025,
      smtpUsername: "",
      smtpPassword: "",
      smtpEncryption: "none",
    };

    await client.send(config, {
      to: "customer@example.test",
      subject: "Attachment",
      text: "Email attachment E2E test.",
      attachments: [
        {
          filename: "test-attachment.txt",
          mimeType: "text/plain",
          content: Buffer.from("hello-attachment"),
        },
      ],
    });

    assert.ok(captured);
    assert.equal(captured?.text, "Email attachment E2E test.");
    assert.doesNotMatch(String(captured?.text), /https?:\/\//);
    const attachments = captured?.attachments as Array<Record<string, unknown>>;
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.filename, "test-attachment.txt");
    assert.equal(attachments[0]?.contentType, "text/plain");
    assert.equal(attachments[0]?.contentDisposition, "attachment");
    assert.equal(String(attachments[0]?.content), "hello-attachment");
    assert.equal(attachments[0]?.path, undefined);
  });
});
