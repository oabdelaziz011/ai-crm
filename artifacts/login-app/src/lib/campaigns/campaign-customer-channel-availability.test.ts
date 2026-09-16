/**
 * Manual audience picker: channel checkmarks from phone/email/conversation presence.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMPAIGN_PICKER_CHANNEL_COLUMNS,
  buildMessagingPresence,
  customerHasPickerChannel,
} from "./campaign-customer-channel-availability.ts";

describe("campaign customer channel availability", () => {
  it("shows Messenger, WhatsApp, Instagram, Email, and SMS columns", () => {
    assert.deepEqual([...CAMPAIGN_PICKER_CHANNEL_COLUMNS], [
      "messenger",
      "whatsapp",
      "instagram",
      "email",
      "sms",
    ]);
  });

  it("marks WhatsApp and SMS from a phone candidate, email from a valid address", () => {
    const customer = {
      phone: "01012345678",
      phone_e164: "+201012345678",
      email: "guest@example.com",
    };
    const empty = new Map();
    assert.equal(
      customerHasPickerChannel({ customer, customerId: "c1", channel: "whatsapp", messagingPresence: empty }),
      true,
    );
    assert.equal(
      customerHasPickerChannel({ customer, customerId: "c1", channel: "sms", messagingPresence: empty }),
      true,
    );
    assert.equal(
      customerHasPickerChannel({ customer, customerId: "c1", channel: "email", messagingPresence: empty }),
      true,
    );
    assert.equal(
      customerHasPickerChannel({ customer, customerId: "c1", channel: "instagram", messagingPresence: empty }),
      false,
    );
    assert.equal(
      customerHasPickerChannel({ customer, customerId: "c1", channel: "messenger", messagingPresence: empty }),
      false,
    );
  });

  it("does not invent Instagram or Messenger identities without a conversation", () => {
    const presence = buildMessagingPresence([
      { customer_id: "c1", channel_type: "instagram" },
      { customer_id: "c1", channel_type: "messenger" },
      { customer_id: null, channel_type: "instagram" },
      { customer_id: "c2", channel_type: "email" },
    ]);
    assert.equal(presence.get("c1")?.has("instagram"), true);
    assert.equal(presence.get("c1")?.has("messenger"), true);
    assert.equal(presence.has("c2"), false);

    const customer = { phone: null, email: null };
    assert.equal(
      customerHasPickerChannel({
        customer,
        customerId: "c1",
        channel: "instagram",
        messagingPresence: presence,
      }),
      true,
    );
    assert.equal(
      customerHasPickerChannel({
        customer,
        customerId: "c2",
        channel: "messenger",
        messagingPresence: presence,
      }),
      false,
    );
  });

  it("rejects invalid or missing email and phone", () => {
    const empty = new Map();
    const customer = { phone: "   ", email: "not-an-email" };
    assert.equal(
      customerHasPickerChannel({ customer, customerId: "c9", channel: "whatsapp", messagingPresence: empty }),
      false,
    );
    assert.equal(
      customerHasPickerChannel({ customer, customerId: "c9", channel: "sms", messagingPresence: empty }),
      false,
    );
    assert.equal(
      customerHasPickerChannel({ customer, customerId: "c9", channel: "email", messagingPresence: empty }),
      false,
    );
  });
});
