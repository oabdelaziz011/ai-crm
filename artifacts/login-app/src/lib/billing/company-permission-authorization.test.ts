import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCompanyPermissionChecker,
  createPermissionAvailabilityChecker,
} from "./company-permission-authorization.js";
import { groupPermissionsByFeature } from "./feature-definition-permissions.js";

/**
 * Quote360 / quotes.view product auth = RBAC ∩ company feature availability.
 * Availability must follow is_feature_enabled (desk-safe), not get_company_entitlements
 * (billing.view-gated) — empty entitlements would fail-closed and break preview.
 */
describe("company permission auth — quotes.view desk role", () => {
  const featurePermissions = groupPermissionsByFeature([
    { feature_code: "opportunities", permission_code: "quotes.view", is_active: true },
    { feature_code: "opportunities", permission_code: "quotes.send", is_active: true },
  ]);

  it("grants quotes.view when RBAC holds and opportunities is enabled", () => {
    const isPermissionAvailable = createPermissionAvailabilityChecker({
      isSuperAdmin: false,
      isReady: true,
      featurePermissions,
      isFeatureEnabled: (code) => code === "opportunities",
    });
    const hasCompanyPermission = createCompanyPermissionChecker({
      isSuperAdmin: false,
      hasRbacPermission: (code) => code === "quotes.view" || code === "quotes.send",
      isPermissionAvailable,
    });

    assert.equal(hasCompanyPermission("quotes.view"), true);
    assert.equal(hasCompanyPermission("quotes.send"), true);
  });

  it("denies quotes.view when no feature is reported enabled (billing-gated empty map)", () => {
    const isPermissionAvailable = createPermissionAvailabilityChecker({
      isSuperAdmin: false,
      isReady: true,
      featurePermissions,
      isFeatureEnabled: () => false,
    });
    const hasCompanyPermission = createCompanyPermissionChecker({
      isSuperAdmin: false,
      hasRbacPermission: (code) => code === "quotes.view",
      isPermissionAvailable,
    });

    assert.equal(hasCompanyPermission("quotes.view"), false);
  });

  it("fail-closed while feature readiness is false", () => {
    const isPermissionAvailable = createPermissionAvailabilityChecker({
      isSuperAdmin: false,
      isReady: false,
      featurePermissions,
      isFeatureEnabled: () => true,
    });
    assert.equal(isPermissionAvailable("quotes.view"), false);
  });
});
