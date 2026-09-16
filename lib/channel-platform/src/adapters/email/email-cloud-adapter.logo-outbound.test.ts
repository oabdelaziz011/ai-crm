/**
 * Transport-layer assertions: outbound HTML with identity logo reaches SMTP/Graph payload.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmailCloudAdapter } from "./email-cloud-adapter.ts";
import type { OutboundChannelMessageDto } from "../../dto/channel-dto.js";

const LOGO_HTML =
  '<div data-email-identity-logo="1" style="margin:16px 0 8px 0;line-height:normal;font-size:14px;"><img src="https://cdn.example/email-logo.png" alt="" width="160" style="display:block;max-width:200px;height:auto;border:0;outline:none;text-decoration:none;" /></div>';

const OUTBOUND_HTML = [
  "<p>Hello Ahmed,</p><p>Thank you for contacting ValueOR.</p>",
  LOGO_HTML,
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:8px 0 0 0;"><tr><td data-valueor-email-signature="1" style="padding:0;margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827;"><p>Best regards,<br/>ValueOR Support</p></td></tr></table>',
].join("");

function assertBodyLogoSignatureOrder(html: string) {
  const bodyIdx = html.indexOf("Hello Ahmed");
  const logoIdx = html.indexOf('data-email-identity-logo="1"');
  const imgIdx = html.indexOf("<img");
  const sigIdx = html.indexOf("Best regards");
  assert.ok(bodyIdx >= 0 && logoIdx >= 0 && imgIdx >= 0 && sigIdx >= 0);
  assert.ok(bodyIdx < logoIdx, "body before logo");
  assert.ok(logoIdx < sigIdx, "logo before signature");
  assert.equal((html.match(/data-email-identity-logo="1"/g) ?? []).length, 1);
  assert.equal((html.match(/<img\b/gi) ?? []).length, 1);
}

describe("email cloud adapter outbound HTML (identity logo)", () => {
  it("formatOutbound keeps body → logo → signature HTML for SMTP/Graph payload", () => {
    const adapter = new EmailCloudAdapter();
    const message: OutboundChannelMessageDto = {
      text: "Hello Ahmed,\nThank you for contacting ValueOR.\nBest regards,\nValueOR Support",
      externalThreadId: "thread-1",
      metadata: {
        recipientEmail: "customer@example.com",
        emailSubject: "Logo placement verification",
        emailComposerMode: "compose",
        htmlSanitized: OUTBOUND_HTML,
      },
    };

    const formatted = adapter.formatOutbound(
      {
        companyChannel: {
          id: "ch-1",
          companyId: "co-1",
          channelKey: "email",
          configuration: {},
        },
      } as never,
      message,
    );

    const payload = formatted.payload as { html?: string; text?: string };
    assert.equal(typeof payload.html, "string");
    assertBodyLogoSignatureOrder(String(payload.html));
    assert.match(String(payload.html), /https:\/\/cdn\.example\/email-logo\.png/);
    // Plain text fallback must not be the only body — HTML is present for clients.
    assert.ok(String(payload.html).length > String(payload.text ?? "").length / 2);
  });

  it("formatOutbound reads nested emailOutbound.htmlSanitized the same way", () => {
    const adapter = new EmailCloudAdapter();
    const formatted = adapter.formatOutbound(
      {
        companyChannel: {
          id: "ch-1",
          companyId: "co-1",
          channelKey: "email",
          configuration: {},
        },
      } as never,
      {
        text: "plain",
        externalThreadId: "thread-2",
        metadata: {
          recipientEmail: "customer@example.com",
          emailOutbound: {
            htmlSanitized: OUTBOUND_HTML,
            recipientEmail: "customer@example.com",
            emailSubject: "Nested",
            emailComposerMode: "compose",
          },
        },
      },
    );
    const payload = formatted.payload as { html?: string };
    assertBodyLogoSignatureOrder(String(payload.html));
  });
});
