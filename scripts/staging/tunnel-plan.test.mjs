import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stagingTunnelAllowsPrintedHost, stagingTunnelChildEnv, stagingTunnelPlan } from "./tunnel-plan.mjs";

describe("staging tunnel plan", () => {
  it("targets only the local staging listener and drops tunnel credentials", () => {
    const plan = stagingTunnelPlan(3011);
    assert.deepEqual(plan.args, ["tunnel", "--url", "http://127.0.0.1:3011", "--no-autoupdate"]);
    assert.throws(() => stagingTunnelPlan(3000), /3000/);
    const child = stagingTunnelChildEnv({ CLOUDFLARE_TUNNEL_TOKEN: "present", PORT: "3011" });
    assert.equal(child.CLOUDFLARE_TUNNEL_TOKEN, undefined);
    assert.equal(child.PORT, "3011");
  });

  it("accepts only a temporary trycloudflare hostname", () => {
    assert.equal(stagingTunnelAllowsPrintedHost("example.trycloudflare.com"), true);
    assert.equal(stagingTunnelAllowsPrintedHost("api.valueor.org"), false);
    assert.equal(stagingTunnelAllowsPrintedHost("webhook.valueor.org"), false);
  });
});
