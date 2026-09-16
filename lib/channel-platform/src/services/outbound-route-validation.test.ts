import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateOutboundRoute } from "../services/outbound-route-validation.js";
import { requiresServerOutboundDispatch } from "../services/server-outbound-channels.js";

describe("validateOutboundRoute", () => {
  const target = {
    conversationId: "conv-1",
    companyChannelId: "cc-1",
    channelKey: "whatsapp",
    externalThreadId: "+15551234567",
  };

  it("returns route when session is complete", () => {
    const result = validateOutboundRoute(
      {
        id: "session-1",
        company_channel_id: "cc-1",
        external_thread_id: "+15551234567",
        channel_key: "whatsapp",
      },
      target,
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.route.id, "session-1");
      assert.equal(result.route.channel_key, "whatsapp");
    }
  });

  it("fails when session is missing", () => {
    const result = validateOutboundRoute(null, target);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issue.code, "missing_session");
    }
  });

  it("refuses outbound when request thread is a different customer phone than the session sender", () => {
    const result = validateOutboundRoute(
      {
        id: "session-1",
        company_channel_id: "cc-1",
        external_thread_id: "201099988877",
        channel_key: "whatsapp",
      },
      {
        ...target,
        // Existing CRM customer B phone — must NEVER replace inbound sender A.
        externalThreadId: "201011404300",
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issue.code, "recipient_thread_mismatch");
    }
  });

  it("allows Egypt local vs WA international forms of the same sender", () => {
    const result = validateOutboundRoute(
      {
        id: "session-1",
        company_channel_id: "cc-1",
        external_thread_id: "201099988877",
        channel_key: "whatsapp",
      },
      {
        ...target,
        externalThreadId: "01099988877",
      },
    );
    assert.equal(result.ok, true);
  });

  it("does not apply WhatsApp phone digit mismatch to email Message-ID threads", () => {
    const result = validateOutboundRoute(
      {
        id: "session-email",
        company_channel_id: "cc-email",
        external_thread_id: "root-msg-1@example.com",
        channel_key: "email",
      },
      {
        conversationId: "conv-email",
        companyChannelId: "cc-email",
        channelKey: "email",
        // Different Message-ID string that would confuse digit-only WhatsApp compare
        externalThreadId: "other-thread-99@example.com",
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.route.channel_key, "email");
      // Session thread wins when present
      assert.equal(result.route.external_thread_id, "root-msg-1@example.com");
    }
  });
});

describe("requiresServerOutboundDispatch", () => {
  it("requires server dispatch for credential channels", () => {
    assert.equal(requiresServerOutboundDispatch("whatsapp"), true);
    assert.equal(requiresServerOutboundDispatch("email"), true);
    assert.equal(requiresServerOutboundDispatch("sms"), true);
  });

  it("allows browser dispatch for web_chat", () => {
    assert.equal(requiresServerOutboundDispatch("web_chat"), false);
  });
});
