import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { featureFlagEngine, licensingEngine } from "./index.js";
import type { FeatureFlagRow } from "./feature-flags/feature-flag-engine.js";

describe("Configuration Platform — feature flag engine", () => {
  const rows: FeatureFlagRow[] = [
    Object.freeze({
      featureKey: "knowledge.platform",
      scopeType: "global",
      scopeId: null,
      enabled: true,
      rolloutPercentage: 100,
      environment: "all",
      activatesAt: null,
      expiresAt: null,
      prerequisites: [],
      priority: 0,
    }),
    Object.freeze({
      featureKey: "knowledge.platform",
      scopeType: "company",
      scopeId: "co_1",
      enabled: false,
      rolloutPercentage: 100,
      environment: "all",
      activatesAt: null,
      expiresAt: null,
      prerequisites: [],
      priority: 0,
    }),
  ];

  it("prefers company scope over global", () => {
    const resolution = featureFlagEngine.resolve("knowledge.platform", rows, {
      companyId: "co_1",
      environment: "production",
    });
    assert.equal(resolution.enabled, false);
    assert.equal(resolution.source, "company");
  });

  it("defaults to enabled when no row matches", () => {
    const resolution = featureFlagEngine.resolve("public.booking", rows, {
      companyId: "co_1",
    });
    assert.equal(resolution.enabled, true);
    assert.equal(resolution.source, "default");
  });
});

describe("Configuration Platform — licensing engine", () => {
  const entitlements = Object.freeze({
    planCode: "pro",
    features: Object.freeze({ "ai.chat": true, "ai.employee": false }),
    limits: Object.freeze({ users: 50 }),
    modules: Object.freeze(["crm", "operations"]),
  });

  const activeState = Object.freeze({
    tenantId: "co_1",
    planCode: "pro",
    status: "active" as const,
    trialEndsAt: null,
    expiresAt: null,
    graceEndsAt: null,
    addOns: Object.freeze([]),
  });

  it("allows entitled features", () => {
    const result = licensingEngine.canAccess("ai.chat", entitlements, activeState);
    assert.equal(result.allowed, true);
  });

  it("denies non-entitled features", () => {
    const result = licensingEngine.canAccess("ai.employee", entitlements, activeState);
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? "", /does not include/);
  });

  it("allows add-on overrides", () => {
    const withAddon = Object.freeze({
      ...activeState,
      addOns: Object.freeze(["ai.employee"]),
    });
    const result = licensingEngine.canAccess("ai.employee", entitlements, withAddon);
    assert.equal(result.allowed, true);
  });
});
