import assert from "node:assert/strict";
import { isEntitlementConfiguredOn } from "../src/lib/billing/entitlement-display.ts";

assert.equal(
  isEntitlementConfiguredOn(
    { enabled: false, override_state: "enabled", source: "manual", feature_code: "leads", is_commercial: true },
    { pendingReview: true },
  ),
  true,
  "pending + override_state=enabled => configured on",
);

assert.equal(
  isEntitlementConfiguredOn(
    { enabled: false, override_state: "enabled", source: "manual", feature_code: "leads", is_commercial: true },
    { pendingReview: false },
  ),
  false,
  "approved review uses runtime enabled only",
);

assert.equal(
  isEntitlementConfiguredOn(
    { enabled: true, override_state: null, source: "package", feature_code: "bookings", is_commercial: true },
    { pendingReview: false },
  ),
  true,
);

assert.equal(
  isEntitlementConfiguredOn(
    { enabled: false, override_state: null, source: "none", feature_code: "leads", is_commercial: true },
    { pendingReview: true },
  ),
  false,
);

console.log("PASS entitlement-configured-on.test.mts");
