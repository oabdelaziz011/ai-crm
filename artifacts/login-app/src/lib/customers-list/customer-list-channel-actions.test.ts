import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  customerListDisplayTags,
  customerListEmailComposeHref,
  customerListOutboundPhone,
  resolveCustomerListChannelCapabilities,
} from "./customer-list-channel-actions.ts";

describe("customer-list-channel-actions", () => {
  it("shows channel history tags in the tags column (notes/VIP by name)", () => {
    assert.deepEqual(customerListDisplayTags(["vip", "email", "phone", "notes", "whatsapp", "sms"]), [
      "whatsapp",
      "email",
      "sms",
    ]);
    assert.deepEqual(customerListDisplayTags(["phone", "vip", "notes"]), []);
  });

  it("requires company channel/settings to be on — not entitlement alone", () => {
    const caps = resolveCustomerListChannelCapabilities({
      isSuperAdmin: true,
      commercialFeatureEnabled: () => true,
      hasPermission: () => true,
      emailEnabledInCompany: true,
      smsEnabledInCompany: false,
      whatsappEnabledInCompany: true,
    });
    assert.equal(caps.email, true);
    assert.equal(caps.sms, false);
    assert.equal(caps.whatsapp, true);
  });

  it("hides channels while company readiness is unknown", () => {
    const caps = resolveCustomerListChannelCapabilities({
      isSuperAdmin: false,
      commercialFeatureEnabled: () => true,
      hasPermission: () => true,
      emailEnabledInCompany: undefined,
      smsEnabledInCompany: null,
      whatsappEnabledInCompany: undefined,
    });
    assert.equal(caps.email, false);
    assert.equal(caps.sms, false);
    assert.equal(caps.whatsapp, false);
  });

  it("prefers phone_e164 for outbound and builds email compose href", () => {
    assert.equal(
      customerListOutboundPhone({ phone: "+2010", phone_e164: "+201011404109" }),
      "+201011404109",
    );
    assert.match(customerListEmailComposeHref("a@b.co"), /compose=\d+/);
    assert.match(customerListEmailComposeHref("a@b.co"), /to=a%40b\.co/);
  });
});
