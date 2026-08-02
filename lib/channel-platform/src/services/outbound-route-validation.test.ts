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
});

describe("requiresServerOutboundDispatch", () => {
  it("requires server dispatch for credential channels", () => {
    assert.equal(requiresServerOutboundDispatch("whatsapp"), true);
    assert.equal(requiresServerOutboundDispatch("email"), true);
  });

  it("allows browser dispatch for web_chat", () => {
    assert.equal(requiresServerOutboundDispatch("web_chat"), false);
  });
});
