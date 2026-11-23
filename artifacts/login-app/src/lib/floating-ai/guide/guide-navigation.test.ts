import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GuideEffectiveAuth } from "./guide-auth";
import { authorizeGuideNavigation, resolveGuideRouteIdFromNestedPath } from "./guide-navigation";

function auth(codes: string[], overrides: Partial<GuideEffectiveAuth> = {}): GuideEffectiveAuth {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    permissionCodes: codes,
    permissionsAvailable: true,
    ...overrides,
  };
}

describe("Phase 1C Guide navigation", () => {
  it("opens authorized destinations with registry nested paths", () => {
    const result = authorizeGuideNavigation(auth(["customers.view"]), {
      kind: "route",
      routeId: "customers",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.routeId, "customers");
      assert.equal(result.nestedPath, "/customers");
      assert.match(result.href, /customers/);
    }
  });

  it("rejects unauthorized destinations", () => {
    const result = authorizeGuideNavigation(auth(["tickets.view"]), {
      kind: "route",
      routeId: "customers",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "unauthorized");
      assert.ok(result.missingPermissions.includes("customers.view"));
    }
  });

  it("rejects unknown routes", () => {
    const result = authorizeGuideNavigation(auth(["customers.view"]), {
      kind: "route",
      routeId: "totally-fake-module",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unknown_route");
  });

  it("authorizes task navigation only when task permissions pass", () => {
    const denied = authorizeGuideNavigation(auth(["customers.view"]), {
      kind: "task",
      taskId: "customers.create",
    });
    assert.equal(denied.ok, false);

    const allowed = authorizeGuideNavigation(auth(["customers.view", "customers.create"]), {
      kind: "task",
      taskId: "customers.create",
    });
    assert.equal(allowed.ok, true);
  });

  it("resolves nested paths to known registry ids only", () => {
    assert.equal(resolveGuideRouteIdFromNestedPath("/whatsapp"), "whatsapp");
    assert.equal(resolveGuideRouteIdFromNestedPath("/does-not-exist"), null);
  });

  it("fail-closes navigation when permissions are unavailable", () => {
    const result = authorizeGuideNavigation(auth(["customers.view"], { permissionsAvailable: false }), {
      kind: "route",
      routeId: "customers",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_context");
  });

  it("denies navigation when userId is missing", () => {
    const result = authorizeGuideNavigation(auth(["customers.view"], { userId: null }), {
      kind: "route",
      routeId: "customers",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_context");
  });

  it("denies navigation when companyId is missing", () => {
    const result = authorizeGuideNavigation(auth(["customers.view"], { companyId: null }), {
      kind: "route",
      routeId: "customers",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_context");
  });

  it("denies navigation when both userId and companyId are missing", () => {
    const result = authorizeGuideNavigation(
      auth(["customers.view"], { userId: null, companyId: null }),
      { kind: "route", routeId: "customers" },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_context");
  });

  it("denies navigation for empty/whitespace identity or tenant ids (stale context)", () => {
    const emptyUser = authorizeGuideNavigation(auth(["customers.view"], { userId: "   " }), {
      kind: "route",
      routeId: "customers",
    });
    const emptyCompany = authorizeGuideNavigation(auth(["customers.view"], { companyId: "" }), {
      kind: "route",
      routeId: "customers",
    });
    assert.equal(emptyUser.ok, false);
    assert.equal(emptyCompany.ok, false);
    if (!emptyUser.ok) assert.equal(emptyUser.reason, "missing_context");
    if (!emptyCompany.ok) assert.equal(emptyCompany.reason, "missing_context");
  });

  it("denies navigation when permission codes are empty even with identity", () => {
    const result = authorizeGuideNavigation(auth([]), {
      kind: "route",
      routeId: "customers",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unauthorized");
  });

  it("allows navigation with valid identity + company + authorized permissions", () => {
    const result = authorizeGuideNavigation(
      auth(["customers.view"], {
        userId: "d0000002-0001-4001-8001-000000000002",
        companyId: "d0000010-0001-4001-8001-000000000002",
      }),
      { kind: "route", routeId: "customers" },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.routeId, "customers");
  });

  it("denies commercial routes when entitlement lookup is missing", () => {
    const result = authorizeGuideNavigation(auth(["whatsapp.view"]), {
      kind: "route",
      routeId: "whatsapp",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unauthorized");
  });

  it("allows commercial routes only when entitlement passes with full context", () => {
    const result = authorizeGuideNavigation(
      auth(["whatsapp.view"], {
        commercialFeatureEnabled: (code) => code === "whatsapp_channel",
      }),
      { kind: "route", routeId: "whatsapp" },
    );
    assert.equal(result.ok, true);
  });

  it("does not allow missing identity even for super admin Guide navigation", () => {
    const result = authorizeGuideNavigation(
      auth([], { isSuperAdmin: true, userId: null, companyId: "company-1" }),
      { kind: "route", routeId: "customers" },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "missing_context");
  });
});
