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

describe("resolveContactDisplayName — Messenger / Instagram", () => {
  it("ignores CRM placeholder Messenger {PSID} and prefers Graph senderName", () => {
    const name = resolveContactDisplayName({
      name: "Messenger 29316316074655841",
      channelUsername: "Omar Test",
      channel: "messenger",
      metadataPhone: "29316316074655841",
      conversationId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      visitorLabel: "Visitor",
    });
    assert.equal(name, "Omar Test");
  });

  it("does not render PSID as +phone when Graph name is missing", () => {
    const name = resolveContactDisplayName({
      name: "Messenger 29316316074655841",
      channel: "messenger",
      phone: "29316316074655841",
      metadataPhone: "29316316074655841",
      conversationId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      visitorLabel: "Visitor",
    });
    assert.equal(name, "Visitor EEEE");
  });

  it("prefers Instagram @username over placeholder CRM name", () => {
    const name = resolveContactDisplayName({
      name: "Instagram 17841400000000000",
      channelUsername: "valueor_demo",
      channel: "instagram",
      visitorLabel: "Visitor",
    });
    assert.equal(name, "valueor_demo");
  });
});
