import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildChannelSenderIdentityVariables,
  buildWorkflowCustomerIdentityVariables,
} from "./channel-sender-identity.js";

describe("channel sender identity", () => {
  it("sets WhatsApp sender phone digits", () => {
    const vars = buildChannelSenderIdentityVariables({
      channelKey: "whatsapp",
      externalUserId: "+201012345678",
    });
    assert.equal(vars.whatsapp_sender_phone, "201012345678");
    assert.equal(vars.sender_phone, "201012345678");
  });

  it("does not treat Instagram IGSID as a phone", () => {
    const vars = buildChannelSenderIdentityVariables({
      channelKey: "instagram",
      externalUserId: "17841405788211234",
    });
    assert.equal(vars.whatsapp_sender_phone, undefined);
    assert.equal(vars.sender_phone, undefined);
    assert.equal(vars.sender_external_id, "17841405788211234");
  });

  it("copies linked customer phone onto workflow variables", () => {
    const vars = buildWorkflowCustomerIdentityVariables({
      id: "cust-1",
      name: "نسمة",
      phone: "01012345678",
      phoneE164: "+201012345678",
    });
    assert.deepEqual(vars.customer, {
      id: "cust-1",
      name: "نسمة",
      phone: "01012345678",
      phone_e164: "+201012345678",
    });
  });
});
