import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTicketResolutionMessage,
  hasTicketCloseCustomerNotified,
  interpolateTicketTemplate,
  normalizeTicketOriginChannel,
  resolveTicketOriginChannel,
} from "./ticket-origin-channel.ts";

describe("ticket origin channel", () => {
  it("normalizes aliases into canonical channel keys", () => {
    assert.equal(normalizeTicketOriginChannel("WhatsApp"), "whatsapp");
    assert.equal(normalizeTicketOriginChannel("mail"), "email");
    assert.equal(normalizeTicketOriginChannel("facebook"), "messenger");
    assert.equal(normalizeTicketOriginChannel("ig"), "instagram");
    assert.equal(normalizeTicketOriginChannel("unknown"), null);
  });

  it("prefers live conversation channel over denormalized origin snapshot", () => {
    assert.equal(
      resolveTicketOriginChannel({
        originChannel: "email",
        conversationChannelType: "whatsapp",
        metadata: { channelKey: "messenger" },
      }),
      "whatsapp",
    );
    assert.equal(
      resolveTicketOriginChannel({
        originChannel: "instagram",
        conversationChannelType: null,
        metadata: { source: "email" },
      }),
      "instagram",
    );
    assert.equal(
      resolveTicketOriginChannel({
        originChannel: null,
        conversationChannelType: null,
        metadata: null,
      }),
      null,
    );
  });

  it("interpolates localized resolution templates", () => {
    const en = buildTicketResolutionMessage({
      ticketNumber: "TKT-000136",
      customerName: "Amr",
      template:
        "Hello {{customer_name}},\n\nYour support request {{ticket_number}} has been successfully resolved.\n\nThank you.",
    });
    assert.match(en, /TKT-000136/);
    assert.match(en, /Amr/);
    assert.match(en, /successfully resolved/);

    const ar = interpolateTicketTemplate(
      "مرحبًا {{customer_name}}،\n\nتم حل طلب الدعم رقم {{ticket_number}} بنجاح.",
      { customer_name: "عمرو", ticket_number: "TKT-000136" },
    );
    assert.match(ar, /TKT-000136/);
    assert.match(ar, /عمرو/);
  });

  it("detects prior close-notify metadata for idempotency", () => {
    assert.equal(hasTicketCloseCustomerNotified(null), false);
    assert.equal(hasTicketCloseCustomerNotified({}), false);
    assert.equal(
      hasTicketCloseCustomerNotified({ customerCloseNotifiedAt: "2026-09-21T00:00:00.000Z" }),
      true,
    );
  });
});
