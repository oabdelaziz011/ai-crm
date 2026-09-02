import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChannelCommercialEntitlementPort } from "./channel-commercial-entitlement-adapter.js";

describe("createChannelCommercialEntitlementPort", () => {
  it("returns not_entitled when is_feature_enabled is false", async () => {
    const port = createChannelCommercialEntitlementPort({
      rpc: async () => ({ data: false, error: null }),
    } as never);
    const access = await port.checkAccess({ companyId: "c1", channelKey: "instagram" });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "not_entitled");
    assert.equal(access.featureCode, "instagram_channel");
  });

  it("returns entitled when is_feature_enabled is true", async () => {
    const port = createChannelCommercialEntitlementPort({
      rpc: async () => ({ data: true, error: null }),
    } as never);
    const access = await port.checkAccess({ companyId: "c1", channelKey: "messenger" });
    assert.equal(access.allowed, true);
    assert.equal(access.featureCode, "facebook_channel");
  });

  it("fail-closed on missing company", async () => {
    const port = createChannelCommercialEntitlementPort({ rpc: async () => ({ data: true, error: null }) } as never);
    const access = await port.checkAccess({ companyId: "", channelKey: "email" });
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "entitlement_unavailable");
  });
});
