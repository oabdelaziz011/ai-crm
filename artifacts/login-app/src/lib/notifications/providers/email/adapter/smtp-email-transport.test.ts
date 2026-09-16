import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNotificationSmtpMailPayload, buildNotificationSmtpTransportOptions } from "./smtp-email-transport.ts";
import type { SmtpConfig } from "../types/email-types.ts";

describe("notification SMTP transport options (Gmail STARTTLS)", () => {
  it("uses smtp.gmail.com:587 with STARTTLS (not implicit SSL)", () => {
    const config: SmtpConfig = {
      host: "smtp.gmail.com",
      port: 587,
      username: "support@example.com",
      password: "app-password-not-logged",
      encryption: "starttls",
      fromEmail: "support@example.com",
      fromName: "ValueOR Support",
    };
    const options = buildNotificationSmtpTransportOptions(config);
    assert.equal(options.host, "smtp.gmail.com");
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    assert.equal(options.auth?.user, "support@example.com");
    assert.equal(options.tls, undefined);
  });

  it("includes campaign attachments on the SMTP payload", () => {
    const config: SmtpConfig = {
      host: "smtp.gmail.com",
      port: 587,
      username: "support@example.com",
      password: "app-password-not-logged",
      encryption: "starttls",
      fromEmail: "support@example.com",
      fromName: "ValueOR Support",
    };
    const payload = buildNotificationSmtpMailPayload(
      {
        to: "guest@example.com",
        subject: "Spring sale",
        html: "<p>Offer</p>",
        text: "Offer",
        attachments: [
          {
            filename: "offer.pdf",
            content: new Uint8Array([1, 2, 3]),
            contentType: "application/pdf",
          },
        ],
      },
      config,
    );
    assert.equal(payload.subject, "Spring sale");
    assert.equal(payload.attachments.length, 1);
    assert.equal(payload.attachments[0]?.filename, "offer.pdf");
    assert.equal(payload.attachments[0]?.contentType, "application/pdf");
    assert.deepEqual([...payload.attachments[0]!.content], [1, 2, 3]);
  });
});
