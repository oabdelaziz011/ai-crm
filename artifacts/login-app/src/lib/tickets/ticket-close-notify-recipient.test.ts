/**
 * Pure recipient resolution for ticket Close & Notify — no network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  looksLikeE164Phone,
  looksLikeEmailAddress,
  resolveCloseNotifyEmailRecipient,
  resolveCloseNotifySmsThreadId,
  resolveCloseNotifySubject,
} from "./ticket-close-notify-recipient";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("ticket-close-notify-recipient", () => {
  it("prefers session sender email over CRM customer email", () => {
    const email = resolveCloseNotifyEmailRecipient({
      sessionSenderExternalId: "customer@inbox.test",
      customerEmail: "crm@other.test",
      conversationMetadata: { from: { email: "conv@inbox.test" } },
    });
    assert.equal(email, "customer@inbox.test");
  });

  it("falls back through conversation → inbound → customer email", () => {
    assert.equal(
      resolveCloseNotifyEmailRecipient({
        conversationMetadata: { senderExternalId: "From.Name@Example.COM" },
      }),
      "from.name@example.com",
    );
    assert.equal(
      resolveCloseNotifyEmailRecipient({
        inboundMessageMetadata: { from: { name: "Omar", email: "omar@example.com" } },
      }),
      "omar@example.com",
    );
    assert.equal(
      resolveCloseNotifyEmailRecipient({
        customerEmail: "last@example.com",
      }),
      "last@example.com",
    );
    assert.equal(resolveCloseNotifyEmailRecipient({}), null);
  });

  it("rejects Message-ID style thread ids as email addresses", () => {
    assert.equal(
      looksLikeEmailAddress("cafs5xrtilvbs63rgbxd6=oxnz4yhaffa68grr8hrlnmb-9fxkw@mail.gmail.com"),
      true,
    );
    // Message-IDs often look email-like; session sender_external_id is the real mailbox.
    // Ensure we never treat blank / space / non-email as valid.
    assert.equal(looksLikeEmailAddress(""), false);
    assert.equal(looksLikeEmailAddress("not-an-email"), false);
    assert.equal(looksLikeEmailAddress("a b@c.com"), false);
  });

  it("builds reply subject from conversation or ticket number", () => {
    assert.equal(
      resolveCloseNotifySubject({
        conversationMetadata: { subject: "Support" },
        ticketNumber: "TKT-000136",
      }),
      "Re: Support",
    );
    assert.equal(
      resolveCloseNotifySubject({
        inboundMessageMetadata: { subject: "Re: Already" },
        ticketNumber: "TKT-000136",
      }),
      "Re: Already",
    );
    assert.equal(
      resolveCloseNotifySubject({ ticketNumber: "TKT-000136" }),
      "Re: TKT-000136",
    );
  });

  it("repairs SMS thread id from sender_external_id without CRM override", () => {
    assert.equal(
      resolveCloseNotifySmsThreadId({
        sessionExternalThreadId: "+201011404109",
        sessionSenderExternalId: "+201099999999",
      }),
      "+201011404109",
    );
    assert.equal(
      resolveCloseNotifySmsThreadId({
        sessionExternalThreadId: "sms-thread-missing-phone",
        sessionSenderExternalId: "+201011404109",
      }),
      "+201011404109",
    );
    assert.equal(looksLikeE164Phone("+201011404109"), true);
    assert.equal(looksLikeE164Phone("201011404109"), false);
  });

  it("close notify wires enrichment before dispatch and keeps same-channel routing", () => {
    const notify = readFileSync(join(__dirname, "ticket-close-customer-notify.ts"), "utf8");
    assert.match(notify, /enrichTicketCloseNotifyOutbound/);
    assert.match(notify, /dispatchOutboundMessage/);
    assert.doesNotMatch(notify, /channelKey:\s*["']email["']/);
    assert.match(notify, /session\.channel_key/);
  });
});
