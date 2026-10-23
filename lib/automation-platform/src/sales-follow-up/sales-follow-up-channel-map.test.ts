import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SALES_FOLLOW_UP_OMNI_CHANNEL_KEY } from "./sales-follow-up-channel-map.js";

describe("sales follow-up omnichannel channel map", () => {
  it("reuses existing outbound keys and maps facebook to messenger", () => {
    assert.equal(SALES_FOLLOW_UP_OMNI_CHANNEL_KEY.whatsapp, "whatsapp");
    assert.equal(SALES_FOLLOW_UP_OMNI_CHANNEL_KEY.web_chat, "web_chat");
    assert.equal(SALES_FOLLOW_UP_OMNI_CHANNEL_KEY.email, "email");
    assert.equal(SALES_FOLLOW_UP_OMNI_CHANNEL_KEY.instagram, "instagram");
    assert.equal(SALES_FOLLOW_UP_OMNI_CHANNEL_KEY.facebook, "messenger");
    assert.equal(SALES_FOLLOW_UP_OMNI_CHANNEL_KEY.sms, "sms");
  });
});
