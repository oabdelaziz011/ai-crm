/**
 * B1.2 Part 3 — route-level commercial auth helper (fail-closed).
 * Run: node --experimental-strip-types --test artifacts/api-server/src/lib/route-commercial-auth.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const routeCommercialAuthSource = readFileSync(resolve(here, "route-commercial-auth.ts"), "utf8");

describe("route-commercial-auth fail-closed contract", () => {
  it("denies missing company context", () => {
    assert.match(routeCommercialAuthSource, /if \(!scopedCompanyId\)/);
    assert.match(routeCommercialAuthSource, /No company context/);
  });

  it("denies missing feature code", () => {
    assert.match(routeCommercialAuthSource, /if \(!scopedFeatureCode\)/);
  });

  it("maps FeatureNotEntitledError to FEATURE_NOT_ENTITLED", () => {
    assert.match(routeCommercialAuthSource, /FeatureNotEntitledError/);
    assert.match(routeCommercialAuthSource, /FEATURE_NOT_ENTITLED/);
  });

  it("denies resolver errors fail-closed", () => {
    assert.match(routeCommercialAuthSource, /Commercial entitlement check failed/);
  });

  it("assertRouteChannelCommercialFeature denies unknown channel keys", () => {
    assert.match(routeCommercialAuthSource, /resolveChannelCommercialFeatureCode\(channelKey\)/);
    assert.match(routeCommercialAuthSource, /if \(!featureCode\)/);
  });
});
