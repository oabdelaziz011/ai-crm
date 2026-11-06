import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectReleasePublicConfig } from "./prepare-mobile-release-env.mjs";

describe("release public config", () => {
  it("accepts the production API with the recorded Supabase publishable key", () => {
    const selected = selectReleasePublicConfig({
      supabaseUrl: "https://production.supabase.co/",
      publishableKey: "sb_publishable_example",
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(selected.ok, true);
    if (selected.ok) {
      assert.equal(selected.env.EAS_BUILD_PROFILE, "production");
      assert.equal(selected.env.EXPO_PUBLIC_API_URL, "https://api.valueor.org");
      assert.equal(selected.env.EXPO_PUBLIC_SUPABASE_URL, "https://production.supabase.co");
      assert.equal(selected.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "sb_publishable_example");
    }
  });

  it("rejects a local API fallback, a service-role key, and a missing key", () => {
    const local = selectReleasePublicConfig({
      supabaseUrl: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_example",
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(local.ok, false);
    const secret = selectReleasePublicConfig({
      supabaseUrl: "https://production.supabase.co",
      publishableKey: "sb_secret_example",
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(secret.ok, false);
    if (!secret.ok) assert.equal(secret.code, "privileged_key");
    const missing = selectReleasePublicConfig({
      supabaseUrl: "https://production.supabase.co",
      publishableKey: "",
      recordedProductionHost: "production.supabase.co",
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "missing_config");
  });
});
