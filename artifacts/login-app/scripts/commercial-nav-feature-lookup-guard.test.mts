import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(here, "../src/hooks/billing/use-commercial-feature-lookup.ts"),
  "utf8",
);

describe("useCommercialFeatureLookup — desk-agent commercial nav gate", () => {
  it("gates commercial nav via is_feature_enabled (hasCompanyFeature), not billing entitlements catalog", () => {
    assert.match(source, /hasCompanyFeature/);
    assert.match(source, /BILLING_FEATURE_CODES/);
    // Executable imports/calls only — comments may mention the forbidden RPC.
    const executable = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(
      executable,
      /getCompanyFeatureEntitlements|get_company_entitlements|useCompanyEntitlements/,
    );
  });

  it("documents why get_company_entitlements must not gate Omnichannel for desk roles", () => {
    assert.match(source, /Human Handoff Agent/);
    assert.match(source, /billing\.view/);
  });
});
