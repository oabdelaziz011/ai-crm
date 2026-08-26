import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPhoneForDisplay,
  resolveContactDisplayName,
} from "./contact-display.js";

describe("resolveContactDisplayName — new WhatsApp sender", () => {
  it("shows +20 phone for unknown WhatsApp sender instead of profile nickname or Visitor", () => {
    const name = resolveContactDisplayName({
      name: null,
      channelUsername: "Some WA Nickname",
      channel: "whatsapp",
      metadataPhone: "201099988877",
      conversationId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      visitorLabel: "Visitor",
    });
    assert.equal(name, "+201099988877");
  });

  it("switches to CRM customer name once linked", () => {
    const name = resolveContactDisplayName({
      name: "عميل تجريبي",
      channel: "whatsapp",
      phone: "01099988877",
      metadataPhone: "201099988877",
      visitorLabel: "Visitor",
    });
    assert.equal(name, "عميل تجريبي");
  });

  it("formats local 010… as +20…", () => {
    assert.equal(formatPhoneForDisplay("01099988877"), "+201099988877");
  });
});
